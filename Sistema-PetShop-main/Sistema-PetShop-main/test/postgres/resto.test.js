'use strict';

/** Agenda (recordatorios), Resumen, configuración y actividad contra la base real. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, call, one, db } = require('./_pg');
const U = require('../../server/util');

const future = '2099-06-01'; // lunes

test('agenda real: recordatorio sin cliente, junto a un turno a la misma hora, y se lista en la agenda', async () => {
  await fresh();
  const c = (await one("INSERT INTO clients (first_name, last_name) VALUES ('Ana', 'Gómez') RETURNING id")).id;
  const pet = (await one("INSERT INTO pets (client_id, name) VALUES ($1, 'Firu') RETURNING id", [c])).id;
  const t = await call('staff', 'POST', '/api/appointments', { petId: pet, date: future, time: '15:00', duration: 60 });
  assert.equal(t.status, 200, JSON.stringify(t.body));
  const r = await call('staff', 'POST', '/api/appointments', { title: 'Llamar al distribuidor', date: future, time: '15:00', duration: 15, notes: 'pedir Royal' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const late = await call('staff', 'POST', '/api/appointments', { title: 'Pagar la luz', date: future, time: '21:30', duration: 15 });
  assert.equal(late.status, 200, 'un recordatorio fuera del horario comercial no pide confirmación');
  const list = await call('staff', 'GET', '/api/appointments?from=' + future + '&to=' + future);
  assert.equal(list.body.items.length, 3);
  const rem = list.body.items.find((x) => x.id === r.body.id);
  assert.equal(rem.reminder, true);
  assert.equal(rem.title, 'Llamar al distribuidor');
  assert.equal(rem.petId, null);
  assert.equal(rem.client, '');
  // Pasarlo a "hecho" (entregado) y editarlo.
  assert.equal((await call('staff', 'POST', '/api/appointments/' + r.body.id + '/status', { status: 'entregado' })).body.status, 'entregado');
  const ed = await call('staff', 'PUT', '/api/appointments/' + r.body.id, { title: 'Llamar a Royal', date: future, time: '16:00', duration: 15, status: 'reservado' });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal((await one('SELECT title FROM appointments WHERE id = $1', [r.body.id])).title, 'Llamar a Royal');
  // La copia de seguridad conserva el recordatorio.
  const exp = await call('admin', 'GET', '/api/backup/export');
  assert.equal(exp.status, 200);
});

test('configuración real: se guardan los datos del negocio, las alertas y los gastos fijos, y la proyección los usa', async () => {
  await fresh();
  const cur = (await call('admin', 'GET', '/api/settings')).body;
  const body = Object.assign({}, cur, { shopName: 'Patitas', address: 'Av. Siempreviva 742', phone: '11 5555-0000', defaultMinStock: 5, expiryDays: 45, fixedMonthly: 300000 });
  const r = await call('admin', 'PUT', '/api/settings', body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.fixedMonthly, 300000);
  assert.equal(r.body.expiryDays, 45);
  const staff = (await call('staff', 'GET', '/api/settings')).body;
  assert.equal(staff.expiryDays, 45);
  assert.equal(staff.fixedMonthly, undefined, 'el empleado no ve los gastos fijos');
  assert.equal((await call('staff', 'PUT', '/api/settings', body)).status, 403);
  const p = (await call('admin', 'GET', '/api/summary/projection')).body;
  assert.equal(p.breakEven.fixedCosts, 300000);
  assert.equal(p.breakEven.fixedSource, 'manual');
  assert.ok((await one("SELECT 1 AS ok FROM audit_log WHERE action = 'Cambio de configuración'")).ok);
});

test('resumen real: horarios pico con pocas ventas no afirman un patrón; la proyección da tres escenarios distintos', async () => {
  await fresh();
  const pid = (await one("INSERT INTO products (name, category, unit, price, cost, stock) VALUES ('Hueso', 'Snacks y premios', 'u', 1000, 500, 100) RETURNING id")).id;
  for (let i = 0; i < 4; i++) {
    const s = await call('staff', 'POST', '/api/sales', { items: [{ type: 'product', id: pid, qty: 1 }], method: 'Efectivo' });
    assert.equal(s.status, 200);
  }
  const today = U.todayAR();
  const h = (await call('staff', 'GET', '/api/summary/hours?from=' + today + '&to=' + today)).body;
  assert.equal(h.reliable, false);
  assert.equal(h.sales, 4);
  assert.equal(h.days, 1);
  assert.match(h.phrase, /no hay suficientes datos/);
  const p = (await call('admin', 'GET', '/api/summary/projection')).body;
  if (p.day < p.daysInMonth) assert.ok(p.projection.sales.prudent < p.projection.sales.expected && p.projection.sales.expected < p.projection.sales.optimistic, JSON.stringify(p.projection));
});

test('actividad real: altas y bajas que antes no quedaban registradas', async () => {
  await fresh();
  const cl = await call('staff', 'POST', '/api/clients', { firstName: 'Ana', lastName: 'Gómez' });
  assert.equal(cl.status, 200, JSON.stringify(cl.body));
  const sup = await call('admin', 'POST', '/api/suppliers', { name: 'Distribuidora Sur' });
  assert.equal(sup.status, 200, JSON.stringify(sup.body));
  assert.equal((await call('admin', 'DELETE', '/api/suppliers/' + sup.body.id)).status, 200);
  const out = await call('admin', 'POST', '/api/cash', { date: U.todayAR(), type: 'out', concept: 'Compra Royal', category: 'Compra de mercadería', method: 'Efectivo', amount: 90000 });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal((await call('admin', 'DELETE', '/api/cash/' + out.body.id)).status, 400, 'sin motivo no se elimina');
  assert.equal((await call('admin', 'DELETE', '/api/cash/' + out.body.id + '?reason=cargado%20dos%20veces')).status, 200);
  await call('admin', 'POST', '/api/cash/closings', { counted: 0 });
  const staffId = (await one("SELECT id FROM users WHERE role = 'staff'")).id;
  const u = await call('admin', 'PATCH', '/api/users/' + staffId, { name: 'Empleado QA', role: 'staff', active: false });
  assert.equal(u.status, 200, JSON.stringify(u.body));
  await call('admin', 'POST', '/api/backups');
  const b = await one('SELECT id FROM backups ORDER BY id DESC LIMIT 1');
  assert.equal((await call('admin', 'DELETE', '/api/backups/' + b.id)).status, 200);
  const acts = (await db.query('SELECT action, reason FROM audit_log ORDER BY id')).rows;
  const names = acts.map((x) => x.action);
  for (const a of ['Alta de cliente', 'Alta de proveedor', 'Baja de proveedor', 'Gasto de caja', 'Egreso de caja eliminado', 'Cierre de caja', 'Usuario desactivado', 'Copia manual creada', 'Copia eliminada']) {
    assert.ok(names.includes(a), 'falta «' + a + '» en ' + names.join(', '));
  }
  assert.equal(acts.find((x) => x.action === 'Egreso de caja eliminado').reason, 'cargado dos veces');
  const filt = (await call('admin', 'GET', '/api/audit')).body.actions;
  assert.ok(filt.includes('Copia restaurada'), 'el filtro ofrece acciones aunque todavía no hayan pasado');
});
