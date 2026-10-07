'use strict';

const db = require('./db');
const auth = require('./auth');
const backup = require('./backup');
const U = require('./util');
const L = require('./logic');
const { HttpError } = U;

const routes = [];

/**
 * Registra una ruta. opts: { public: true } no pide sesión; { admin: true } solo el dueño/administrador;
 * { limit: bytes } tamaño máximo de los datos que se reciben. La tabla de permisos se prueba en test/permisos.test.js.
 */
function add(method, pattern, opts, fn) {
  if (typeof opts === 'function') {
    fn = opts;
    opts = {};
  }
  const names = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:([a-z]+)/g, (m, n) => {
        names.push(n);
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ method, re, names, opts, fn });
}

function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    return new URL(o).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

async function dispatch(req, res, url) {
  let route = null;
  let match = null;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (m) {
      route = r;
      match = m;
      break;
    }
  }
  if (!route) {
    if (routes.some((r) => r.re.test(url.pathname))) throw new HttpError(405, 'Esa acción no está disponible.');
    throw new HttpError(404, 'No encontramos lo que buscabas. Recargá la página.');
  }
  const params = {};
  try {
    route.names.forEach((n, i) => {
      params[n] = decodeURIComponent(match[i + 1]);
    });
  } catch (e) {
    throw U.bad('La dirección no es válida. Recargá la página.');
  }
  const writes = req.method !== 'GET' && req.method !== 'HEAD';
  if (writes && !sameOrigin(req)) throw new HttpError(403, 'Por seguridad, esta acción solo se puede hacer desde el sistema. Recargá la página.');

  let user = null;
  if (!route.opts.public) {
    user = await auth.currentUser(req);
    if (!user) throw new HttpError(401, 'Se venció tu sesión. Volvé a ingresar.');
    if (route.opts.admin && user.role !== 'admin') throw new HttpError(403, 'Esto solo lo puede hacer el dueño o administrador.', { code: 'admin_only' });
  }
  let body = {};
  if (writes && req.method !== 'DELETE') {
    const len = Number(req.headers['content-length'] || 0);
    if (len > 0 && !String(req.headers['content-type'] || '').includes('application/json')) {
      throw new HttpError(415, 'No se pudieron leer los datos enviados. Recargá la página.');
    }
    body = await U.readBody(req, route.opts.limit || 1024 * 1024);
  }
  const ctx = { req, res, params, query: url.searchParams, body, user };
  const result = await route.fn(ctx);
  if (result === U.HANDLED) return;
  U.sendJson(res, 200, result === undefined ? { ok: true } : result);
}

/* ============================================================
   Datos comunes
   ============================================================ */
const fullName = (first, last) => (String(first || '') + ' ' + String(last || '')).trim();
const isAdmin = (ctx) => ctx.user.role === 'admin';
/** Cantidad legible: "3", "1,5 kg". */
const fmtQty = (n, unit) => String(Number(n)).replace('.', ',') + (unit === 'kg' ? ' kg' : '');

// El costo (precio de compra) es información del dueño: el ayudante no lo ve.
const mapProduct = (r, admin) => ({
  id: r.id,
  name: r.name,
  brand: r.brand,
  category: r.category,
  species: r.species || '',
  unit: r.unit,
  stock: Number(r.stock),
  min: Number(r.min_stock),
  price: Number(r.price),
  cost: admin ? Number(r.cost) : null,
  packKg: r.pack_kg == null ? null : Number(r.pack_kg),
  looseId: r.loose_id || null,
  supplierId: r.supplier_id || null,
  barcode: r.barcode || '',
  barcodes: r.codes || (r.barcode ? [r.barcode] : []),
  expires: r.expires_on || '',
  isGift: !!r.is_gift,
});
const mapService = (r) => ({ id: r.id, name: r.name, category: r.category, price: Number(r.price), duration: r.duration_min });
const mapSupplier = (r) => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, description: r.description });
const mapClient = (r, pets) => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  name: fullName(r.first_name, r.last_name),
  phone: r.phone,
  email: r.email,
  address: r.address,
  notes: r.notes,
  pets: pets || [],
});
const mapPet = (r) => ({ id: r.id, clientId: r.client_id, name: r.name, species: r.species, breed: r.breed, size: r.size || '', birth: r.birth || '', notes: r.notes });
const mapCash = (r) => ({
  id: r.id,
  date: r.on_date,
  type: r.kind,
  concept: r.concept,
  category: r.category,
  method: r.method,
  amount: Number(r.amount),
  saleId: r.sale_id || null,
  stockDelta: Number(r.stock_delta || 0),
});

