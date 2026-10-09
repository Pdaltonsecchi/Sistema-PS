'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../server/logic');

const TODAY = '2026-10-06';
const food = { name: 'QA Alimento 15kg', category: 'Alimento balanceado', unit: 'u', price: 10000, cost: 7000, expires: null };
const item = (o) => Object.assign({ type: 'product', id: 1, qty: 1, src: food }, o);

test('precio: un empleado que manda otro precio recibe 403', () => {
  assert.throws(() => L.priceSale([item({ price: 1 })], null, { admin: false, today: TODAY }), (e) => e.status === 403 && /Solo el administrador/.test(e.message));
});

test('precio: si el empleado manda el mismo precio de lista, se usa el de la base', () => {
  const s = L.priceSale([item({ price: '10000' })], null, { admin: false, today: TODAY });
  assert.equal(s.total, 10000);
  assert.equal(s.lines[0].price, 10000);
});

test('precio: sin precio enviado se cobra el de lista y la ganancia sale del costo', () => {
  const s = L.priceSale([item({ qty: 2 })], null, { admin: false, today: TODAY });
  assert.equal(s.total, 20000);
  assert.equal(s.costTotal, 14000);
  assert.equal(s.profit, 6000);
});

test('precio: el administrador sin motivo no puede cambiar el precio', () => {
  assert.throws(() => L.priceSale([item({ price: 1 })], null, { admin: true, today: TODAY }), (e) => e.status === 400 && /motivo/.test(e.message));
});

test('precio: el administrador con motivo cambia el precio y queda el de lista guardado', () => {
  const s = L.priceSale([item({ price: 9000, reason: 'cliente frecuente' })], null, { admin: true, today: TODAY });
  assert.equal(s.total, 9000);
  assert.equal(s.lines[0].listPrice, 10000);
  assert.equal(s.lines[0].reason, 'cliente frecuente');
});

test('descuento: porcentaje repartido entre líneas que suman exacto el total', () => {
  const svc = { name: 'Baño', category: 'Baño', unit: 'u', price: 3333.33, cost: 0 };
  const s = L.priceSale([item({}), { type: 'service', id: 2, qty: 1, src: svc }], { type: 'percent', value: 10 }, { admin: false, today: TODAY });
  assert.equal(s.discount, 1333.33);
  assert.equal(Math.round(s.lines.reduce((n, l) => n + l.amount, 0) * 100) / 100, s.total);
});

test('descuento: no puede superar el subtotal ni el 100 %', () => {
  assert.throws(() => L.priceSale([item({})], { type: 'amount', value: 20000 }, { admin: false, today: TODAY }), /mayor que el subtotal/);
  assert.throws(() => L.priceSale([item({})], { type: 'percent', value: 150 }, { admin: false, today: TODAY }), /100 %/);
});

test('vencidos: el empleado no puede venderlos; el dueño tiene que confirmar', () => {
  const old = item({ src: Object.assign({}, food, { expires: '2026-01-01' }) });
  assert.throws(() => L.priceSale([old], null, { admin: false, today: TODAY }), (e) => e.extra.code === 'expired_forbidden');
  assert.throws(() => L.priceSale([old], null, { admin: true, today: TODAY }), (e) => e.extra.code === 'expired');
  assert.equal(L.priceSale([old], null, { admin: true, today: TODAY, confirmExpired: true }).total, 10000);
});

test('pago mixto: los montos tienen que sumar el total', () => {
  assert.deepEqual(L.splitPayments(12000, null, [{ method: 'Efectivo', amount: 5000 }, { method: 'Transferencia', amount: 7000 }]), [
    { method: 'Efectivo', amount: 5000 },
    { method: 'Transferencia', amount: 7000 },
  ]);
  assert.throws(() => L.splitPayments(12000, null, [{ method: 'Efectivo', amount: 5000 }]), /suman/);
  assert.throws(() => L.splitPayments(100, null, [{ method: 'Efectivo', amount: 50 }, { method: 'Efectivo', amount: 50 }]), /repetida/);
  assert.deepEqual(L.splitPayments(500, 'Efectivo', null), [{ method: 'Efectivo', amount: 500 }]);
});

test('agenda: superposición con bordes exactos', () => {
  assert.equal(L.overlaps('10:00', 60, '11:00', 60), false); // 10–11 y 11–12 no se pisan
  assert.equal(L.overlaps('10:00', 60, '10:30', 60), true);
  assert.equal(L.overlaps('10:00', 60, '10:00', 30), true);
  assert.equal(L.overlaps('09:00', 60, '10:00', 15), false);
});

