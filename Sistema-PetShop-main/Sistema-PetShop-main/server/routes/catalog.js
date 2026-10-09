'use strict';

/* ============================================================
   Catálogo: productos (stock y códigos de barras), servicios y proveedores
   ============================================================ */
module.exports = function (H) {
  const { add, db, U, L, HttpError, audit, isAdmin, fmtQty, mapProduct, mapSupplier, mustExist, checkCodes, saveCodes, optSupplier, deductStock, revertStockMovements } = H;

  function productInput(b) {
    const unit = U.oneOf(b.unit || 'u', U.UNITS, 'Se vende');
    const packKg = b.packKg == null || b.packKg === '' ? null : U.reqNum(b.packKg, 'Kilos que trae la bolsa', 0.001, 1000);
    return {
      name: U.reqStr(b.name, 'Nombre', 200),
      brand: U.optStr(b.brand, 100, 'Marca'),
      category: U.oneOf(b.category, U.PROD_CATS, 'Categoría'),
      species: U.optOneOf(b.species, U.SPECIES_OPTS, 'Para'),
      unit,
      price: U.money(b.price, 'Precio de venta'),
      isGift: !!b.isGift,
      min: U.qty(b.min == null || b.min === '' ? 0 : b.min, 'Stock mínimo', unit, { allowZero: true }),
      expires: U.optDate(b.expires, 'Vencimiento'),
      packKg: unit === 'u' ? packKg : null,
      looseId: unit === 'u' && b.looseId ? U.idParam(b.looseId) : null,
      codes: [b.barcode].concat(Array.isArray(b.barcodes) ? b.barcodes : []).filter((x) => x != null && x !== ''),
    };
  }
  /** La bolsa se abre hacia un producto suelto (por kilo) que no sea ella misma. */
  async function checkLoose(q, looseId, selfId) {
    if (!looseId) return null;
    if (looseId === selfId) throw U.bad('El producto suelto tiene que ser otro producto.');
    const r = await q.query('SELECT unit FROM products WHERE id = $1', [looseId]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos el producto suelto. Recargá la página.');
    if (r.rows[0].unit !== 'kg') throw U.bad('El producto suelto tiene que venderse por kilo.');
    return looseId;
  }
  /** Mismo nombre y marca que otro producto: se pide confirmación (puede ser otra presentación). */
  async function checkDuplicate(q, p, selfId, confirm) {
    if (confirm) return;
    const r = await q.query('SELECT name, brand FROM products WHERE lower(name) = lower($1) AND lower(brand) = lower($2) AND id <> $3 LIMIT 1', [p.name, p.brand, selfId || 0]);
    if (r.rows[0]) {
      throw new HttpError(409, 'Ya existe «' + r.rows[0].name + (r.rows[0].brand ? ' – ' + r.rows[0].brand : '') + '». ¿Querés guardarlo igual?', { code: 'duplicate' });
    }
  }
  const snapshot = (r) => (r ? { name: r.name, brand: r.brand, category: r.category, price: Number(r.price), cost: Number(r.cost), min: Number(r.min_stock), unit: r.unit, barcode: r.barcode } : null);

  add('POST', '/api/products', { admin: true }, async (ctx) => {
    const b = ctx.body;
    const p = productInput(b);
    const cost = b.cost == null || b.cost === '' ? 0 : U.money(b.cost, 'Costo');
    L.checkProductPrice(p.price, cost, p.isGift, b.confirmLoss === true);
    await checkDuplicate(db, p, 0, b.confirmDuplicate === true);
    const supplierId = await optSupplier(db, b.supplierId);
    const codes = await checkCodes(db, p.codes, 0);
    const looseId = await checkLoose(db, p.looseId, 0);
    const stock = U.qty(b.stock == null || b.stock === '' ? 0 : b.stock, 'Stock inicial', p.unit, { allowZero: true });
    const total = U.round2(cost * stock);
    const toCash = !!b.cash && total > 0;
    const method = toCash ? U.oneOf(b.method, U.METHODS, 'Forma de pago') : null;
    const today = U.todayAR();
    return db.tx(async (c) => {
      const r = await c.query(
        'INSERT INTO products (name, brand, category, species, unit, stock, min_stock, price, cost, pack_kg, loose_id, supplier_id, expires_on, is_gift) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
        [p.name, p.brand, p.category, p.species, p.unit, stock, p.min, p.price, cost, p.packKg, looseId, supplierId, p.expires, p.isGift]
      );
      const id = r.rows[0].id;
      await saveCodes(c, id, codes);
      if (stock > 0) {
        let cashId = null;
        if (toCash) {
          const cm = await c.query(
            'INSERT INTO cash_movements (on_date, kind, concept, category, method, amount, created_by, supplier_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [today, 'out', 'Compra de mercadería – ' + fmtQty(stock, p.unit) + ' × ' + p.name, 'Compra de mercadería', method, total, ctx.user.id, supplierId]
          );
          cashId = cm.rows[0].id;
        }
        await c.query(
          'INSERT INTO stock_movements (product_id, product_name, on_date, qty, reason, created_by, unit_price, supplier_id, cash_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [id, p.name, today, stock, 'Stock inicial', ctx.user.id, cost, supplierId, cashId]
        );
      }
      await audit(c, ctx, 'Alta de producto', 'producto', id, null, Object.assign(snapshot(r.rows[0]), { stock, codes }));
      return { id };
    });
  });

  add('PUT', '/api/products/:id', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const b = ctx.body;
    const p = productInput(b);
    const cost = b.cost == null || b.cost === '' ? 0 : U.money(b.cost, 'Costo');
    L.checkProductPrice(p.price, cost, p.isGift, b.confirmLoss === true);
    await checkDuplicate(db, p, id, b.confirmDuplicate === true);
    const supplierId = await optSupplier(db, b.supplierId);
    const codes = await checkCodes(db, p.codes, id);
    const looseId = await checkLoose(db, p.looseId, id);
    return db.tx(async (c) => {
      const cur = (await c.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw new HttpError(404, 'No encontramos ese producto. Recargá la página.');
      if (p.unit === 'u' && !Number.isInteger(Number(cur.stock))) throw U.bad('El stock actual tiene decimales: no se puede pasar a venta por unidad. Ajustá el stock primero.');
      if (p.unit === 'u' && cur.unit === 'kg') {
        const n = Number((await c.query('SELECT COUNT(*) AS n FROM products WHERE loose_id = $1', [id])).rows[0].n);
        if (n) throw U.bad('Hay bolsas que se abren hacia este producto suelto: tiene que seguir vendiéndose por kilo.');
      }
      const r = await c.query(
        'UPDATE products SET name = $1, brand = $2, category = $3, species = $4, unit = $5, min_stock = $6, price = $7, cost = $8, pack_kg = $9, loose_id = $10, supplier_id = $11, expires_on = $12, is_gift = $13 WHERE id = $14 RETURNING *',
        [p.name, p.brand, p.category, p.species, p.unit, p.min, p.price, cost, p.packKg, looseId, supplierId, p.expires, p.isGift, id]
      );
      await saveCodes(c, id, codes);
      await audit(c, ctx, 'Edición de producto', 'producto', id, snapshot(cur), Object.assign(snapshot(r.rows[0]), { barcode: codes[0] || null, codes }));
    });
  });

  add('DELETE', '/api/products/:id', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    return db.tx(async (c) => {
      const r = await c.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
      if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese producto. Recargá la página.');
      await audit(c, ctx, 'Baja de producto', 'producto', id, Object.assign(snapshot(r.rows[0]), { stock: Number(r.rows[0].stock) }), null);
    });
  });

  // Buscar un producto por código de barras (normalizado). Responde rápido: el código es clave única.
  add('GET', '/api/products/by-barcode/:code', async (ctx) => {
    const code = L.normalizeBarcode(String(ctx.params.code));
    if (!code) throw U.bad('Escribí o escaneá un código.');
    const r = await db.query('SELECT p.* FROM product_barcodes b JOIN products p ON p.id = b.product_id WHERE b.code = $1', [code]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos ningún producto con el código ' + code + '.', { code: 'barcode_unknown', details: { code } });
    return { code, product: mapProduct(r.rows[0], isAdmin(ctx)) };
  });
  // Asociar un código nuevo a un producto que ya existe (solo el dueño: también sirve para reasignar).
  add('POST', '/api/products/:id/barcodes', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const code = L.normalizeBarcode(String(ctx.body.code || ''));
    if (!code) throw U.bad('Escribí o escaneá un código.');
    return db.tx(async (c) => {
      const p = (await c.query('SELECT name, barcode FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!p) throw new HttpError(404, 'No encontramos ese producto. Recargá la página.');
      const other = (await c.query('SELECT pr.id, pr.name FROM product_barcodes b JOIN products pr ON pr.id = b.product_id WHERE b.code = $1', [code])).rows[0];
      if (other && other.id !== id) {
        if (ctx.body.reassign !== true) throw new HttpError(409, 'El código ' + code + ' ya pertenece a «' + other.name + '». ¿Lo pasás a «' + p.name + '»?', { code: 'barcode_taken' });
        await c.query('DELETE FROM product_barcodes WHERE code = $1', [code]);
        await c.query('UPDATE products SET barcode = (SELECT code FROM product_barcodes WHERE product_id = $1 ORDER BY created_at LIMIT 1) WHERE id = $1', [other.id]);
      }
      if (!other || other.id !== id) await c.query('INSERT INTO product_barcodes (code, product_id) VALUES ($1, $2)', [code, id]);
      if (!p.barcode) await c.query('UPDATE products SET barcode = $1 WHERE id = $2', [code, id]);
      await audit(c, ctx, other && other.id !== id ? 'Reasignación de código' : 'Código asociado', 'producto', id, other ? { code, product: other.name } : null, { code, product: p.name });
      return { ok: true, code };
    });
  });

  /**
   * Ingreso de mercadería (botón + o escáner). Cualquier usuario puede sumar unidades que llegaron.
   * El empleado puede decir cuánto pagó en total (`paid`) y con qué: se registra el egreso en caja y el costo por unidad,
   * y queda en la actividad, pero no ve la caja ni el costo anterior. El precio por unidad, el proveedor y la fecha
   * siguen siendo del dueño: si un empleado los manda, se rechaza.
   */
  add('POST', '/api/products/:id/purchase', async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const b = ctx.body;
    const admin = isAdmin(ctx);
    const prod = (await db.query('SELECT unit, cost, price FROM products WHERE id = $1', [id])).rows[0];
    if (!prod) throw new HttpError(404, 'No encontramos ese producto. Recargá la página.');
    const qty = U.qty(b.qty, 'Cantidad que entra', prod.unit);
    const noPrice = b.unitPrice == null || b.unitPrice === '';
    if (!admin && (!noPrice || b.cash || b.supplierId || b.date)) throw new HttpError(403, 'Solo el dueño o administrador carga el precio por unidad, el proveedor y la fecha. Sumá la cantidad y, si pagaste, cuánto.', { code: 'admin_only' });
    if (noPrice && b.cash) throw U.bad('Escribí el precio de compra para registrar el gasto en caja (o destildá «Registrar como egreso en caja»).');
    // Empleado: lo que pagó en total por lo que llegó (vacío = no pagó en el momento).
    const paid = !admin && b.paid != null && b.paid !== '' ? U.moneyPos(b.paid, 'Cuánto pagaste') : 0;
    const unitPrice = paid > 0 ? U.round2(paid / qty) : noPrice ? 0 : U.moneyPos(b.unitPrice, 'Precio de compra');
    const cost = paid > 0 ? paid : U.round2(unitPrice * qty);
    const date = admin && b.date ? U.pastDate(b.date, 'Fecha de compra') : U.todayAR();
    const toCash = (admin ? !!b.cash : paid > 0) && cost > 0;
    const method = toCash ? U.oneOf(b.method, U.METHODS, 'Forma de pago') : null;
    const supplierId = admin ? await optSupplier(db, b.supplierId) : null;
    const expires = U.optDate(b.expires, 'Vencimiento');
    const reason = b.viaScanner ? 'Ingreso por escáner' : 'Compra';
    return db.tx(async (c) => {
      const r = await c.query(
        'UPDATE products SET stock = stock + $1, cost = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE cost END, expires_on = COALESCE($4, expires_on) WHERE id = $2 RETURNING name, stock, unit, price, cost',
        [qty, id, unitPrice, expires]
      );
      const p = r.rows[0];
      let cashId = null;
      if (toCash) {
        const cm = await c.query(
          'INSERT INTO cash_movements (on_date, kind, concept, category, method, amount, created_by, supplier_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
          [date, 'out', 'Compra de mercadería – ' + fmtQty(qty, p.unit) + ' × ' + p.name, 'Compra de mercadería', method, cost, ctx.user.id, supplierId]
        );
        cashId = cm.rows[0].id;
      }
      const mv = await c.query(
        'INSERT INTO stock_movements (product_id, product_name, on_date, qty, reason, created_by, unit_price, supplier_id, cash_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
        [id, p.name, date, qty, reason, ctx.user.id, unitPrice, supplierId, cashId]
      );
      await audit(c, ctx, reason === 'Compra' ? 'Ingreso de mercadería' : reason, 'producto', id, { cost: Number(prod.cost) }, { qty, unitPrice, cash: toCash ? cost : 0, stock: Number(p.stock) });
      const out = { ok: true, movementId: mv.rows[0].id, stock: Number(p.stock), cost };
      if (admin && unitPrice > 0 && unitPrice !== Number(prod.cost)) {
        out.costChanged = { before: Number(prod.cost), after: unitPrice, margin: L.marginPct(Number(p.price), Number(p.price) - unitPrice) };
      }
      return out;
    });
  });

  // Deshacer un ingreso de mercadería (por ejemplo, se escaneó de más). El dueño puede deshacer cualquiera;
  // el empleado, solo los suyos de hoy.
  add('POST', '/api/stock-movements/:id/undo', async (ctx) => {
    const id = U.idParam(ctx.params.id);
    return db.tx(async (c) => {
      const m = (await c.query('SELECT * FROM stock_movements WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!m || Number(m.qty) <= 0 || m.sale_id) throw new HttpError(404, 'Solo se pueden deshacer ingresos de mercadería.');
      if (m.voided) throw new HttpError(409, 'Ese ingreso ya estaba deshecho.');
      if (!isAdmin(ctx) && (m.created_by !== ctx.user.id || m.on_date !== U.todayAR())) {
        throw new HttpError(403, 'Solo podés deshacer tus ingresos de hoy. Para otros, pedíselo al dueño.', { code: 'admin_only' });
      }
      const delta = await revertStockMovements(c, [id], ctx.user.id);
      if (m.cash_id) await c.query('DELETE FROM cash_movements WHERE id = $1', [m.cash_id]);
      await audit(c, ctx, 'Ingreso deshecho', 'producto', m.product_id, { qty: Number(m.qty) }, { qty: 0 });
      return { ok: true, stockDelta: delta };
    });
  });

  // Corrección de stock (pérdidas, roturas, vencidos, uso en peluquería). No toca la caja.
  add('POST', '/api/products/:id/adjust', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const prod = (await db.query('SELECT unit FROM products WHERE id = $1', [id])).rows[0];
    if (!prod) throw new HttpError(404, 'No encontramos ese producto. Recargá la página.');
    const delta = U.qty(ctx.body.delta, 'Cantidad', prod.unit, { allowNeg: true });
    const reason = U.oneOf(ctx.body.reason, U.ADJUST_REASONS, 'Motivo');
    const note = U.optStr(ctx.body.note, 200, 'Nota');
    return db.tx(async (c) => {
      const r = await c.query('UPDATE products SET stock = stock + $1 WHERE id = $2 AND stock + $1 >= 0 RETURNING name, stock, unit', [delta, id]);
      if (!r.rows[0]) {
        const e = await c.query('SELECT stock, unit FROM products WHERE id = $1', [id]);
        throw new HttpError(409, 'El stock no puede quedar en negativo: hay ' + fmtQty(e.rows[0].stock, e.rows[0].unit) + '.');
      }
      await c.query('INSERT INTO stock_movements (product_id, product_name, on_date, qty, reason, created_by, note) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        id, r.rows[0].name, U.todayAR(), delta, 'Ajuste – ' + reason, ctx.user.id, note,
      ]);
      await audit(c, ctx, 'Ajuste de stock', 'producto', id, { stock: U.round3(Number(r.rows[0].stock) - delta) }, { stock: Number(r.rows[0].stock) }, reason + (note ? ': ' + note : ''));
      return { ok: true, stock: Number(r.rows[0].stock) };
    });
  });

  // Abrir bolsas para vender suelto: resta bolsas cerradas y suma sus kilos al producto suelto (que toma el
  // costo por kilo de la bolsa, así la ganancia de lo vendido suelto se calcula bien).
  add('POST', '/api/products/:id/open-bag', async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const bags = U.qty(ctx.body.bags == null || ctx.body.bags === '' ? 1 : ctx.body.bags, 'Cantidad de bolsas', 'u');
    const today = U.todayAR();
    return db.tx(async (c) => {
      const bag = (await c.query('SELECT name, unit, pack_kg, loose_id, cost FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!bag) throw new HttpError(404, 'No encontramos ese producto. Recargá la página.');
      if (!bag.pack_kg || !bag.loose_id) throw U.bad('Para abrir bolsas, cargá en «Editar» los kilos que trae y el producto suelto al que pasan.');
      const kg = U.round3(bags * Number(bag.pack_kg));
      const d = await deductStock(c, id, bags, 'Bolsa abierta para suelto', today, ctx.user.id);
      const costKg = Number(bag.cost) > 0 ? U.round2(Number(bag.cost) / Number(bag.pack_kg)) : 0;
      const l = await c.query(
        'UPDATE products SET stock = stock + $1, cost = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE cost END WHERE id = $2 RETURNING name, stock',
        [kg, bag.loose_id, costKg]
      );
      if (!l.rows[0]) throw new HttpError(404, 'No encontramos el producto suelto. Revisalo en «Editar».');
      await c.query('INSERT INTO stock_movements (product_id, product_name, on_date, qty, reason, created_by, unit_price, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
        bag.loose_id, l.rows[0].name, today, kg, 'Desde bolsa abierta', ctx.user.id, costKg, bags + ' × ' + d.name,
      ]);
      return { ok: true, kg, loose: l.rows[0].name, looseStock: Number(l.rows[0].stock) };
    });
  });

  // Historial de compras, ventas y ajustes de un producto.
  add('GET', '/api/products/:id/movements', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    await mustExist(db, 'products', id, 'No encontramos ese producto. Recargá la página.');
    const r = await db.query(
      'SELECT m.id, m.on_date, m.qty, m.reason, m.unit_price, m.note, m.voided, s.number AS sale_number, u.name AS who FROM stock_movements m ' +
        'LEFT JOIN sales s ON s.id = m.sale_id LEFT JOIN users u ON u.id = m.created_by WHERE m.product_id = $1 ORDER BY m.on_date DESC, m.id DESC LIMIT 200',
      [id]
    );
    return {
      items: r.rows.map((x) => ({ id: x.id, date: x.on_date, qty: Number(x.qty), reason: x.reason, unitPrice: Number(x.unit_price), note: x.note || '', voided: !!x.voided, saleNumber: x.sale_number, who: x.who || '' })),
    };
  });

  // Actualización masiva de precios: sube (o baja) un porcentaje a una categoría, marca o proveedor, con redondeo.
  add('POST', '/api/products/bulk-price', { admin: true }, async (ctx) => {
    const b = ctx.body;
    const scope = U.oneOf(b.scope, ['all', 'category', 'brand', 'supplier'], 'A qué productos');
    const pct = U.reqNum(b.percent, 'Porcentaje', -90, 1000);
    if (pct === 0) throw U.bad('El porcentaje no puede ser cero.');
    const round = U.oneOf(Number(b.round || 0), [0, 1, 10, 50, 100], 'Redondeo');
    const where = ['NOT is_gift'];
    const params = [1 + pct / 100];
    if (scope === 'category') {
      params.push(U.oneOf(b.value, U.PROD_CATS, 'Categoría'));
      where.push('category = $2');
    } else if (scope === 'brand') {
      params.push(U.reqStr(b.value, 'Marca', 100).toLowerCase());
      where.push('lower(brand) = $2');
    } else if (scope === 'supplier') {
      params.push(U.idParam(b.value));
      where.push('supplier_id = $2');
    }
    const expr = round > 0 ? 'GREATEST(ROUND(price * $1 / ' + round + ') * ' + round + ', 0)' : 'ROUND(price * $1, 2)';
    return db.tx(async (c) => {
      const r = await c.query('UPDATE products SET price = ' + expr + ' WHERE ' + where.join(' AND ') + ' RETURNING id', params);
      await audit(c, ctx, 'Actualización de precios', 'producto', null, null, { scope, value: b.value || null, percent: pct, round, updated: r.rowCount });
      return { ok: true, updated: r.rowCount };
    });
  });

  /* ---------- Servicios (baño y peluquería) ---------- */
  function serviceInput(b) {
    return [
      U.reqStr(b.name, 'Servicio', 200),
      U.oneOf(b.category, U.SERV_CATS, 'Categoría'),
      U.money(b.price, 'Precio'),
      U.reqInt(b.duration == null || b.duration === '' ? 60 : b.duration, 'Duración', 5, 600),
    ];
  }
  add('POST', '/api/services', { admin: true }, async (ctx) => {
    const v = serviceInput(ctx.body);
    const r = await db.query('INSERT INTO services (name, category, price, duration_min) VALUES ($1, $2, $3, $4) RETURNING id', v);
    await audit(db, ctx, 'Alta de servicio', 'servicio', r.rows[0].id, null, { name: v[0], price: v[2] });
    return { id: r.rows[0].id };
  });
  add('PUT', '/api/services/:id', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const v = serviceInput(ctx.body);
    const cur = (await db.query('SELECT name, price FROM services WHERE id = $1', [id])).rows[0];
    if (!cur) throw new HttpError(404, 'No encontramos ese servicio. Recargá la página.');
    await db.query('UPDATE services SET name = $1, category = $2, price = $3, duration_min = $4 WHERE id = $5', v.concat([id]));
    if (Number(cur.price) !== v[2]) await audit(db, ctx, 'Cambio de precio de servicio', 'servicio', id, { price: Number(cur.price) }, { price: v[2] });
  });
  add('DELETE', '/api/services/:id', { admin: true }, async (ctx) => {
    await db.query('DELETE FROM services WHERE id = $1', [U.idParam(ctx.params.id)]);
  });

  /* ---------- Proveedores (todos los consultan; el dueño los edita) ---------- */
  function supplierInput(b) {
    const ph = U.optPhone(b.phone);
    return [U.reqStr(b.name, 'Nombre', 200), ph.phone, U.checkEmail(U.optStr(b.email, 150, 'Email')), U.optStr(b.description, 1000, 'Qué se le compra'), ph.norm];
  }
  add('GET', '/api/suppliers', async () => {
    const r = await db.query(
      'SELECT s.id, s.name, s.phone, s.email, s.description, ' +
        '(SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS products, ' +
        "(SELECT COUNT(*) FROM cash_movements c WHERE c.supplier_id = s.id AND c.kind = 'out') AS purchases " +
        'FROM suppliers s ORDER BY lower(s.name), s.id'
    );
    return { items: r.rows.map((x) => Object.assign(mapSupplier(x), { productCount: Number(x.products), purchaseCount: Number(x.purchases) })) };
  });
  // Ficha de un proveedor: sus productos y lo que se le pagó (son montos: solo el dueño).
  add('GET', '/api/suppliers/:id/detail', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const sup = (await db.query('SELECT id, name, phone, email, description FROM suppliers WHERE id = $1', [id])).rows[0];
    if (!sup) throw new HttpError(404, 'No encontramos ese proveedor. Recargá la página.');
    const [prods, buys] = await Promise.all([
      db.query('SELECT id, name, category, unit, stock, min_stock FROM products WHERE supplier_id = $1 ORDER BY lower(name)', [id]),
      db.query("SELECT on_date, concept, amount FROM cash_movements WHERE supplier_id = $1 AND kind = 'out' ORDER BY on_date DESC, id DESC LIMIT 300", [id]),
    ]);
    const purchases = buys.rows.map((x) => ({ date: x.on_date, concept: x.concept, total: Number(x.amount) }));
    return {
      supplier: mapSupplier(sup),
      products: prods.rows.map((x) => ({ id: x.id, name: x.name, category: x.category, unit: x.unit, stock: Number(x.stock), min: Number(x.min_stock) })),
      purchases,
      totalSpent: U.round2(purchases.reduce((n, x) => n + x.total, 0)),
    };
  });
  add('POST', '/api/suppliers', { admin: true }, async (ctx) => {
    const v = supplierInput(ctx.body);
    const r = await db.query('INSERT INTO suppliers (name, phone, email, description, phone_norm) VALUES ($1, $2, $3, $4, $5) RETURNING id', v);
    await audit(db, ctx, 'Alta de proveedor', 'proveedor', r.rows[0].id, null, { name: v[0], phone: v[1] });
    return { id: r.rows[0].id };
  });
  add('PUT', '/api/suppliers/:id', { admin: true }, async (ctx) => {
    const r = await db.query(
      'UPDATE suppliers SET name = $1, phone = $2, email = $3, description = $4, phone_norm = $5 WHERE id = $6 RETURNING id',
      supplierInput(ctx.body).concat([U.idParam(ctx.params.id)])
    );
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese proveedor. Recargá la página.');
  });
  add('DELETE', '/api/suppliers/:id', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const r = await db.query('DELETE FROM suppliers WHERE id = $1 RETURNING name', [id]);
    if (r.rows[0]) await audit(db, ctx, 'Baja de proveedor', 'proveedor', id, { name: r.rows[0].name }, null);
  });
};