async function listProducts(admin) {
  const r = await db.query(
    'SELECT p.*, (SELECT array_agg(b.code ORDER BY b.created_at, b.code) FROM product_barcodes b WHERE b.product_id = p.id) AS codes FROM products p ORDER BY lower(p.name), p.id'
  );
  return r.rows.map((x) => mapProduct(x, admin));
}

/* ---------- Configuración del negocio ---------- */
const DEFAULT_SETTINGS = {
  shopName: '',
  address: '',
  phone: '',
  ticketText: '¡Gracias por tu compra!',
  ticketWidth: 80,
  hours: L.DEFAULT_HOURS,
  methods: U.METHODS.slice(),
  fixedCategories: ['Alquiler y servicios', 'Sueldos', 'Impuestos'],
  lowMargin: 10,
  lostDays: 30,
  report: { enabled: false, weekday: 1, hour: 8, recipients: '' },
};
let settingsCache = null;
async function getSettings(q) {
  if (settingsCache && Date.now() - settingsCache.at < 30000) return settingsCache.value;
  const r = await (q || db).query("SELECT value FROM settings WHERE key = 'app'");
  let saved = {};
  try {
    saved = r.rows[0] ? JSON.parse(r.rows[0].value) : {};
  } catch (e) {
    saved = {};
  }
  const value = Object.assign({}, DEFAULT_SETTINGS, saved, { report: Object.assign({}, DEFAULT_SETTINGS.report, saved.report || {}) });
  if (!value.shopName) value.shopName = process.env.SHOP_NAME || 'Mi Pet Shop';
  settingsCache = { at: Date.now(), value };
  return value;
}

/* ---------- Registro de auditoría ---------- */
const auditJson = (v) => (v == null ? null : JSON.stringify(v));
/** Deja constancia de una acción sensible: quién, cuándo, qué cambió y por qué. `q` es la base o la transacción. */
async function audit(q, ctx, action, entity, entityId, before, after, reason) {
  await q.query('INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, before, after, reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
    ctx.user ? ctx.user.id : null,
    ctx.user ? ctx.user.name : '',
    action,
    entity,
    entityId || null,
    auditJson(before),
    auditJson(after),
    reason || '',
  ]);
}
async function listServices() {
  const r = await db.query('SELECT id, name, category, price, duration_min FROM services ORDER BY lower(name), id');
  return r.rows.map(mapService);
}
async function listClients() {
  const [cl, pt] = await Promise.all([
    db.query('SELECT * FROM clients ORDER BY lower(last_name), lower(first_name), id'),
    db.query('SELECT * FROM pets ORDER BY lower(name), id'),
  ]);
  const by = {};
  pt.rows.forEach((x) => (by[x.client_id] = by[x.client_id] || []).push(mapPet(x)));
  return cl.rows.map((r) => mapClient(r, by[r.id]));
}

/** Efectivo que debería haber en la caja al cierre de `date` (ingresos menos egresos en efectivo). */
async function drawerAt(q, date) {
  const r = await q.query(
    "SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount ELSE -amount END), 0) AS total FROM cash_movements WHERE method = 'Efectivo' AND on_date <= $1",
    [date]
  );
  return U.round2(Number(r.rows[0].total));
}

