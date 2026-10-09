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
  for (const body of [{ qty: 1, unitPrice: 100 }, { qty: 1, cash: true }]) {
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
