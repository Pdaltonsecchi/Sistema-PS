'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { api, call, reset, state } = require('./_fake');

/**
 * Tabla de permisos: todo lo que muestra costos, ganancias, caja, reportes con plata, copias, usuarios,
 * configuración, actividad o anula ventas es solo del dueño. Se verifica en el servidor, ruta por ruta.
 */
const ADMIN_ONLY = [
  ['GET', '/api/users'], ['POST', '/api/users'], ['PATCH', '/api/users/1'],
  ['PUT', '/api/settings'], ['GET', '/api/audit'],
  ['POST', '/api/products'], ['PUT', '/api/products/1'], ['DELETE', '/api/products/1'], ['POST', '/api/products/1/barcodes'],
  ['POST', '/api/products/1/adjust'], ['GET', '/api/products/1/movements'], ['POST', '/api/products/bulk-price'],
  ['POST', '/api/services'], ['PUT', '/api/services/1'], ['DELETE', '/api/services/1'],
  ['POST', '/api/suppliers'], ['PUT', '/api/suppliers/1'], ['DELETE', '/api/suppliers/1'], ['GET', '/api/suppliers/1/detail'],
  ['POST', '/api/sales/1/void'],
  ['GET', '/api/cash'], ['GET', '/api/cash/export'], ['GET', '/api/cash/summary'], ['POST', '/api/cash'], ['DELETE', '/api/cash/1'],
  ['GET', '/api/cash/closings'], ['POST', '/api/cash/closings'],
  ['GET', '/api/summary/monthly'], ['GET', '/api/summary/monthly/export'], ['GET', '/api/summary/products'], ['GET', '/api/summary/products/export'],
  ['GET', '/api/summary/compare'], ['GET', '/api/summary/staff'], ['GET', '/api/summary/projection'], ['GET', '/api/summary/sales-export'],
  ['GET', '/api/summary/clients/export'],
  ['POST', '/api/report/send'], ['GET', '/api/report/preview'], ['GET', '/api/report/log'],
  ['GET', '/api/backups'], ['POST', '/api/backups'], ['DELETE', '/api/backups/1'], ['GET', '/api/backups/current'],
  ['POST', '/api/backups/1/restore'], ['GET', '/api/backup/export'], ['POST', '/api/restore'],
  ['DELETE', '/api/clients/1'], ['DELETE', '/api/pets/1'],
];

test('tabla de permisos: el empleado recibe 403 en cada ruta del dueño', async () => {
  reset();
  for (const [m, u] of ADMIN_ONLY) {
    const r = await call('staff', m, u, m === 'GET' || m === 'DELETE' ? undefined : {});
    assert.equal(r.status, 403, m + ' ' + u + ' debería ser solo del dueño');
  }
});