async function cashSummary() {
  const today = U.todayAR();
  const monthFrom = today.slice(0, 7) + '-01';
  const monthTo = U.monthEnd(today);
  const [rows, drawer] = await Promise.all([
    db.query('SELECT on_date, kind, method, amount FROM cash_movements WHERE on_date >= $1 AND on_date <= $2', [monthFrom, monthTo]),
    drawerAt(db, today),
  ]);
  const m = { in: 0, out: 0, efe: 0, tra: 0, tar: 0, byMethod: {} };
  U.METHODS.forEach((x) => {
    m.byMethod[x] = 0;
  });
  const t = { in: 0, out: 0 };
  rows.rows.forEach((r) => {
    const a = Number(r.amount);
    if (r.kind === 'in') {
      m.in += a;
      m.byMethod[r.method] = (m.byMethod[r.method] || 0) + a;
      if (r.method === 'Efectivo') m.efe += a;
      else if (r.method === 'Transferencia') m.tra += a;
      else m.tar += a;
    } else {
      m.out += a;
    }
    if (r.method === 'Efectivo' && r.on_date === today) {
      if (r.kind === 'in') t.in += a;
      else t.out += a;
    }
  });
  ['in', 'out', 'efe', 'tra', 'tar'].forEach((k) => {
    m[k] = U.round2(m[k]);
  });
  Object.keys(m.byMethod).forEach((k) => {
    m.byMethod[k] = U.round2(m.byMethod[k]);
  });
  return { today, month: m, drawer, todayCash: { in: U.round2(t.in), out: U.round2(t.out) } };
}

/**
 * Un turno confirmado pasa solo a «Listo para retirar» cuando termina su horario (hora de inicio + duración),
 * medido en hora de Argentina.
 */
async function autoReady(q) {
  await q.query(
    "UPDATE appointments SET status = 'listo', started_at = COALESCE(started_at, now()), finished_at = COALESCE(finished_at, now()) " +
      "WHERE status = 'confirmado' AND (on_date + at_time + duration_min * interval '1 minute') <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')"
  );
}

async function mustExist(q, table, id, message) {
  const r = await q.query('SELECT id FROM ' + table + ' WHERE id = $1', [id]);
  if (!r.rows[0]) throw new HttpError(404, message);
}

/**
 * Códigos de barras de un producto (el primero es el principal). Se normalizan y no pueden pertenecer a otro
 * producto: si alguno ya está tomado, 409 con el nombre del dueño del código. `exceptId` = el propio producto.
 */
async function checkCodes(q, list, exceptId) {
  const codes = [];
  for (const raw of list) {
    const c = L.normalizeBarcode(raw);
    if (c && !codes.includes(c)) codes.push(c);
  }
  if (codes.length > 20) throw U.bad('Un producto puede tener como máximo 20 códigos de barras.');
  for (const c of codes) {
    const r = await q.query('SELECT p.name FROM product_barcodes b JOIN products p ON p.id = b.product_id WHERE b.code = $1 AND b.product_id <> $2', [c, exceptId || 0]);
    if (r.rows[0]) throw new HttpError(409, 'El código ' + c + ' ya pertenece al producto «' + r.rows[0].name + '».', { code: 'barcode_taken' });
  }
  return codes;
}
/** Guarda los códigos de un producto (reemplaza los anteriores) y deja el principal en products.barcode. */
async function saveCodes(c, productId, codes) {
  await c.query('DELETE FROM product_barcodes WHERE product_id = $1', [productId]);
  for (const code of codes) await c.query('INSERT INTO product_barcodes (code, product_id) VALUES ($1, $2)', [code, productId]);
  await c.query('UPDATE products SET barcode = $1 WHERE id = $2', [codes[0] || null, productId]);
}
/** Proveedor opcional: si se indica, tiene que existir. */
async function optSupplier(q, v) {
  if (v == null || v === '') return null;
  const id = U.idParam(v);
  await mustExist(q, 'suppliers', id, 'No encontramos ese proveedor. Recargá la página.');
  return id;
}

/**
 * Descuenta stock dentro de una transacción. Si no alcanza, rechaza con
 * "No hay stock suficiente de {producto} (quedan {n})" y no toca nada. Registra el movimiento de stock.
 */
async function deductStock(c, productId, qty, reason, date, userId, o) {
  o = o || {};
  const r = await c.query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING name, stock, unit', [qty, productId]);
  if (!r.rows[0]) {
    const e = await c.query('SELECT name, stock, unit FROM products WHERE id = $1', [productId]);
    if (!e.rows[0]) throw new HttpError(404, 'Uno de los productos ya no existe. Recargá la página.');
    throw new HttpError(409, 'No hay stock suficiente de ' + e.rows[0].name + ': quedan ' + fmtQty(Math.max(0, e.rows[0].stock), e.rows[0].unit) + '.', { code: 'no_stock' });
  }
  const m = await c.query(
    'INSERT INTO stock_movements (product_id, product_name, on_date, qty, reason, created_by, unit_price, sale_id, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
    [productId, r.rows[0].name, date, -qty, reason, userId, o.unitPrice || 0, o.saleId || null, o.note || '']
  );
  return { movementId: m.rows[0].id, name: r.rows[0].name, stock: Number(r.rows[0].stock) };
}

