'use strict';

/**
 * Entorno de prueba sin PostgreSQL: reemplaza el módulo "pg" por una base falsa que responde según
 * reglas (expresión regular de la consulta → filas) y respeta transacciones para un contador de ventas.
 * Carga la API real (server/api.js) y permite llamar a cualquier ruta como dueño o como empleado.
 */
const Module = require('module');
const EventEmitter = require('events');
const path = require('path');

const state = { rules: [], log: [], counter: 0, staged: null };

function handle(sql, params) {
  state.log.push({ sql, params });
  if (/^\s*(BEGIN)/i.test(sql)) {
    state.staged = state.counter;
    return { rows: [] };
  }
  if (/^\s*COMMIT/i.test(sql)) {
    if (state.staged != null) state.counter = state.staged;
    state.staged = null;
    return { rows: [] };
  }
  if (/^\s*ROLLBACK/i.test(sql)) {
    state.staged = null;
    return { rows: [] };
  }
  // Contador de comprobantes con semántica transaccional (lo que hace PostgreSQL con el UPDATE).
  if (/UPDATE counters SET value = value \+ 1/.test(sql)) {
    if (state.staged == null) state.counter += 1;
    else state.staged += 1;
    const value = state.staged == null ? state.counter : state.staged;
    // La venta se inserta en una sola instrucción (WITH n AS (UPDATE counters ...) ...): devuelve la fila de la regla con el número.
    if (/^\s*WITH/i.test(sql)) {
      const r = state.rules.find((x) => x.re.test(sql));
      const rows = r ? (typeof r.rows === 'function' ? r.rows(params, sql) : r.rows) : [{}];
      if (rows instanceof Error) throw rows;
      return { rows: rows.map((x) => Object.assign({ number: value, appt: 1 }, x)), rowCount: rows.length };
    }
    return { rows: [{ value }] };
  }
  for (const r of state.rules) {
    if (r.re.test(sql)) {
      const rows = typeof r.rows === 'function' ? r.rows(params, sql) : r.rows;
      if (rows instanceof Error) throw rows;
      return { rows, rowCount: rows.length };
    }
  }
  // Como en PostgreSQL, un COUNT/SUM sin GROUP BY siempre devuelve una fila (con ceros si no hay datos).
  if (/^\s*SELECT/i.test(sql) && /\b(COUNT|SUM|MIN|MAX)\(/i.test(sql) && !/GROUP BY/i.test(sql)) {
    // MIN/MAX de fechas sin datos dan NULL; las sumas y conteos, 0.
    return { rows: [new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : k === 'd' ? null : 0) })], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}

const fakePg = {
  types: { setTypeParser() {} },
  Pool: class {
    on() {}
    async query(sql, params) {
      return handle(sql, params);
    }
    async connect() {
      return { query: async (sql, params) => handle(sql, params), release() {} };
    }
    async end() {}
  },
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'pg') return fakePg;
  return origLoad.apply(this, arguments);
};

const auth = require(path.join(__dirname, '..', 'server', 'auth.js'));
const api = require(path.join(__dirname, '..', 'server', 'api.js'));

const USERS = {
  admin: { id: 1, name: 'Dueña QA', email: 'qa-duena@test', role: 'admin' },
  staff: { id: 2, name: 'Empleado QA', email: 'qa-empleado@test', role: 'staff' },
};
let current = null;
auth.currentUser = async () => current;

/** Llama a una ruta de la API. Devuelve { status, body } (si la ruta lanza un error, status es su código). */
async function call(role, method, url, body) {
  current = role ? USERS[role] : null;
  const req = new EventEmitter();
  const json = body === undefined ? '' : JSON.stringify(body);
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost', 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)) };
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = { headersSent: false, status: 0, out: '', writeHead(s) { this.status = s; this.headersSent = true; }, setHeader() {}, end(b) { this.out = b || ''; } };
  setImmediate(() => {
    if (json) req.emit('data', Buffer.from(json));
    req.emit('end');
  });
  try {
    await api.dispatch(req, res, new URL(url, 'http://localhost'));
    return { status: res.status, body: res.out ? JSON.parse(res.out) : null };
  } catch (e) {
    return { status: e.status || 500, body: Object.assign({ error: e.message }, e.extra || {}), error: e };
  }
}

function reset(rules) {
  state.rules = (rules || []).map(([re, rows]) => ({ re, rows }));
  state.log = [];
  state.counter = 0;
  state.staged = null;
  api.clearSettingsCache();
}

module.exports = { api, call, reset, state, USERS };