test('tabla de permisos: no hay rutas del dueño sin declarar en la tabla', () => {
  const declared = new Set(ADMIN_ONLY.map(([m, u]) => m + ' ' + u.replace(/\/1(?=\/|$)/g, '/:id')));
  const missing = api.routes.filter((r) => r.opts.admin).map((r) => r.method + ' ' + r.re.source.slice(1, -1).replace(/\(\[\^\/\]\+\)/g, ':id').replace(/\\\//g, '/'));
  const notDeclared = missing.filter((x) => !declared.has(x));
  assert.deepEqual(notDeclared, []);
});

test('sin sesión: 401 con mensaje claro', async () => {
  reset();
  const r = await call(null, 'GET', '/api/bootstrap');
  assert.equal(r.status, 401);
  assert.match(r.body.error, /Volvé a ingresar/);
});

test('el empleado no puede leer la caja aunque llame a la API directo', async () => {
  reset();
  const r = await call('staff', 'GET', '/api/cash?period=month');
  assert.equal(r.status, 403);
  assert.match(r.body.error, /solo lo puede hacer el dueño/);
});

test('el empleado no ve costos en el catálogo', async () => {
  reset([[/FROM products p ORDER BY/, [{ id: 1, name: 'QA', brand: '', category: 'Otros', unit: 'u', stock: 3, min_stock: 1, price: 100, cost: 60 }]]]);
  const r = await call('staff', 'GET', '/api/bootstrap');
  assert.equal(r.status, 200);
  assert.equal(r.body.products[0].cost, null);
  assert.equal(r.body.summary, undefined);
  const a = await call('admin', 'GET', '/api/bootstrap');
  assert.equal(a.body.products[0].cost, 60);
});

test('el empleado no puede cargar costo ni gasto de caja al ingresar mercadería', async () => {
  reset([[/SELECT unit, cost, price FROM products/, [{ unit: 'u', cost: 50, price: 100 }]]]);
  const r = await call('staff', 'POST', '/api/products/1/purchase', { qty: 2, unitPrice: 40, cash: true });
  assert.equal(r.status, 403);
});

test('el empleado no ve resúmenes con ganancia (solo ventas y cantidades)', async () => {
  reset([[/COUNT\(\*\) AS n, COALESCE\(SUM\(total\), 0\) AS total, COALESCE\(SUM\(cost_total\)/, [{ n: 2, total: 1000, cost: 600 }]]]);
  const r = await call('staff', 'GET', '/api/summary?from=2026-10-01&to=2026-10-06');
  assert.equal(r.status, 200);
  assert.equal(r.body.kpis.total, 1000);
  assert.equal(r.body.kpis.profit, null);
  assert.equal(r.body.drawer, undefined);
  const a = await call('admin', 'GET', '/api/summary?from=2026-10-01&to=2026-10-06');
  assert.equal(a.body.kpis.profit, 400);
});

/* ---------- Ventas contra la API real (base simulada) ---------- */
const QA_PRODUCT = { type: 'product', id: 1, name: 'QA Alimento 15kg', category: 'Alimento balanceado', unit: 'u', price: 10000, cost: 7000, expires: null };
function saleRules(stockOk, dup) {
  const ok = typeof stockOk === 'function' ? stockOk : () => stockOk;
  return [
    // Una sola lectura trae los artículos, el cliente, la mascota y la venta repetida (misma clave), si la hay.
    [/UNION ALL SELECT 'dup'/, () => [QA_PRODUCT].concat(dup ? [{ type: 'dup', id: 77, name: '5', price: 10000, cost: 0 }] : [])],
    [/INSERT INTO sales/, [{ id: 77 }]],
    [/UPDATE products p SET stock = p.stock - v.qty/, () => (ok() ? [{ id: 1 }] : [])],
    [/SELECT name, stock, unit FROM products WHERE id/, [{ name: 'QA Alimento 15kg', stock: 0, unit: 'u' }]],
  ];
}
const salesInsert = () => state.log.filter((x) => /INSERT INTO sales/.test(x.sql)).pop();

test('venta: el empleado que intenta cobrar $ 1 un producto de $ 10.000 es rechazado y no se registra nada', async () => {
  reset(saleRules(true));
  const r = await call('staff', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 1, price: 1 }] });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Solo el administrador puede cambiar precios/);
  assert.equal(salesInsert(), undefined);
});

test('venta: sin precio enviado, el total usa el precio de lista de la base', async () => {
  reset(saleRules(true));
  const r = await call('staff', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 2 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 20000);
  const ins = salesInsert();
  assert.equal(ins.params[10], 20000); // total
  assert.equal(ins.params[11], 14000); // costo de lo vendido
});

test('venta: el dueño puede cambiar el precio solo con motivo y queda auditado', async () => {
  reset(saleRules(true));
  const sin = await call('admin', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 1, price: 1 }] });
  assert.equal(sin.status, 400);
  reset(saleRules(true));
  const con = await call('admin', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 1, price: 9000, reason: 'cliente frecuente' }] });
  assert.equal(con.status, 200);
  assert.equal(con.body.total, 9000);
  const aud = state.log.find((x) => /INSERT INTO audit_log/.test(x.sql));
  assert.equal(aud.params[2], 'Precio manual');
  assert.equal(aud.params[7], 'cliente frecuente');
});