/**
 * Revierte movimientos de stock (los anula, devuelve o resta las unidades y deja "Anulación de ...").
 * Si restar dejaría el stock en negativo, rechaza todo. Devuelve el neto.
 */
async function revertStockMovements(c, ids, userId) {
  let net = 0;
  for (const mid of ids) {
    const sm = (await c.query('SELECT id, product_id, qty, voided FROM stock_movements WHERE id = $1 FOR UPDATE', [mid])).rows[0];
    if (!sm || sm.voided || !sm.product_id) continue;
    const delta = -Number(sm.qty); // venta (qty < 0): vuelve al stock; compra (qty > 0): se resta
    const u = await c.query('UPDATE products SET stock = stock + $1 WHERE id = $2 AND stock + $1 >= 0 RETURNING name', [delta, sm.product_id]);
    if (!u.rows[0]) {
      const e = (await c.query('SELECT name, stock, unit FROM products WHERE id = $1', [sm.product_id])).rows[0];
      if (!e) continue; // el producto ya no existe
      throw new HttpError(409, 'No se puede deshacer: al restar ' + fmtQty(-delta, e.unit) + ' de ' + e.name + ' el stock quedaría en negativo (hay ' + fmtQty(e.stock, e.unit) + ')');
    }
    await c.query('INSERT INTO stock_movements (product_id, product_name, on_date, qty, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6)', [
      sm.product_id, u.rows[0].name, U.todayAR(), delta, delta > 0 ? 'Anulación de venta' : 'Anulación de ingreso', userId,
    ]);
    await c.query('UPDATE stock_movements SET voided = TRUE WHERE id = $1', [sm.id]);
    net = U.round3(net + delta);
  }
  return net;
}
/* ============================================================
   Sesión y usuarios
   ============================================================ */
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw U.bad('La contraseña tiene que tener al menos 8 caracteres.');
  if (p.length > 200) throw U.bad('La contraseña es demasiado larga.');
  return p;
}

add('POST', '/api/login', { public: true }, async (ctx) => {
  const email = U.reqStr(ctx.body.email, 'Email', 200).toLowerCase();
  const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
  const key = U.clientIp(ctx.req) + '|' + email;
  const wait = auth.throttleCheck(key);
  if (wait > 0) throw new HttpError(429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(wait / 60) + ' minutos.');
  const r = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const u = r.rows[0];
  let ok = false;
  if (u) ok = await auth.verifyPassword(password, u.password_hash);
  else await auth.verifyPassword(password, await auth.dummyHash());
  if (!ok || !u.active) {
    auth.throttleFail(key);
    throw new HttpError(401, 'El email o la contraseña no son correctos.');
  }
  auth.throttleOk(key);
  auth.setSession(ctx.res, u);
  backup.ensureDaily().catch((e) => console.error('Copia diaria:', e.message));
  return { user: { id: u.id, name: u.name, email: u.email, role: u.role } };
});

add('POST', '/api/logout', { public: true }, async (ctx) => {
  auth.clearSession(ctx.res);
});

add('GET', '/api/me', async (ctx) => ({ user: ctx.user }));

add('POST', '/api/me/password', async (ctx) => {
  const r = await db.query('SELECT * FROM users WHERE id = $1', [ctx.user.id]);
  const u = r.rows[0];
  if (!(await auth.verifyPassword(String(ctx.body.current || ''), u.password_hash))) {
    throw U.bad('La contraseña actual no es correcta.');
  }
  const hash = await auth.hashPassword(checkPassword(ctx.body.password));
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, u.id]);
  u.password_hash = hash;
  auth.setSession(ctx.res, u);
});

add('GET', '/api/users', { admin: true }, async () => {
  const r = await db.query('SELECT id, email, name, role, active FROM users ORDER BY lower(name), id');
  return { items: r.rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active })) };
});