test('agenda: choca la misma mascota o el mismo peluquero; no mascotas distintas sin peluquero', () => {
  const base = { id: 0, petId: 1, date: TODAY, time: '10:00', duration: 60, status: 'reservado', staff: '' };
  const others = [
    { id: 5, petId: 1, date: TODAY, time: '10:30', duration: 30, status: 'reservado', staff: '' },
    { id: 6, petId: 2, date: TODAY, time: '10:00', duration: 60, status: 'reservado', staff: 'Ana' },
    { id: 7, petId: 3, date: TODAY, time: '10:15', duration: 30, status: 'cancelado', staff: 'Ana' },
  ];
  assert.deepEqual(L.findConflicts(base, others).map((x) => x.id), [5]);
  assert.deepEqual(L.findConflicts(Object.assign({}, base, { petId: 9, staff: 'ana' }), others).map((x) => x.id), [6]);
  assert.deepEqual(L.findConflicts(Object.assign({}, base, { petId: 9 }), others), []);
  assert.deepEqual(L.findConflicts(Object.assign({}, base, { petId: 9, staff: 'Ana', time: '11:00' }), others), []);
});

test('agenda: horario comercial (lunes a sábado de 9 a 19, domingo cerrado)', () => {
  assert.equal(L.withinHours(L.DEFAULT_HOURS, '2026-10-05', '09:00', 60), true); // lunes
  assert.equal(L.withinHours(L.DEFAULT_HOURS, '2026-10-05', '03:00', 60), false);
  assert.equal(L.withinHours(L.DEFAULT_HOURS, '2026-10-05', '18:30', 60), false); // termina 19:30
  assert.equal(L.withinHours(L.DEFAULT_HOURS, '2026-10-04', '10:00', 30), false); // domingo
  assert.throws(() => L.checkHours({ 1: ['19:00', '09:00'] }), /cierre/);
});

test('números: variación, margen y punto de equilibrio sin dividir por cero', () => {
  assert.equal(L.pctChange(120, 100), 20);
  assert.equal(L.pctChange(80, 100), -20);
  assert.equal(L.pctChange(50, 0), null);
  assert.equal(L.pctChange(50, null), null);
  assert.equal(L.marginPct(0, 0), null);
  assert.equal(L.marginPct(1000, 250), 25);
  assert.equal(L.breakEven(300000, 30), 1000000);
  assert.equal(L.breakEven(300000, 0), null);
  assert.equal(L.breakEven(300000, null), null);
});

test('proyección: lo vendido es real y solo se proyectan los días que faltan', () => {
  const p = L.projectMonth({ sales: 100000, expenses: 40000, day: 10, daysInMonth: 30, avgSales: 0, avgExpenses: 0 });
  assert.equal(p.sales.expected, 300000); // 10.000 por día × 30
  assert.equal(p.expenses.expected, 120000);
  const q = L.projectMonth({ sales: 100000, expenses: 40000, day: 10, daysInMonth: 30, avgSales: 240000, avgExpenses: 150000 });
  // Ritmo de este mes 10.000/día, historia 8.000/día → esperado 9.000/día para los 20 días que faltan.
  assert.equal(q.sales.expected, 280000);
  assert.equal(q.sales.prudent, 100000 + 7650 * 20); // el menor: 9.000 × 0,85
  assert.equal(q.sales.optimistic, 100000 + 10350 * 20); // el mayor: 9.000 × 1,15
  assert.equal(L.projectMonth({ sales: 50, expenses: 0, day: 30, daysInMonth: 30, avgSales: 0, avgExpenses: 0 }).sales.optimistic, 50);
  assert.equal(L.reachDay(100000, 200000, 10, 30), 20);
  assert.equal(L.reachDay(100000, 500000, 10, 30), null);
  assert.equal(L.reachDay(0, 1000, 5, 30), null);
});

test('proyección: los tres escenarios no dan lo mismo (antes, sin meses anteriores, eran iguales)', () => {
  const p = L.projectMonth({ sales: 120000, expenses: 30000, day: 8, daysInMonth: 31, avgSales: 0, avgExpenses: 0 });
  assert.ok(p.sales.prudent < p.sales.expected && p.sales.expected < p.sales.optimistic);
  // En gastos, el escenario prudente es el que gasta más.
  assert.ok(p.expenses.prudent > p.expenses.expected && p.expenses.expected > p.expenses.optimistic);
  assert.ok(p.sales.prudent >= 120000, 'nunca menos de lo ya vendido');
});

