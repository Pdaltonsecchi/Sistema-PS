'use strict';

const zlib = require('zlib');
const db = require('./db');
const U = require('./util');

// Tablas incluidas en las copias, en orden de dependencia (las de abajo dependen de las de arriba).
// No se incluyen los usuarios ni sus contraseñas.
const TABLES = [
  ['suppliers', ['id', 'name', 'phone', 'email', 'description', 'created_at']],
  ['products', ['id', 'name', 'brand', 'category', 'species', 'unit', 'stock', 'min_stock', 'price', 'cost', 'pack_kg', 'loose_id', 'supplier_id', 'barcode', 'expires_on', 'is_gift', 'created_at']],
  ['product_barcodes', ['code', 'product_id', 'created_at']],
  ['services', ['id', 'name', 'category', 'price', 'duration_min']],
  ['clients', ['id', 'first_name', 'last_name', 'phone', 'email', 'address', 'notes', 'created_at']],
  ['pets', ['id', 'client_id', 'name', 'species', 'breed', 'size', 'birth', 'notes', 'created_at']],
  ['cash_movements', ['id', 'on_date', 'kind', 'concept', 'category', 'method', 'amount', 'supplier_id', 'created_by', 'created_at']],
  ['sales', ['id', 'number', 'on_date', 'client_id', 'pet_id', 'method', 'subtotal', 'discount', 'total', 'cost_total', 'note', 'cash_id', 'voided_at', 'void_reason', 'created_by', 'created_at']],
  ['sale_items', ['id', 'sale_id', 'kind', 'product_id', 'service_id', 'name', 'category', 'unit', 'qty', 'unit_price', 'list_price', 'price_reason', 'unit_cost', 'amount']],
  ['sale_payments', ['id', 'sale_id', 'method', 'amount', 'cash_id']],
  ['stock_movements', ['id', 'product_id', 'product_name', 'on_date', 'qty', 'reason', 'unit_price', 'note', 'sale_id', 'supplier_id', 'cash_id', 'voided', 'created_by', 'created_at']],
  ['appointments', ['id', 'pet_id', 'service_id', 'on_date', 'at_time', 'duration_min', 'status', 'notes', 'staff', 'started_at', 'finished_at', 'confirmed_at', 'sale_id', 'created_at']],
  ['cash_closings', ['id', 'on_date', 'expected', 'counted', 'difference', 'note', 'created_at']],
  ['audit_log', ['id', 'at', 'user_id', 'user_name', 'action', 'entity', 'entity_id', 'before', 'after', 'reason']],
];
// Columnas que apuntan a la misma tabla: se cargan después, para no depender del orden de las filas.
const SELF_REFS = { products: ['loose_id'] };
// Tablas sin columna "id" numérica (su clave es otra).
const NO_ID = { product_barcodes: 'code' };
// Tablas que no existían en copias anteriores: si faltan, se reconstruyen a partir del resto.
const NEW_TABLES = new Set(['product_barcodes', 'sale_payments', 'audit_log']);
// Columnas que apuntan a usuarios: los usuarios no viajan en las copias, así que si no existe queda vacío.
const USER_COLS = new Set(['created_by', 'user_id']);
// Valores por defecto para columnas que no existían en copias anteriores.
const COL_DEFAULTS = { is_gift: false, price_reason: '', staff: '' };

// Retención pensada para los 500 MB de los planes gratuitos (Neon, Supabase) (las copias viven en la misma base).
const KEEP_AUTO = 7;
const KEEP_MANUAL = 10;

async function collect() {
  const out = {};
  for (const [table, cols] of TABLES) {
    const r = await db.query('SELECT ' + cols.join(', ') + ' FROM ' + table + ' ORDER BY ' + (NO_ID[table] || 'id'));
    out[table] = r.rows;
  }
  return out;
}

function countsOf(data) {
  const c = {};
  for (const [table] of TABLES) c[table] = (data[table] || []).length;
  return c;
}
const totalOf = (counts) => Object.keys(counts).reduce((n, k) => n + counts[k], 0);

/** Cuántos registros hay hoy en cada tabla (para comparar contra una copia antes de restaurar). */
async function currentCounts() {
  return countsOf(await collect());
}

