'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, call, one, db } = require('./_pg');

async function seed() {
  await fresh();
  const p = async (name, price, cost, stock) => (await one("INSERT INTO products (name, category, unit, price, cost, stock) VALUES ($1, 'Accesorios', 'u', $2, $3, $4) RETURNING id", [name, price, cost, stock])).id;
  const ids = { jaula: await p('Jaula', 30000, 18000, 5), correa: await p('Correa', 5000, 3000, 2) };
  ids.bano = (await one("INSERT INTO services (name, category, price, duration_min) VALUES ('Baño', 'Baño', 9000, 60) RETURNING id")).id;
  ids.ana = (await one("INSERT INTO clients (first_name, last_name) VALUES ('Ana', 'Gómez') RETURNING id")).id;
  ids.beto = (await one("INSERT INTO clients (first_name, last_name) VALUES ('Beto', 'Ruiz') RETURNING id")).id;
  ids.firu = (await one("INSERT INTO pets (client_id, name) VALUES ($1, 'Firu') RETURNING id", [ids.ana])).id;
  return ids;
}
const count = async (t) => Number((await one('SELECT COUNT(*) AS n FROM ' + t)).n);

test('venta real: varias líneas y pago mixto quedan bien registradas en una sola transacción', async () => {
  const id = await seed();
  const r = await call('staff', 'POST', '/api/sales', {
    idemKey: 'k1', clientId: id.ana, petId: id.firu,
    items: [{ type: 'product', id: id.jaula, qty: 2 }, { type: 'product', id: id.correa, qty: 1 }, { type: 'service', id: id.bano, qty: 1 }],
    payments: [{ method: 'Efectivo', amount: 4000 }, { method: 'Transferencia', amount: 70000 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.number, 1);
  assert.equal(r.body.total, 74000);
  assert.deepEqual(r.body.stock, [{ id: id.jaula, qty: 2 }, { id: id.correa, qty: 1 }]);
  const s = await one('SELECT * FROM sales WHERE id = $1', [r.body.id]);
  assert.equal(s.method, 'Mixto');
  assert.equal(Number(s.cost_total), 39000);
  assert.ok(s.cash_id);
  assert.equal(await count('sale_items'), 3);
  assert.equal(Number((await one('SELECT stock FROM products WHERE id = $1', [id.jaula])).stock), 3);
  assert.equal(Number((await one('SELECT stock FROM products WHERE id = $1', [id.correa])).stock), 1);
  const pays = (await db.query('SELECT p.method, p.amount, c.concept FROM sale_payments p JOIN cash_movements c ON c.id = p.cash_id ORDER BY p.id')).rows;
  assert.deepEqual(pays.map((x) => [x.method, Number(x.amount)]), [['Efectivo', 4000], ['Transferencia', 70000]]);
  assert.match(pays[0].concept, /^Venta N° 1 – 3 artículos \(pago mixto\)$/);
  assert.equal(await count("stock_movements WHERE reason = 'Venta' AND sale_id = " + r.body.id), 2);

  // El mismo pedido otra vez (doble clic o reintento): devuelve la misma venta, no crea otra.
  const again = await call('staff', 'POST', '/api/sales', { idemKey: 'k1', items: [{ type: 'product', id: id.jaula, qty: 2 }], method: 'Efectivo' });
  assert.equal(again.body.repeated, true);
  assert.equal(again.body.id, r.body.id);
  assert.equal(await count('sales'), 1);
});

test('venta real: sin stock suficiente no se registra nada y el número no se consume', async () => {
  const id = await seed();
  const fail = await call('staff', 'POST', '/api/sales', { items: [{ type: 'product', id: id.jaula, qty: 1 }, { type: 'product', id: id.correa, qty: 3 }], method: 'Efectivo' });
  assert.equal(fail.status, 409);
  assert.match(fail.body.error, /No hay stock suficiente de Correa: quedan 2/);
  assert.equal(await count('sales'), 0);
  assert.equal(await count('cash_movements'), 0);
  assert.equal(Number((await one('SELECT stock FROM products WHERE id = $1', [id.jaula])).stock), 5);
  const ok = await call('staff', 'POST', '/api/sales', { items: [{ type: 'product', id: id.correa, qty: 2 }], method: 'Efectivo' });
  assert.equal(ok.body.number, 1);
});

test('venta real: la misma línea repetida descuenta la suma y respeta el stock', async () => {
  const id = await seed();
  const r = await call('staff', 'POST', '/api/sales', { items: [{ type: 'product', id: id.correa, qty: 1 }, { type: 'product', id: id.correa, qty: 2 }], method: 'Efectivo' });
  assert.equal(r.status, 409);
  const ok = await call('staff', 'POST', '/api/sales', { items: [{ type: 'product', id: id.correa, qty: 1 }, { type: 'product', id: id.correa, qty: 1 }], method: 'Efectivo' });
  assert.equal(ok.status, 200);
  assert.equal(Number((await one('SELECT stock FROM products WHERE id = $1', [id.correa])).stock), 0);
});

test('venta real: cliente, mascota y turno se validan y el turno queda entregado', async () => {
  const id = await seed();
  const bad = await call('staff', 'POST', '/api/sales', { clientId: id.beto, petId: id.firu, items: [{ type: 'service', id: id.bano }], method: 'Efectivo' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /no es de ese cliente/);
  const noClient = await call('staff', 'POST', '/api/sales', { clientId: 9999, items: [{ type: 'service', id: id.bano }], method: 'Efectivo' });
  assert.equal(noClient.status, 404);
  const noAppt = await call('staff', 'POST', '/api/sales', { appointmentId: 9999, items: [{ type: 'service', id: id.bano }], method: 'Efectivo' });
  assert.equal(noAppt.status, 404);
  assert.equal(await count('sales'), 0);
  const appt = (await one("INSERT INTO appointments (pet_id, service_id, on_date, at_time, status) VALUES ($1, $2, CURRENT_DATE, '10:00', 'listo') RETURNING id", [id.firu, id.bano])).id;
  const ok = await call('staff', 'POST', '/api/sales', { clientId: id.ana, petId: id.firu, appointmentId: appt, items: [{ type: 'service', id: id.bano }], method: 'Tarjeta de débito' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const a = await one('SELECT status, sale_id FROM appointments WHERE id = $1', [appt]);
  assert.equal(a.status, 'entregado');
  assert.equal(a.sale_id, ok.body.id);
});

test('venta real: el precio manual del dueño queda en la actividad', async () => {
  const id = await seed();
  const r = await call('admin', 'POST', '/api/sales', { items: [{ type: 'product', id: id.jaula, qty: 1, price: 25000, reason: 'cliente frecuente' }], method: 'Efectivo' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = await one("SELECT * FROM audit_log WHERE action = 'Precio manual'");
  assert.equal(a.reason, 'cliente frecuente');
  assert.equal(Number((await one('SELECT list_price FROM sale_items')).list_price), 30000);
});

test('venta real: dos «Cobrar» simultáneos con la misma clave registran una sola venta', async () => {
  const id = await seed();
  const body = { idemKey: 'doble', items: [{ type: 'product', id: id.jaula, qty: 1 }], method: 'Efectivo' };
  const [a, b] = await Promise.all([call('staff', 'POST', '/api/sales', body), call('staff', 'POST', '/api/sales', body)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.id, b.body.id);
  assert.equal(await count('sales'), 1);
  assert.equal(await count('cash_movements'), 1);
  assert.equal(Number((await one('SELECT stock FROM products WHERE id = $1', [id.jaula])).stock), 4);
});

test.after(() => db.close());