test('clientes perdidos: compraban seguido y hace mucho que no vuelven', () => {
  const rows = [
    { id: 1, purchases: 6, first: '2026-04-01', last: '2026-07-01' }, // cada ~18 días, hace 97 días
    { id: 2, purchases: 5, first: '2026-08-01', last: '2026-10-01' }, // reciente
    { id: 3, purchases: 1, first: '2026-01-01', last: '2026-01-01' }, // una sola compra: no cuenta
  ];
  const lost = L.lostClients(rows, TODAY, 30);
  assert.deepEqual(lost.map((x) => x.id), [1]);
  assert.equal(lost[0].daysSince, 97);
});

test('franja pico: frase con la mejor franja de 2 horas', () => {
  const f = L.peakPhrase([{ dow: 6, hour: 11, n: 5, total: 600 }, { dow: 6, hour: 12, n: 3, total: 400 }, { dow: 2, hour: 9, n: 1, total: 300 }]);
  assert.match(f, /sábados de 11 a 13 hs concentran el 77 %/);
  assert.equal(L.peakPhrase([]), '');
});

test('agenda: dos recordatorios sin mascota a la misma hora no chocan entre sí', () => {
  const rem = { id: 0, petId: null, date: '2099-06-01', time: '15:00', duration: 15, status: 'reservado', staff: '' };
  const others = [{ id: 1, petId: null, date: '2099-06-01', time: '15:00', duration: 15, status: 'reservado', staff: '' }];
  assert.deepEqual(L.findConflicts(rem, others), []);
  assert.deepEqual(L.findOverlaps(rem, others), []);
  // Un turno de mascota no avisa por un recordatorio a la misma hora.
  assert.deepEqual(L.findOverlaps({ id: 0, petId: 3, date: '2099-06-01', time: '15:00', duration: 60, status: 'reservado' }, others), []);
});

test('franja pico: con pocas ventas no afirma un patrón', () => {
  const cells = [{ dow: 3, hour: 20, n: 4, total: 8100 }, { dow: 1, hour: 11, n: 1, total: 1900 }];
  const f = L.peakPhrase(cells, { sales: 5, days: 2 });
  assert.doesNotMatch(f, /concentran/);
  assert.match(f, /no hay suficientes datos.*al menos 20 ventas en 7 días distintos.*5 ventas en 2 días/);
  assert.match(L.peakPhrase(cells, { sales: 25, days: 9 }), /miércoles de 19 a 21 hs concentran el 81 %/);
});

test('CSV: evita fórmulas de Excel y escapa comillas, ; y saltos de línea', () => {
  assert.equal(L.csvCell('=1+1'), "'=1+1");
  assert.equal(L.csvCell('+54 11'), "'+54 11");
  assert.equal(L.csvCell('-5'), "'-5");
  assert.equal(L.csvCell('@SUMA'), "'@SUMA");
  assert.equal(L.csvCell('Juan; Pérez'), '"Juan; Pérez"');
  assert.equal(L.csvCell('O"Brien'), '"O""Brien"');
  assert.equal(L.csvCell('a\nb'), '"a\nb"');
  assert.ok(L.csvDoc(['A'], [['=1+1']]).startsWith('﻿'));
});

test('códigos de barras: normalización UPC-A / EAN-13 / GTIN-14 y dígito verificador', () => {
  assert.equal(L.normalizeBarcode(' 0 36000 29145 2 '), '0036000291452');
  assert.equal(L.normalizeBarcode('036000291452'), '0036000291452');
  assert.equal(L.normalizeBarcode('00036000291452'), '0036000291452');
  assert.equal(L.normalizeBarcode('7790001000012'), '7790001000012');
  assert.equal(L.normalizeBarcode(''), null);
  assert.throws(() => L.normalizeBarcode('a\'; DROP'), /solo puede tener/);
  assert.equal(L.gtinValid('7790580120054'), true);
  assert.equal(L.gtinValid('7790580120059'), false);
  assert.equal(L.gtinValid('036000291452'), true);
  assert.equal(L.gtinValid('96385074'), true);
  assert.equal(L.gtinValid('ABC-123'), true); // Code 128 / QR: no se verifica
});

test('producto: precio $ 0 solo si es regalo; costo mayor al precio pide confirmación', () => {
  assert.throws(() => L.checkProductPrice(0, 0, false, false), /no puede ser \$ 0/);
  assert.equal(L.checkProductPrice(0, 500, true, false), null);
  assert.throws(() => L.checkProductPrice(800, 1000, false, false), (e) => e.extra.code === 'loss' && /perdés \$ 200/.test(e.message));
  assert.equal(L.checkProductPrice(800, 1000, false, true), null);
  assert.equal(L.checkProductPrice(1200, 1000, false, false), null);
});
