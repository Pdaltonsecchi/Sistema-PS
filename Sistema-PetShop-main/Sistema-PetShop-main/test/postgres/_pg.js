'use strict';

/** Base real de prueba: la deja vacía, crea las tablas y dos usuarios, y permite llamar a la API como en test/_fake.js. */
const EventEmitter = require('events');
const path = require('path');
const db = require(path.join(__dirname, '..', '..', 'server', 'db.js'));
const auth = require(path.join(__dirname, '..', '..', 'server', 'auth.js'));
const api = require(path.join(__dirname, '..', '..', 'server', 'api.js'));

const USERS = {};
let current = null;
auth.currentUser = async () => current;

async function fresh() {
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
  await db.migrate();
  api.clearSettingsCache();
  const ins = async (email, name, role) => (await db.query("INSERT INTO users (email, name, role, password_hash, active) VALUES ($1, $2, $3, 'x', TRUE) RETURNING id", [email, name, role])).rows[0].id;
  USERS.admin = { id: await ins('duena@test', 'Dueña QA', 'admin'), name: 'Dueña QA', role: 'admin' };
  USERS.staff = { id: await ins('empleado@test', 'Empleado QA', 'staff'), name: 'Empleado QA', role: 'staff' };
}

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
    return { status: res.status, body: res.out && /^[[{]/.test(res.out) ? JSON.parse(res.out) : res.out };
  } catch (e) {
    return { status: e.status || 500, body: Object.assign({ error: e.message }, e.extra || {}) };
  }
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

module.exports = { db, fresh, call, one, USERS };
