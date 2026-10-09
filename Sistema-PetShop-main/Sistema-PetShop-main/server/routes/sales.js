'use strict';

/* ============================================================
   Ventas y caja
   ============================================================ */
module.exports = function (H) {
  const { add, db, U, L, HttpError, audit, isAdmin, fullName, fmtQty, getSettings, mapCash, drawerAt, cashSummary, optSupplier, revertStockMovements } = H;

  /**
   * Registrar una venta. El precio, el descuento, el total y la ganancia se calculan acá con los precios de la
   * base: lo que mande el navegador como precio se ignora, salvo que sea el dueño con un motivo (queda auditado).
   * Descuenta el stock, registra un ingreso en caja por cada forma de pago y, si viene de un turno, lo marca entregado.
   *
   * Rendimiento: cada consulta es un viaje de ida y vuelta a la base (lento si la base está en otra región), así que
   * la venta se arma con pocas consultas fijas, sin importar cuántas líneas tenga: leer los artículos, descontar el
   * stock de todos juntos y una sola instrucción que numera e inserta venta, líneas, movimientos, caja y pagos.
   */
  const SALE_INSERT =
    'WITH n AS (UPDATE counters SET value = value + 1 WHERE name = \'sale\' RETURNING value), ' +
    "cm AS (INSERT INTO cash_movements (on_date, kind, concept, category, method, amount, created_by) " +
    "SELECT $1, 'in', 'Venta N° ' || n.value || ' – ' || $2, 'Ventas', p.method, p.amount, $3 FROM n, unnest($4::text[], $5::numeric[]) AS p(method, amount) WHERE p.amount > 0 RETURNING id, method), " +
    's AS (INSERT INTO sales (number, on_date, client_id, pet_id, method, subtotal, discount, total, cost_total, note, created_by, idem_key, cash_id) ' +
    'SELECT n.value, $1, $6, $7, $8, $9, $10, $11, $12, $13, $3, $14, (SELECT MIN(id) FROM cm) FROM n RETURNING id, number), ' +
    'it AS (INSERT INTO sale_items (sale_id, kind, product_id, service_id, name, category, unit, qty, unit_price, list_price, price_reason, unit_cost, amount) ' +
    "SELECT s.id, l.kind, CASE WHEN l.kind = 'product' THEN l.ref END, CASE WHEN l.kind = 'service' THEN l.ref END, l.name, l.category, l.unit, l.qty, l.price, l.list_price, l.reason, l.cost, l.amount " +
    'FROM s, unnest($15::text[], $16::int[], $17::text[], $18::text[], $19::text[], $20::numeric[], $21::numeric[], $22::numeric[], $23::text[], $24::numeric[], $25::numeric[]) ' +
    'AS l(kind, ref, name, category, unit, qty, price, list_price, reason, cost, amount) RETURNING id), ' +
    'mv AS (INSERT INTO stock_movements (product_id, product_name, on_date, qty, reason, created_by, unit_price, sale_id, note) ' +
    "SELECT m.pid, m.name, $1, -m.qty, 'Venta', $3, m.price, s.id, '' FROM s, unnest($26::int[], $27::text[], $28::numeric[], $29::numeric[]) AS m(pid, name, qty, price) RETURNING id), " +
    'sp AS (INSERT INTO sale_payments (sale_id, method, amount, cash_id) SELECT s.id, p.method, p.amount, cm.id FROM s CROSS JOIN unnest($4::text[], $5::numeric[]) AS p(method, amount) LEFT JOIN cm ON cm.method = p.method RETURNING id), ' +
    "ap AS (UPDATE appointments SET sale_id = s.id, status = 'entregado', finished_at = COALESCE(finished_at, now()) FROM s WHERE appointments.id = $30 RETURNING appointments.id) " +
    'SELECT s.id, s.number, (SELECT COUNT(*) FROM ap) AS appt FROM s';
  H.SALE_INSERT = SALE_INSERT;

  /** Descuenta el stock de todos los productos de la venta en una consulta. Si a alguno no le alcanza, no descuenta nada. */
  async function deductSaleStock(c, lines) {
    const need = new Map();
    lines.filter((l) => l.type === 'product').forEach((l) => need.set(l.id, U.round3((need.get(l.id) || 0) + l.qty)));
    if (!need.size) return;
    const ids = [...need.keys()];
    const r = await c.query(
      'UPDATE products p SET stock = p.stock - v.qty FROM unnest($1::int[], $2::numeric[]) AS v(id, qty) WHERE p.id = v.id AND p.stock >= v.qty RETURNING p.id',
      [ids, ids.map((id) => need.get(id))]
    );
    if (r.rows.length === ids.length) return;
    // A alguno no le alcanza: la transacción se deshace entera y se avisa cuál (el primero en el orden de la venta).
    const done = new Set(r.rows.map((x) => x.id));
    const id = ids.find((x) => !done.has(x));
    const e = (await c.query('SELECT name, stock, unit FROM products WHERE id = $1', [id])).rows[0];
    if (!e) throw new HttpError(404, 'Uno de los productos ya no existe. Recargá la página.');
    throw new HttpError(409, 'No hay stock suficiente de ' + e.name + ': quedan ' + fmtQty(Math.max(0, e.stock), e.unit) + '.', { code: 'no_stock' });
  }

  const repeatedSale = (dup) => ({ ok: true, id: dup.id, number: dup.number, total: Number(dup.total), discount: Number(dup.discount), repeated: true });

  add('POST', '/api/sales', async (ctx) => {
    const b = ctx.body;
    const admin = isAdmin(ctx);
    // El empleado vende con fecha de hoy; el dueño puede cargar una venta de un día anterior.
    const date = admin && b.date ? U.pastDate(b.date, 'Fecha de la venta') : U.todayAR();
    const raw = Array.isArray(b.items) ? b.items : [];
    if (!raw.length) throw U.bad('Agregá al menos un producto o servicio a la venta.');
    if (raw.length > 50) throw U.bad('La venta tiene demasiadas líneas (máximo 50).');
    const note = U.optStr(b.note, 300, 'Nota');
    const clientId = b.clientId ? U.idParam(b.clientId) : null;
    const petId = b.petId ? U.idParam(b.petId) : null;
    const apptId = b.appointmentId ? U.idParam(b.appointmentId) : null;
    const idem = b.idemKey == null || b.idemKey === '' ? null : U.optStr(String(b.idemKey), 80);
    const wanted = raw.map((it) => {
      if (!it || typeof it !== 'object') throw U.bad('Hay una línea de la venta que no se pudo leer. Recargá la página.');
      return { type: U.oneOf(it.type, ['product', 'service'], 'Tipo de artículo'), id: U.idParam(it.id), it };
    });
    const settings = await getSettings();
    try {
      return await db.tx(async (c) => {
        // Artículos, cliente, mascota y venta repetida (misma clave) en una sola lectura.
        const pIds = wanted.filter((w) => w.type === 'product').map((w) => w.id);
        const sIds = wanted.filter((w) => w.type === 'service').map((w) => w.id);
        const found = await c.query(
          "SELECT 'product' AS type, id, name, category, unit, price, cost, expires_on AS expires FROM products WHERE id = ANY($1::int[]) " +
            "UNION ALL SELECT 'service', id, name, category, 'u', price, 0, NULL FROM services WHERE id = ANY($2::int[]) " +
            "UNION ALL SELECT 'client', id, '', '', '', 0, 0, NULL FROM clients WHERE id = $3 " +
            "UNION ALL SELECT 'pet', client_id, '', '', '', 0, 0, NULL FROM pets WHERE id = $4 " +
            "UNION ALL SELECT 'dup', id, number::text, '', '', total, discount, NULL FROM sales WHERE idem_key = $5",
          [pIds, sIds, clientId, petId, idem]
        );
        // Doble clic o reintento con la misma clave: se devuelve la venta ya registrada, no se crea otra.
        const dup = found.rows.find((x) => x.type === 'dup');
        if (dup) return repeatedSale({ id: dup.id, number: Number(dup.name), total: dup.price, discount: dup.cost });
        const byKey = {};
        found.rows.forEach((x) => (byKey[x.type + ':' + x.id] = x));
        const pet = found.rows.find((x) => x.type === 'pet');
        if (clientId && !found.rows.some((x) => x.type === 'client')) throw new HttpError(404, 'No encontramos ese cliente. Recargá la página.');
        if (petId) {
          if (!pet) throw new HttpError(404, 'No encontramos esa mascota. Recargá la página.');
          if (clientId && pet.id !== clientId) throw U.bad('La mascota elegida no es de ese cliente.');
        }
        const items = wanted.map((w) => {
          const src = byKey[w.type + ':' + w.id];
          if (!src) throw new HttpError(404, 'Uno de los artículos ya no existe. Recargá la página.');
          return { type: w.type, id: w.id, qty: U.qty(w.it.qty == null || w.it.qty === '' ? 1 : w.it.qty, 'Cantidad de ' + src.name, src.unit), price: w.it.price, reason: w.it.reason, src };
        });
        const sale = L.priceSale(items, b.discount, { admin, today: U.todayAR(), confirmExpired: b.confirmExpired === true });
        const pays = L.splitPayments(sale.total, b.method, b.payments, settings.methods);
        await deductSaleStock(c, sale.lines);
        const label = sale.lines.length === 1 ? (sale.lines[0].qty !== 1 ? fmtQty(sale.lines[0].qty, sale.lines[0].unit) + ' × ' : '') + sale.lines[0].name : sale.lines.length + ' artículos';
        const L_ = sale.lines;
        const prods = L_.filter((l) => l.type === 'product');
        const params = [
          date, label + (pays.length > 1 ? ' (pago mixto)' : ''), ctx.user.id, pays.map((p) => p.method), pays.map((p) => p.amount),
          clientId, petId, pays.length > 1 ? 'Mixto' : pays[0].method, sale.subtotal, sale.discount, sale.total, sale.costTotal, note, idem,
          L_.map((l) => l.type), L_.map((l) => l.id), L_.map((l) => l.name), L_.map((l) => l.category), L_.map((l) => l.unit), L_.map((l) => l.qty),
          L_.map((l) => l.price), L_.map((l) => l.listPrice), L_.map((l) => l.reason || ''), L_.map((l) => l.cost), L_.map((l) => l.amount),
          prods.map((l) => l.id), prods.map((l) => l.name), prods.map((l) => l.qty), prods.map((l) => l.price), apptId,
        ];
        let ins = await c.query(SALE_INSERT, params);
        if (!ins.rows[0]) {
          // Base sin contador (no debería pasar: lo crea db/schema.sql): se crea y se reintenta.
          await c.query("INSERT INTO counters (name, value) SELECT 'sale', COALESCE(MAX(number), 0) FROM sales ON CONFLICT (name) DO NOTHING");
          ins = await c.query(SALE_INSERT, params);
        }
        const saleId = ins.rows[0].id;
        const number = ins.rows[0].number;
        if (apptId && !Number(ins.rows[0].appt)) throw new HttpError(404, 'No encontramos ese turno. Recargá la agenda.');
        for (const ln of L_.filter((l) => l.reason)) {
          await audit(c, ctx, 'Precio manual', 'venta', saleId, { item: ln.name, price: ln.listPrice }, { item: ln.name, price: ln.price, number }, ln.reason);
        }
        return {
          ok: true, id: saleId, number, total: sale.total, discount: sale.discount,
          // Para que la pantalla actualice el stock y la caja sin volver a pedir todo.
          stock: prods.map((l) => ({ id: l.id, qty: l.qty })),
          payments: pays.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount })),
          date,
          lossLines: admin ? L_.filter((l) => l.type === 'product' && l.cost > 0 && l.amount < l.cost * l.qty).map((l) => l.name) : [],
        };
      });
    } catch (e) {
      // Dos pedidos simultáneos con la misma clave: el segundo choca con el índice único y devuelve la venta del primero.
      if (idem && e.code === '23505') {
        const dup = (await db.query('SELECT id, number, total, discount FROM sales WHERE idem_key = $1', [idem])).rows[0];
        if (dup) return repeatedSale(dup);
      }
      throw e;
    }
  });

  const SALE_COLS =
    's.id, s.number, s.on_date, s.method, s.subtotal, s.discount, s.total, s.cost_total, s.note, s.voided_at, s.void_reason, s.created_at, s.client_id, s.pet_id, ' +
    'c.first_name, c.last_name, pt.name AS pet_name, u.name AS seller';
  const SALE_FROM = ' FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN pets pt ON pt.id = s.pet_id LEFT JOIN users u ON u.id = s.created_by';
  const mapSale = (r, admin) => ({
    id: r.id,
    number: r.number || r.id,
    date: r.on_date,
    createdAt: r.created_at,
    method: r.method,
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    total: Number(r.total),
    profit: admin ? U.round2(Number(r.total) - Number(r.cost_total)) : null,
    note: r.note,
    voided: !!r.voided_at,
    voidReason: r.void_reason,
    clientId: r.client_id || null,
    client: r.first_name != null ? fullName(r.first_name, r.last_name) : '',
    pet: r.pet_name || '',
    seller: r.seller || '',
    summary: r.summary || '',
  });
  H.SALE_COLS = SALE_COLS;
  H.SALE_FROM = SALE_FROM;
  H.mapSale = mapSale;

  // Lista de ventas. El empleado ve solo las de hoy (para reimprimir un ticket); el dueño, cualquier período.
  // Búsqueda opcional por número, artículo o cliente.
  add('GET', '/api/sales', async (ctx) => {
    const admin = isAdmin(ctx);
    const today = U.todayAR();
    let from = today;
    let to = today;
    if (admin && (ctx.query.get('from') || ctx.query.get('to'))) {
      from = U.reqDate(ctx.query.get('from') || '', 'Desde');
      to = U.reqDate(ctx.query.get('to') || '', 'Hasta');
      if (to < from) throw U.bad('«Hasta» no puede ser anterior a «Desde».');
    }
    const params = [from, to];
    let extra = '';
    const q = U.optStr(ctx.query.get('q'), 100);
    if (q) {
      params.push('%' + q.toLowerCase() + '%');
      extra =
        " AND (CAST(s.number AS TEXT) = $4 OR EXISTS (SELECT 1 FROM sale_items i WHERE i.sale_id = s.id AND lower(i.name) LIKE $3) OR lower(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE $3)";
      params.push(q.replace(/\D/g, '') || '-1');
    }
    const r = await db.query(
      'SELECT ' + SALE_COLS + ", (SELECT string_agg(i.name, ', ' ORDER BY i.id) FROM sale_items i WHERE i.sale_id = s.id) AS summary" +
        SALE_FROM + ' WHERE s.on_date BETWEEN $1 AND $2' + extra + ' ORDER BY s.on_date DESC, s.number DESC LIMIT 1000',
      params
    );
    const items = r.rows.map((x) => mapSale(x, admin));
    const ok = items.filter((x) => !x.voided);
    return {
      from, to, items, limited: r.rows.length === 1000,
      totals: { count: ok.length, total: U.round2(ok.reduce((n, x) => n + x.total, 0)), profit: admin ? U.round2(ok.reduce((n, x) => n + x.profit, 0)) : null },
    };
  });

  add('GET', '/api/sales/:id', async (ctx) => {
    const admin = isAdmin(ctx);
    const id = U.idParam(ctx.params.id);
    const r = await db.query('SELECT ' + SALE_COLS + SALE_FROM + ' WHERE s.id = $1', [id]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos esa venta. Recargá la página.');
    if (!admin && r.rows[0].on_date !== U.todayAR()) throw new HttpError(403, 'Solo podés ver las ventas de hoy.', { code: 'admin_only' });
    const [it, pay] = await Promise.all([
      db.query('SELECT kind, name, unit, qty, unit_price, list_price, price_reason, unit_cost, amount FROM sale_items WHERE sale_id = $1 ORDER BY id', [id]),
      db.query('SELECT method, amount FROM sale_payments WHERE sale_id = $1 ORDER BY id', [id]),
    ]);
    return Object.assign(mapSale(r.rows[0], admin), {
      items: it.rows.map((x) => ({
        kind: x.kind, name: x.name, unit: x.unit, qty: Number(x.qty), price: Number(x.unit_price), listPrice: Number(x.list_price),
        priceReason: x.price_reason, cost: admin ? Number(x.unit_cost) : null, amount: Number(x.amount),
      })),
      payments: pay.rows.map((x) => ({ method: x.method, amount: Number(x.amount) })),
    });
  });

  // Anular una venta: motivo obligatorio. Devuelve el stock, quita los ingresos de la caja y la deja marcada como
  // anulada (conserva su número). Queda en el registro de actividad.
  add('POST', '/api/sales/:id/void', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const reason = U.optStr(ctx.body.reason, 200, 'Motivo');
    if (reason.length < 3) throw U.bad('Escribí el motivo de la anulación (al menos 3 letras).');
    return db.tx(async (c) => {
      const s = (await c.query('SELECT number, total, voided_at FROM sales WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!s) throw new HttpError(404, 'No encontramos esa venta. Recargá la página.');
      if (s.voided_at) throw new HttpError(409, 'Esa venta ya estaba anulada.');
      const mv = await c.query('SELECT id FROM stock_movements WHERE sale_id = $1 AND NOT voided ORDER BY id', [id]);
      const stockDelta = await revertStockMovements(c, mv.rows.map((x) => x.id), ctx.user.id);
      const cash = await c.query('SELECT cash_id FROM sale_payments WHERE sale_id = $1 AND cash_id IS NOT NULL', [id]);
      await c.query('UPDATE sales SET voided_at = now(), void_reason = $2, cash_id = NULL WHERE id = $1', [id, reason]);
      await c.query('UPDATE sale_payments SET cash_id = NULL WHERE sale_id = $1', [id]);
      for (const x of cash.rows) await c.query('DELETE FROM cash_movements WHERE id = $1', [x.cash_id]);
      // Un turno cobrado con esta venta vuelve a quedar "listo para retirar" (sin cobrar).
      await c.query("UPDATE appointments SET sale_id = NULL, status = 'listo' WHERE sale_id = $1", [id]);
      await audit(c, ctx, 'Anulación de venta', 'venta', id, { number: s.number, total: Number(s.total) }, { voided: true }, reason);
      return { ok: true, stockDelta };
    });
  });

  /* ============================================================
     Caja (solo el dueño)
     ============================================================ */
  function cashFilter(q) {
    const today = U.todayAR();
    const where = [];
    const params = [];
    const p = (v) => {
      params.push(v);
      return '$' + params.length;
    };
    const period = q.get('period') || 'month';
    if (period === 'today') where.push('c.on_date = ' + p(today));
    else if (period === 'month') {
      where.push('c.on_date >= ' + p(today.slice(0, 7) + '-01'));
      where.push('c.on_date <= ' + p(U.monthEnd(today)));
    } else if (period === 'prev') {
      const prevFrom = U.monthStart(today, 1);
      where.push('c.on_date >= ' + p(prevFrom));
      where.push('c.on_date <= ' + p(U.monthEnd(prevFrom)));
    } else if (period === 'range') {
      const from = U.reqDate(q.get('from') || '', 'Desde');
      const to = U.reqDate(q.get('to') || '', 'Hasta');
      if (to < from) throw U.bad('«Hasta» no puede ser anterior a «Desde».');
      where.push('c.on_date >= ' + p(from));
      where.push('c.on_date <= ' + p(to));
    }
    const type = q.get('type');
    if (type === 'in' || type === 'out') where.push('c.kind = ' + p(type));
    const group = q.get('group');
    if (group === 'Efectivo') where.push('c.method = ' + p('Efectivo'));
    else if (group === 'Transferencia') where.push('c.method = ' + p('Transferencia'));
    else if (group === 'Tarjeta') where.push("c.method IN ('Tarjeta de débito', 'Tarjeta de crédito')");
    const text = U.optStr(q.get('q'), 100);
    if (text) where.push('(lower(c.concept) LIKE ' + p('%' + text.toLowerCase() + '%') + ' OR lower(c.category) LIKE $' + params.length + ')');
    return { where: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
  }
  add('GET', '/api/cash', { admin: true }, async (ctx) => {
    const f = cashFilter(ctx.query);
    const r = await db.query(
      'SELECT c.id, c.on_date, c.kind, c.concept, c.category, c.method, c.amount, ' +
        '(SELECT sp.sale_id FROM sale_payments sp WHERE sp.cash_id = c.id LIMIT 1) AS sale_id, ' +
        'COALESCE((SELECT SUM(-m.qty) FROM stock_movements m WHERE m.cash_id = c.id AND NOT m.voided AND m.product_id IS NOT NULL), 0) AS stock_delta ' +
        'FROM cash_movements c' + f.where + ' ORDER BY c.on_date DESC, c.id DESC LIMIT 1000',
      f.params
    );
    return { items: r.rows.map(mapCash), limited: r.rows.length === 1000 };
  });

  const fmtD = (d) => String(d).slice(8, 10) + '/' + String(d).slice(5, 7) + '/' + String(d).slice(0, 4);
  const num = (n) => String(Number(n)).replace('.', ',');
  function sendCsv(ctx, name, header, rows) {
    const body = L.csvDoc(header, rows);
    ctx.res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + name + '"',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    ctx.res.end(body);
    return U.HANDLED;
  }
  Object.assign(H, { sendCsv, fmtD, num });

  add('GET', '/api/cash/export', { admin: true }, async (ctx) => {
    const f = cashFilter(ctx.query);
    const r = await db.query(
      'SELECT c.on_date, c.kind, c.concept, c.category, c.method, c.amount, ' +
        "COALESCE(sup.name, (SELECT trim(cl.first_name || ' ' || cl.last_name) FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id JOIN clients cl ON cl.id = s.client_id WHERE sp.cash_id = c.id LIMIT 1), '') AS who " +
        'FROM cash_movements c LEFT JOIN suppliers sup ON sup.id = c.supplier_id' + f.where + ' ORDER BY c.on_date, c.id LIMIT 50000',
      f.params
    );
    return sendCsv(
      ctx,
      'movimientos-' + U.todayAR() + '.csv',
      ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Forma de pago', 'Monto', 'Proveedor / Cliente'],
      r.rows.map((x) => [fmtD(x.on_date), x.kind === 'in' ? 'Ingreso' : 'Egreso', x.concept, x.category, x.method, num(x.amount), x.who])
    );
  });

  add('GET', '/api/cash/summary', { admin: true }, async () => cashSummary());

  add('POST', '/api/cash', { admin: true }, async (ctx) => {
    const b = ctx.body;
    const date = U.reqDate(b.date, 'Fecha');
    // Una fecha futura se permite, pero solo si el usuario la confirmó (el servidor lo exige).
    if (date > U.todayAR() && b.confirmFuture !== true) throw new HttpError(409, 'La fecha es posterior a hoy. ¿Es correcta?', { code: 'future_date' });
    const kind = U.oneOf(b.type, ['in', 'out'], 'Tipo de movimiento');
    const supplierId = kind === 'out' ? await optSupplier(db, b.supplierId) : null;
    const row = {
      date,
      kind,
      concept: U.reqStr(b.concept, 'Concepto', 200),
      category: U.oneOf(b.category, kind === 'in' ? U.CASH_IN_CATS : U.CASH_OUT_CATS, 'Categoría'),
      method: U.oneOf(b.method, U.METHODS, 'Forma de pago'),
      amount: U.moneyPos(b.amount, 'Monto'),
    };
    return db.tx(async (c) => {
      const r = await c.query(
        'INSERT INTO cash_movements (on_date, kind, concept, category, method, amount, created_by, supplier_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [row.date, row.kind, row.concept, row.category, row.method, row.amount, ctx.user.id, supplierId]
      );
      await audit(c, ctx, kind === 'in' ? 'Ingreso de caja' : 'Gasto de caja', 'caja', r.rows[0].id, null, row);
      return { id: r.rows[0].id };
    });
  });

  // Eliminar el egreso de una compra de mercadería también resta del stock lo que se había sumado.
  // Los ingresos de una venta no se eliminan acá: se anula la venta (así también vuelve el stock).
  add('DELETE', '/api/cash/:id', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    return db.tx(async (c) => {
      const r = await c.query('SELECT * FROM cash_movements WHERE id = $1 FOR UPDATE', [id]);
      if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese movimiento. Recargá la página.');
      const sale = (await c.query('SELECT s.number FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE sp.cash_id = $1', [id])).rows[0];
      if (sale) throw new HttpError(409, 'Este ingreso es de la venta N° ' + sale.number + ': anulala desde «Ventas» (así también vuelve el stock).');
      const mv = await c.query('SELECT id FROM stock_movements WHERE cash_id = $1 ORDER BY id', [id]);
      const stockDelta = await revertStockMovements(c, mv.rows.map((x) => x.id), ctx.user.id);
      await c.query('DELETE FROM cash_movements WHERE id = $1', [id]);
      const x = r.rows[0];
      await audit(c, ctx, 'Movimiento de caja eliminado', 'caja', id, { date: x.on_date, kind: x.kind, concept: x.concept, method: x.method, amount: Number(x.amount) }, null);
      return { ok: true, stockDelta };
    });
  });

  // Cierre de caja: se compara el efectivo que debería haber con el que se contó. Se puede rehacer el mismo día.
  add('GET', '/api/cash/closings', { admin: true }, async () => {
    const r = await db.query('SELECT k.id, k.on_date, k.expected, k.counted, k.difference, k.note, u.name AS who FROM cash_closings k LEFT JOIN users u ON u.id = k.created_by ORDER BY k.on_date DESC LIMIT 60');
    return {
      today: U.todayAR(),
      expected: await drawerAt(db, U.todayAR()),
      items: r.rows.map((x) => ({ id: x.id, date: x.on_date, expected: Number(x.expected), counted: Number(x.counted), difference: Number(x.difference), note: x.note, who: x.who || '' })),
    };
  });
  add('POST', '/api/cash/closings', { admin: true }, async (ctx) => {
    const today = U.todayAR();
    const counted = U.money(ctx.body.counted, 'Efectivo contado');
    const note = U.optStr(ctx.body.note, 300, 'Nota');
    const expected = await drawerAt(db, today);
    const difference = U.round2(counted - expected);
    await db.query(
      'INSERT INTO cash_closings (on_date, expected, counted, difference, note, created_by) VALUES ($1, $2, $3, $4, $5, $6) ' +
        'ON CONFLICT (on_date) DO UPDATE SET expected = EXCLUDED.expected, counted = EXCLUDED.counted, difference = EXCLUDED.difference, note = EXCLUDED.note, created_by = EXCLUDED.created_by, created_at = now()',
      [today, expected, counted, difference, note, ctx.user.id]
    );
    await audit(db, ctx, 'Cierre de caja', 'caja', null, { expected }, { counted, difference }, note);
    return { ok: true, expected, counted, difference };
  });
};