test('numeración: una venta rechazada por falta de stock no consume el número', async () => {
  let n = 0;
  reset(saleRules(() => ++n > 1)); // la primera vez no hay stock, la segunda sí
  const fail = await call('staff', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 1 }] });
  assert.equal(fail.status, 409);
  assert.match(fail.body.error, /No hay stock suficiente/);
  const ok = await call('staff', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 1 }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.number, 1);
  const ok2 = await call('staff', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 1 }] });
  assert.equal(ok2.body.number, 2);
});

test('idempotencia: la misma clave dos veces devuelve la misma venta', async () => {
  reset(saleRules(true, true));
  const r = await call('staff', 'POST', '/api/sales', { idemKey: 'abc-123', method: 'Efectivo', items: [{ type: 'product', id: 1, qty: 1 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.repeated, true);
  assert.equal(r.body.number, 5);
  assert.equal(salesInsert(), undefined);
});

test('anular: el motivo es obligatorio', async () => {
  reset();
  const r = await call('admin', 'POST', '/api/sales/1/void', { reason: 'x' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /motivo/);
});

/* ---------- Agenda contra la API real ---------- */
function apptRules(existing) {
  return [
    [/SELECT id FROM pets WHERE id/, [{ id: 1 }]],
    [/SELECT id FROM services WHERE id/, [{ id: 1 }]],
    [/FROM appointments a JOIN pets pt ON pt.id = a.pet_id WHERE a.on_date = \$1/, existing || []],
    [/INSERT INTO appointments/, [{ id: 50 }]],
  ];
}
const future = '2099-06-01'; // lunes

test('agenda: no se reserva en una fecha pasada (sí se carga como entregado)', async () => {
  reset(apptRules());
  const r = await call('staff', 'POST', '/api/appointments', { petId: 1, date: '2020-01-06', time: '10:00', duration: 60 });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'past_reserved');
  const h = await call('staff', 'POST', '/api/appointments', { petId: 1, date: '2020-01-06', time: '10:00', duration: 60, status: 'entregado', confirmPast: true });
  assert.equal(h.status, 200);
});

test('agenda: misma mascota a la misma hora → 409 con el detalle, sin posibilidad de forzarlo', async () => {
  const existing = [{ id: 9, pet_id: 1, on_date: future, at_time: '10:00:00', duration_min: 60, status: 'reservado', staff: '', pet: 'Firu' }];
  reset(apptRules(existing));
  const r = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '10:30', duration: 60, confirmOverlap: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'overlap_forbidden');
  assert.match(r.body.error, /Firu ya tiene un turno de 10:00 a 11:00/);
  const a = await call('admin', 'POST', '/api/appointments', { petId: 1, date: future, time: '10:30', duration: 60, confirmOverlap: true });
  assert.equal(a.status, 409);
  assert.equal(a.body.code, 'overlap_forbidden');
});

test('agenda: dos turnos a la misma hora se pueden pisar solo si los atiende personal distinto', async () => {
  const existing = [{ id: 9, pet_id: 2, on_date: future, at_time: '10:00:00', duration_min: 60, status: 'reservado', staff: 'Ana', pet: 'Michi' }];
  reset(apptRules(existing));
  const same = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '10:30', duration: 60, staff: 'ana' });
  assert.equal(same.status, 409);
  assert.equal(same.body.code, 'overlap_forbidden');
  assert.match(same.body.error, /ya atiende a Michi/);
  const other = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '10:30', duration: 60, staff: 'Luis', confirmOverlap: true });
  assert.equal(other.status, 200); // personal distinto: se permite (avisando, ver el test siguiente)
});