async function prune(auto) {
  const keepN = auto ? KEEP_AUTO : KEEP_MANUAL;
  const keep = await db.query('SELECT id FROM backups WHERE auto = $1 ORDER BY id DESC LIMIT $2', [auto, keepN]);
  const ids = keep.rows.map((r) => r.id);
  if (!ids.length) return;
  const ph = ids.map((_, i) => '$' + (i + 2)).join(', ');
  await db.query('DELETE FROM backups WHERE auto = $1 AND id NOT IN (' + ph + ')', [auto].concat(ids));
}

/** Guarda una copia comprimida dentro de la propia base de datos. */
async function snapshot(label, auto) {
  const data = await collect();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data))).toString('base64');
  const r = await db.query('INSERT INTO backups (label, auto, counts, data) VALUES ($1, $2, $3, $4) RETURNING id', [
    label,
    !!auto,
    JSON.stringify(countsOf(data)),
    gz,
  ]);
  await prune(!!auto);
  return r.rows[0].id;
}

const REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * Copia automática: una por día (hora de Argentina), siempre con los datos ACTUALES.
 * - Si todavía no hay copia de hoy, la crea.
 * - Si ya hay una de hoy pero tiene más de 3 horas y los datos cambiaron, la actualiza.
 * - Nunca guarda una copia automática vacía.
 */
async function ensureDaily() {
  const data = await collect();
  const counts = countsOf(data);
  if (totalOf(counts) === 0) return false;
  const r = await db.query('SELECT id, created_at, counts FROM backups WHERE auto = $1 ORDER BY id DESC LIMIT 1', [true]);
  const last = r.rows[0];
  let sameDay = false;
  if (last) {
    const d = new Date(last.created_at);
    sameDay = !isNaN(d.getTime()) && d.toLocaleDateString('en-CA', { timeZone: U.TZ }) === U.todayAR();
  }
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data))).toString('base64');
  if (!sameDay) {
    await db.query('INSERT INTO backups (label, auto, counts, data) VALUES ($1, $2, $3, $4)', ['Copia automática diaria', true, JSON.stringify(counts), gz]);
    await prune(true);
    return true;
  }
  let prev = {};
  try {
    prev = JSON.parse(last.counts);
  } catch (e) {
    /* sin detalle: se refresca igual */
  }
  const stale = Date.now() - new Date(last.created_at).getTime() > REFRESH_AFTER_MS || totalOf(prev) === 0;
  if (!stale || JSON.stringify(prev) === JSON.stringify(counts)) return false;
  await db.query('UPDATE backups SET created_at = now(), counts = $1, data = $2 WHERE id = $3', [JSON.stringify(counts), gz, last.id]);
  return true;
}

async function list() {
  const r = await db.query('SELECT id, created_at, label, auto, counts FROM backups ORDER BY id DESC');
  return r.rows.map((b) => {
    let counts = {};
    try {
      counts = JSON.parse(b.counts);
    } catch (e) {
      /* sin detalle */
    }
    return { id: b.id, createdAt: b.created_at, label: b.label, auto: !!b.auto, counts };
  });
}

/** Espacio que ocupa la base de datos (para avisar antes de llegar al límite del plan gratuito). */
async function usage() {
  const r = await db.query('SELECT pg_database_size(current_database()) AS bytes');
  const b = await db.query('SELECT COALESCE(SUM(length(data)), 0) AS bytes FROM backups');
  return { bytes: Number(r.rows[0].bytes), backupBytes: Number(b.rows[0].bytes), limit: (Number(process.env.DB_LIMIT_MB) || 500) * 1024 * 1024 };
}

async function load(id) {
  const r = await db.query('SELECT data FROM backups WHERE id = $1', [id]);
  if (!r.rows[0]) throw new U.HttpError(404, 'No se encontró esa copia');
  return JSON.parse(zlib.gunzipSync(Buffer.from(r.rows[0].data, 'base64')).toString('utf8'));
}

async function remove(id) {
  await db.query('DELETE FROM backups WHERE id = $1', [id]);
}

async function exportAll() {
  return { app: 'petshop-sistema', version: 1, exportedAt: new Date().toISOString(), data: await collect() };
}