add('POST', '/api/users', { admin: true }, async (ctx) => {
  const b = ctx.body;
  const name = U.reqStr(b.name, 'Nombre', 100);
  const email = U.checkEmail(U.reqStr(b.email, 'Email', 150).toLowerCase());
  const pw = checkPassword(b.password);
  const role = U.oneOf(b.role, ['admin', 'staff'], 'Rol');
  try {
    const r = await db.query('INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id', [
      email,
      name,
      await auth.hashPassword(pw),
      role,
    ]);
    await audit(db, ctx, 'Alta de usuario', 'usuario', r.rows[0].id, null, { name, email, role });
  } catch (e) {
    if (e.code === '23505' || /UNIQUE/i.test(e.message)) throw new HttpError(409, 'Ya existe un usuario con ese email.');
    throw e;
  }
});

add('PATCH', '/api/users/:id', { admin: true }, async (ctx) => {
  const id = U.idParam(ctx.params.id);
  const b = ctx.body;
  const cur = (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
  if (!cur) throw new HttpError(404, 'No encontramos ese usuario. Recargá la página.');
  const name = b.name !== undefined ? U.reqStr(b.name, 'Nombre', 100) : cur.name;
  const role = b.role !== undefined ? U.oneOf(b.role, ['admin', 'staff'], 'Rol') : cur.role;
  const active = b.active !== undefined ? !!b.active : !!cur.active;
  if (id === ctx.user.id && (role !== 'admin' || !active)) {
    throw U.bad('No podés quitarte el rol de administrador ni desactivarte a vos mismo.');
  }
  if (cur.role === 'admin' && (role !== 'admin' || !active)) {
    const n = (await db.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = $1 AND id <> $2", [true, id])).rows[0].n;
    if (Number(n) < 1) throw U.bad('Tiene que quedar al menos un administrador activo.');
  }
  let hash = cur.password_hash;
  const newPw = b.password !== undefined && b.password !== '';
  if (newPw) hash = await auth.hashPassword(checkPassword(b.password));
  await db.query('UPDATE users SET name = $1, role = $2, active = $3, password_hash = $4 WHERE id = $5', [name, role, active, hash, id]);
  await audit(db, ctx, 'Edición de usuario', 'usuario', id, { name: cur.name, role: cur.role, active: !!cur.active }, { name, role, active, passwordChanged: newPw });
});


/* ============================================================
   Arranque de la pantalla
   ============================================================ */
add('GET', '/api/bootstrap', async (ctx) => {
  const admin = isAdmin(ctx);
  const [products, services, sup, clients, settings] = await Promise.all([
    listProducts(admin),
    listServices(),
    db.query('SELECT id, name, phone, email, description FROM suppliers ORDER BY lower(name), id'),
    listClients(),
    getSettings(),
  ]);
  const out = { user: ctx.user, shop: settings.shopName, settings: publicSettings(settings, admin), products, services, suppliers: sup.rows.map(mapSupplier), clients };
  if (admin) out.summary = await cashSummary();
  return out;
});

/* ============================================================
   Configuración del negocio (la ven todos; la cambia el dueño)
   ============================================================ */
// El empleado no necesita ver la configuración del informe por email ni los umbrales de ganancia.
function publicSettings(s, admin) {
  const out = { shopName: s.shopName, address: s.address, phone: s.phone, ticketText: s.ticketText, ticketWidth: s.ticketWidth, hours: s.hours, methods: s.methods };
  if (admin) Object.assign(out, { fixedCategories: s.fixedCategories, lowMargin: s.lowMargin, lostDays: s.lostDays, report: s.report, emailReady: report.configured() });
  return out;
}
add('GET', '/api/settings', async (ctx) => publicSettings(await getSettings(), isAdmin(ctx)));
add('PUT', '/api/settings', { admin: true }, async (ctx) => {
  const b = ctx.body;
  const cur = await getSettings();
  const rep = b.report && typeof b.report === 'object' ? b.report : {};
  const methods = Array.isArray(b.methods) ? b.methods.filter((m) => U.METHODS.includes(m)) : cur.methods;
  if (!methods.length) throw U.bad('Dejá habilitada al menos una forma de pago.');
  const fixed = Array.isArray(b.fixedCategories) ? b.fixedCategories.filter((c) => U.CASH_OUT_CATS.includes(c)) : cur.fixedCategories;
  const recipients = U.optStr(rep.recipients, 500, 'Destinatarios')
    .split(/[,;\s]+/)
    .filter(Boolean);
  recipients.forEach((r) => U.checkEmail(r));
  const next = {
    shopName: U.reqStr(b.shopName, 'Nombre del negocio', 100),
    address: U.optStr(b.address, 200, 'Dirección'),
    phone: U.optPhone(b.phone).phone,
    ticketText: U.optStr(b.ticketText, 200, 'Texto del ticket'),
    ticketWidth: U.oneOf(Number(b.ticketWidth || 80), [58, 80], 'Ancho del ticket'),
    hours: L.checkHours(b.hours || cur.hours),
    methods: U.METHODS.filter((m) => methods.includes(m)),
    fixedCategories: fixed,
    lowMargin: U.reqNum(b.lowMargin == null || b.lowMargin === '' ? cur.lowMargin : b.lowMargin, 'Margen bajo', 0, 100),
    lostDays: U.reqInt(b.lostDays == null || b.lostDays === '' ? cur.lostDays : b.lostDays, 'Días sin comprar', 7, 365),
    report: {
      enabled: !!rep.enabled,
      weekday: U.reqInt(rep.weekday == null ? 1 : rep.weekday, 'Día del informe', 0, 6),
      hour: U.reqInt(rep.hour == null ? 8 : rep.hour, 'Hora del informe', 0, 23),
      recipients: recipients.join(', '),
    },
  };
  if (next.report.enabled && !recipients.length) throw U.bad('Para activar el informe semanal escribí al menos un email destinatario.');
  await db.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ('app', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [JSON.stringify(next)]
  );
  settingsCache = null;
  await audit(db, ctx, 'Cambio de configuración', 'configuración', null, cur, next);
  return publicSettings(await getSettings(), true);
});

/* ============================================================
   Actividad (registro de auditoría), solo el dueño
   ============================================================ */
add('GET', '/api/audit', { admin: true }, async (ctx) => {
  const q = ctx.query;
  const where = [];
  const params = [];
  const p = (v) => {
    params.push(v);
    return '$' + params.length;
  };
  if (q.get('from')) where.push('a.at >= ' + p(U.reqDate(q.get('from'), 'Desde')) + "::date AT TIME ZONE '" + U.TZ + "'");
  if (q.get('to')) where.push('a.at < (' + p(U.reqDate(q.get('to'), 'Hasta')) + "::date + 1) AT TIME ZONE '" + U.TZ + "'");
  if (q.get('user')) where.push('a.user_id = ' + p(U.idParam(q.get('user'))));
  if (q.get('action')) where.push('a.action = ' + p(U.optStr(q.get('action'), 100)));
  const r = await db.query(
    'SELECT a.id, a.at, a.user_name, a.action, a.entity, a.entity_id, a.before, a.after, a.reason FROM audit_log a' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY a.at DESC, a.id DESC LIMIT 500',
    params
  );
  const acts = await db.query('SELECT DISTINCT action FROM audit_log ORDER BY action');
  const parse = (t) => {
    try {
      return t == null ? null : JSON.parse(t);
    } catch (e) {
      return null;
    }
  };
  return {
    actions: acts.rows.map((x) => x.action),
    items: r.rows.map((x) => ({ id: x.id, at: x.at, user: x.user_name, action: x.action, entity: x.entity, entityId: x.entity_id, before: parse(x.before), after: parse(x.after), reason: x.reason })),
  };
});

/* ============================================================
   Módulos de rutas
   ============================================================ */
const report = require('./report');
const H = {
  add, db, U, L, HttpError, backup, report, isAdmin, fullName, fmtQty, audit, getSettings,
  mapProduct, mapService, mapSupplier, mapClient, mapPet, mapCash, listClients,
  drawerAt, cashSummary, autoReady, mustExist, checkCodes, saveCodes, optSupplier, deductStock, revertStockMovements,
};
require('./routes/catalog')(H);
require('./routes/sales')(H);
require('./routes/people')(H);
require('./routes/summary')(H);
require('./routes/backups')(H);

module.exports = { dispatch, routes, getSettings, clearSettingsCache: () => (settingsCache = null), weeklyTick: () => (H.weeklyTick ? H.weeklyTick() : Promise.resolve()) };