test('agenda: dos turnos a la misma hora con mascotas y personal distintos avisan, y se pueden agendar si se confirma', async () => {
  const existing = [{ id: 9, pet_id: 2, on_date: future, at_time: '10:00:00', duration_min: 60, status: 'reservado', staff: 'Ana', pet: 'Michi' }];
  reset(apptRules(existing));
  const w = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '10:00', duration: 60, staff: 'Luis' });
  assert.equal(w.status, 409);
  assert.equal(w.body.code, 'overlap_soft');
  assert.match(w.body.error, /Ya hay otro turno en ese horario: 10:00 \(Michi, Ana\)/);
  const ok = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '10:00', duration: 60, staff: 'Luis', confirmOverlap: true });
  assert.equal(ok.status, 200);
  // sin personal asignado también avisa
  const w2 = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '10:30', duration: 30 });
  assert.equal(w2.body.code, 'overlap_soft');
});

test('agenda: confirmar guarda confirmed_at y el cambio de estado devuelve el estado real; el pase automático exige confirmación previa al fin del turno', async () => {
  reset([[/UPDATE appointments SET status = \$1/, [{ id: 7, status: 'confirmado' }]]]);
  const r = await call('staff', 'POST', '/api/appointments/7/status', { status: 'confirmado' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'confirmado');
  assert.ok(state.log.some((q) => /confirmed_at = COALESCE\(confirmed_at, now\(\)\)/.test(q.sql)));
  assert.ok(!state.log.some((q) => /status = 'listo'/.test(q.sql) && /UPDATE appointments/.test(q.sql)), 'confirmar no debe tocar «listo»');
  reset([[/FROM appointments a JOIN pets/, []]]);
  await call('staff', 'GET', '/api/appointments?from=2099-06-01&to=2099-06-07');
  const auto = state.log.find((q) => /UPDATE appointments SET status = 'listo'/.test(q.sql));
  assert.ok(auto && /confirmed_at IS NOT NULL/.test(auto.sql) && /confirmed_at AT TIME ZONE[^)]*\) </.test(auto.sql), 'solo avanza turnos confirmados antes de que terminen');
});

test('agenda: turno contiguo (11 a 12 después de 10 a 11) no se pisa', async () => {
  reset(apptRules([{ id: 9, pet_id: 1, on_date: future, at_time: '10:00:00', duration_min: 60, status: 'reservado', staff: '', pet: 'Firu' }]));
  const r = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '11:00', duration: 60 });
  assert.equal(r.status, 200);
});

test('agenda: a las 03:00 queda fuera del horario y pide confirmación', async () => {
  reset(apptRules());
  const r = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '03:00', duration: 60 });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'hours');
  const ok = await call('staff', 'POST', '/api/appointments', { petId: 1, date: future, time: '03:00', duration: 60, confirmHours: true });
  assert.equal(ok.status, 200);
});

/* ---------- Textos con comillas, ; y palabras SQL ---------- */
test("clientes: O'Brien, «Juan; Pérez» y notas con «select» se guardan como texto (consultas parametrizadas)", async () => {
  for (const name of ["O'Brien", 'Juan; Pérez', "a'; DROP TABLE clients;--"]) {
    reset([[/INSERT INTO clients/, [{ id: 1 }]]]);
    const r = await call('staff', 'POST', '/api/clients', { firstName: name, notes: 'select * from mascotas <img src=x onerror=alert(1)>' });
    assert.equal(r.status, 200, name);
    const ins = state.log.find((x) => /INSERT INTO clients/.test(x.sql));
    assert.equal(ins.params[0], name); // viaja como parámetro, nunca dentro del SQL
    assert.ok(!ins.sql.includes(name));
  }
});

test('mensajes de validación en lenguaje natural', async () => {
  reset();
  const r = await call('staff', 'POST', '/api/clients', { firstName: '' });
  assert.equal(r.body.error, 'Completá «Nombre».');
  const d = await call('staff', 'POST', '/api/sales', { method: 'Efectivo', items: [{ type: 'product', id: 1 }], discount: { type: 'x', value: 5 } });
  assert.ok(!/Valor inválido/.test(d.body.error));
});
