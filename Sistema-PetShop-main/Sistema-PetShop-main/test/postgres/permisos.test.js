'use strict';

/**
 * Regresión de permisos contra la base real (regla de la auditoría: cualquier cambio en Stock, Caja, Usuarios o
 * Ventas re-verifica que el empleado no vea costos, ganancias, caja, copias ni usuarios).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, call, one } = require('./_pg');

test('empleado: «Llegó mercadería» suma stock sin costo ni egreso de caja, y no ve costos', async () => {
  await fresh();
  const pid = (await one("INSERT INTO products (name, category, unit, price, cost, stock) VALUES ('Jaula', 'Accesorios', 'u', 30000, 18000, 1) RETURNING id")).id;
  const ok = await call('staff', 'POST', '/api/products/' + pid + '/purchase', { qty: 3 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.stock, 4);
  for (const body of [{ qty: 1, unitPrice: 100 }, { qty: 1, cash: true }, { qty: 1, paid: 500, method: 'Efectivo', supplierId: 1 }, { qty: 1, paid: 500, method: 'Efectivo', date: '2026-01-01' }]) {
    const r = await call('staff', 'POST', '/api/products/' + pid + '/purchase', body);
    assert.equal(r.status, 403);
  }
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM cash_movements')).n), 0);
  assert.equal(Number((await one('SELECT cost FROM products WHERE id = $1', [pid])).cost), 18000);
  const b = await call('staff', 'GET', '/api/bootstrap');
  assert.equal(b.status, 200);
  assert.equal(b.body.products[0].cost, null);
  assert.equal(b.body.summary, undefined);
});

test('empleado: «Llegó mercadería» con lo que pagó registra el egreso y el costo, sin mostrarle la caja', async () => {
  await fresh();
  const pid = (await one("INSERT INTO products (name, category, unit, price, cost, stock) VALUES ('Jaula', 'Accesorios', 'u', 30000, 18000, 1) RETURNING id")).id;
  const r = await call('staff', 'POST', '/api/products/' + pid + '/purchase', { qty: 4, paid: 80000, method: 'Efectivo' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stock, 5);
  assert.equal(r.body.costChanged, undefined, 'no le muestra el costo anterior ni el margen');
  const cm = await one('SELECT kind, amount, method, category, created_by FROM cash_movements');
  assert.deepEqual([cm.kind, Number(cm.amount), cm.method, cm.category], ['out', 80000, 'Efectivo', 'Compra de mercadería']);
  assert.equal(Number((await one('SELECT cost FROM products WHERE id = $1', [pid])).cost), 20000);
  const a = await one("SELECT a.action, u.role FROM audit_log a JOIN users u ON u.id = a.user_id WHERE a.action = 'Ingreso de mercadería'");
  assert.equal(a.role, 'staff', 'en Actividad queda que lo cargó el empleado');
  // Sin forma de pago válida no registra nada; vacío = no pagó en el momento.
  assert.equal((await call('staff', 'POST', '/api/products/' + pid + '/purchase', { qty: 1, paid: 100, method: 'Bitcoin' })).status, 400);
  assert.equal((await call('staff', 'POST', '/api/products/' + pid + '/purchase', { qty: 1, paid: '' })).status, 200);
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM cash_movements')).n), 1);
  for (const [m, u] of [['GET', '/api/cash'], ['GET', '/api/cash/summary']]) assert.equal((await call('staff', m, u)).status, 403);
});

test('empleado: caja, usuarios, copias, actividad y precios manuales devuelven 403', async () => {
  await fresh();
  const pid = (await one("INSERT INTO products (name, category, unit, price, cost, stock) VALUES ('Jaula', 'Accesorios', 'u', 30000, 18000, 5) RETURNING id")).id;
  for (const [m, u] of [['GET', '/api/cash'], ['GET', '/api/cash/summary'], ['GET', '/api/users'], ['GET', '/api/backups'], ['GET', '/api/audit'], ['GET', '/api/summary/projection'], ['PUT', '/api/products/' + pid]]) {
    const r = await call('staff', m, u, m === 'GET' ? undefined : { name: 'x' });
    assert.equal(r.status, 403, m + ' ' + u);
  }
  const sale = await call('staff', 'POST', '/api/sales', { items: [{ type: 'product', id: pid, qty: 1, price: 1, reason: 'amigo' }], method: 'Efectivo' });
  assert.equal(sale.status, 403);
  const sum = await call('staff', 'GET', '/api/summary');
  assert.equal(sum.status, 200);
  assert.equal(sum.body.kpis.profit, null);
});