function validate(d) {
  if (!d || typeof d !== 'object') throw U.bad('La copia no es válida');
  for (const [table] of TABLES) {
    if (d[table] === undefined && NEW_TABLES.has(table)) continue; // copia de una versión anterior
    if (!Array.isArray(d[table])) throw U.bad('La copia no es válida: falta la sección "' + table + '"');
    const key = NO_ID[table];
    for (const row of d[table]) {
      if (!row || typeof row !== 'object' || (key ? typeof row[key] !== 'string' : !Number.isInteger(row.id))) {
        throw U.bad('La copia no es válida: hay datos dañados en "' + table + '"');
      }
    }
  }
}

/**
 * Reemplaza todos los datos por los de la copia. Antes guarda una copia de lo actual.
 * Todo ocurre en una sola operación: si algo falla, los datos quedan como estaban.
 */
async function restore(data, opts) {
  validate(data);
  // Una copia sin ningún registro borraría todo: se exige confirmación explícita.
  if (totalOf(countsOf(data)) === 0 && !(opts && opts.confirmEmpty)) {
    throw new U.HttpError(409, 'Esta copia está vacía: restaurarla borra todos los datos. Confirmá que es lo que querés.');
  }
  await snapshot('Antes de restaurar una copia', false);
  try {
    await db.tx(async (c) => {
      // Los usuarios no viajan en las copias: si quien cargó algo ya no existe, queda sin autor.
      const users = new Set((await c.query('SELECT id FROM users')).rows.map((u) => u.id));
      for (const [table] of TABLES.slice().reverse()) await c.query('DELETE FROM ' + table);
      for (const [table, cols] of TABLES) {
        const rows = data[table] || [];
        const late = SELF_REFS[table] || [];
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const params = [];
          const values = chunk
            .map(
              (row) =>
                '(' +
                cols
                  .map((col) => {
                    let v = late.includes(col) ? null : row[col];
                    if (v === undefined) v = COL_DEFAULTS[col] !== undefined ? COL_DEFAULTS[col] : null;
                    if (USER_COLS.has(col) && !users.has(v)) v = null;
                    params.push(v);
                    return '$' + params.length;
                  })
                  .join(', ') +
                ')'
            )
            .join(', ');
          await c.query('INSERT INTO ' + table + ' (' + cols.join(', ') + ') VALUES ' + values, params);
        }
        for (const col of late) {
          for (const row of rows) {
            if (row[col] != null) await c.query('UPDATE ' + table + ' SET ' + col + ' = $1 WHERE id = $2', [row[col], row.id]);
          }
        }
        if (!NO_ID[table]) await db.resetSequence(c, table);
      }
      // El teléfono normalizado no viaja en las copias: se recalcula.
      await c.query("UPDATE suppliers SET phone_norm = regexp_replace(phone, '\\D', '', 'g')");
      await c.query("UPDATE clients SET phone_norm = regexp_replace(phone, '\\D', '', 'g')");
      // Copias anteriores a la numeración, al pago mixto y a los códigos múltiples: se completan.
      await c.query('UPDATE sales SET number = id WHERE number IS NULL');
      await c.query('UPDATE sale_items SET list_price = unit_price WHERE list_price IS NULL');
      await c.query(
        'INSERT INTO sale_payments (sale_id, method, amount, cash_id) SELECT s.id, s.method, s.total, s.cash_id FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_payments p WHERE p.sale_id = s.id)'
      );
      await c.query('INSERT INTO product_barcodes (code, product_id) SELECT barcode, id FROM products WHERE barcode IS NOT NULL ON CONFLICT (code) DO NOTHING');
      await c.query("INSERT INTO counters (name, value) SELECT 'sale', COALESCE(MAX(number), 0) FROM sales ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value");
    });
  } catch (e) {
    console.error('Falló la restauración:', e.message);
    throw U.bad('No se pudo restaurar: la copia tiene datos dañados o incompatibles. Tus datos actuales no se tocaron.');
  }
}

module.exports = { TABLES, currentCounts, snapshot, ensureDaily, list, usage, load, remove, exportAll, restore };
