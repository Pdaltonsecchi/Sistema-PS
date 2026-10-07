'use strict';

/**
 * Servidor de demostración SIN base de datos: levanta el sistema real (server/index.js) con una base simulada en
 * memoria y datos de prueba con prefijo "QA". Sirve para revisar la interfaz en el navegador sin PostgreSQL.
 * Uso: npm run demo  → http://localhost:3999  (rol: ?rol=empleado en la primera visita cambia al empleado).
 * No guarda nada: cada acción responde, pero los datos vuelven a ser los de ejemplo.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://demo/sin-base';
process.env.PORT = process.env.PORT || '3999';
const { reset, USERS } = require('./_fake');
const auth = require('../server/auth');
const U = require('../server/util');

const today = U.todayAR();
const d = (n) => U.addDays(today, n);
const products = [
  { id: 1, name: 'QA Alimento perro adulto 15 kg', brand: 'QA Marca', category: 'Alimento balanceado', species: 'Perro', unit: 'u', stock: 8, min_stock: 3, price: 52000, cost: 38000, pack_kg: 15, loose_id: 2, supplier_id: 1, barcode: '7790000000014', codes: ['7790000000014'], expires_on: d(120), is_gift: false },
  { id: 2, name: 'QA Alimento perro adulto suelto', brand: 'QA Marca', category: 'Alimento balanceado', species: 'Perro', unit: 'kg', stock: 4.5, min_stock: 5, price: 4200, cost: 2533, supplier_id: 1, codes: [], expires_on: null, is_gift: false },
  { id: 3, name: 'QA Piedras sanitarias 4 kg', brand: 'QA Gatuno', category: 'Higiene y cuidado', species: 'Gato', unit: 'u', stock: 0, min_stock: 4, price: 6500, cost: 4100, supplier_id: 2, barcode: '7790000000021', codes: ['7790000000021'], expires_on: null, is_gift: false },
  { id: 4, name: 'QA Snack dental x 7', brand: 'QA Snacks', category: 'Snacks y premios', species: 'Perro', unit: 'u', stock: 25, min_stock: 6, price: 3200, cost: 3500, supplier_id: null, codes: [], expires_on: d(-3), is_gift: false },
  { id: 5, name: 'QA Collar con nombre muy largo para probar que el texto no se superpone con nada en el carrito', brand: 'QA Acc', category: 'Accesorios', species: 'Perro y gato', unit: 'u', stock: 12, min_stock: 2, price: 8900, cost: 4000, supplier_id: 2, codes: [], expires_on: null, is_gift: false },
];
const services = [{ id: 1, name: 'QA Baño perro chico', category: 'Baño', price: 9000, duration_min: 60 }, { id: 2, name: 'QA Baño y corte perro grande', category: 'Peluquería', price: 18000, duration_min: 120 }];
const clients = [
  { id: 1, first_name: 'QA Juana', last_name: "O'Brien", phone: '11 5555-1234', email: 'juana@example.com', address: 'Calle Falsa 123', notes: 'Compra alimento cada mes', created_at: d(-60) },
  { id: 2, first_name: 'QA Ñandú', last_name: 'Pérez', phone: '', email: '', address: '', notes: '', created_at: d(-2) },
];
const pets = [{ id: 1, client_id: 1, name: 'Firu', species: 'Perro', breed: 'Caniche', size: 'Chico', birth: '2020-05-01', notes: 'Se pone nervioso con el secador' }, { id: 2, client_id: 2, name: 'Michi', species: 'Gato', breed: '', size: null, birth: null, notes: '' }];
const appts = [
  { id: 1, pet_id: 1, service_id: 1, on_date: today, at_time: '10:00:00', duration_min: 60, status: 'reservado', notes: '', sale_id: null, staff: 'Ana', pet_name: 'Firu', species: 'Perro', breed: 'Caniche', size: 'Chico', pet_notes: 'Se pone nervioso con el secador', client_id: 1, first_name: 'QA Juana', last_name: "O'Brien", phone: '11 5555-1234', service_name: 'QA Baño perro chico', service_price: 9000 },
  { id: 2, pet_id: 2, service_id: 2, on_date: today, at_time: '10:30:00', duration_min: 120, status: 'en_curso', notes: '', sale_id: null, staff: 'Ana', pet_name: 'Michi', species: 'Gato', breed: '', size: null, pet_notes: '', client_id: 2, first_name: 'QA Ñandú', last_name: 'Pérez', phone: '', service_name: 'QA Baño y corte perro grande', service_price: 18000 },
];
const sales = [
  { id: 1, number: 1, on_date: today, method: 'Efectivo', subtotal: 52000, discount: 0, total: 52000, cost_total: 38000, note: '', voided_at: null, void_reason: '', created_at: new Date().toISOString(), client_id: 1, pet_id: 1, first_name: 'QA Juana', last_name: "O'Brien", pet_name: 'Firu', seller: 'Dueña QA', summary: 'QA Alimento perro adulto 15 kg' },
  { id: 2, number: 2, on_date: today, method: 'Mixto', subtotal: 12100, discount: 0, total: 12100, cost_total: 7500, note: '', voided_at: new Date().toISOString(), void_reason: 'QA prueba', created_at: new Date().toISOString(), client_id: null, pet_id: null, seller: 'Empleado QA', summary: 'QA Snack dental x 7, QA Collar' },
];
reset([
  [/FROM products p ORDER BY/, products],
  [/SELECT id, name, category, price, duration_min FROM services/, services],
  [/FROM suppliers/, [{ id: 1, name: 'QA Distribuidora', phone: '11 4444-0000', email: 'ventas@example.com', description: 'Alimento', products: 2, purchases: 1 }, { id: 2, name: 'QA Accesorios SA', phone: '', email: '', description: '', products: 2, purchases: 0 }]],
  [/SELECT \* FROM clients ORDER BY/, clients],
  [/SELECT \* FROM clients WHERE id/, (p) => clients.filter((c) => c.id === Number(p[0]))],
  [/SELECT \* FROM pets ORDER BY/, pets],
  [/SELECT \* FROM pets WHERE client_id/, (p) => pets.filter((x) => x.client_id === Number(p[0]))],
  [/FROM appointments a JOIN pets pt ON pt.id = a.pet_id JOIN clients cl/, appts],
  [/SELECT DISTINCT staff FROM appointments/, [{ staff: 'Ana' }]],
  [/FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN pets pt ON pt.id = s.pet_id LEFT JOIN users u ON u.id = s.created_by WHERE s.id = \$1/, (p) => sales.filter((s) => s.id === Number(p[0]))],
  [/FROM sales s LEFT JOIN clients c ON c.id = s.client_id/, sales],
  [/SELECT kind, name, unit, qty, unit_price, list_price, price_reason, unit_cost, amount FROM sale_items/, [{ kind: 'product', name: 'QA Alimento perro adulto 15 kg', unit: 'u', qty: 1, unit_price: 52000, list_price: 52000, price_reason: '', unit_cost: 38000, amount: 52000 }]],
  [/SELECT method, amount FROM sale_payments/, [{ method: 'Efectivo', amount: 52000 }]],
  [/SELECT on_date AS k, SUM\(total\)/, [{ k: today, total: 64100, profit: 18600, n: 3 }, { k: d(-1), total: 30000, profit: 9000, n: 2 }]],
  [/GROUP BY i.name, i.unit/, [{ name: 'QA Alimento perro adulto 15 kg', unit: 'u', qty: 3, total: 156000, profit: 42000 }, { name: 'QA Snack dental x 7', unit: 'u', qty: 5, total: 16000, profit: -1500 }]],
  [/AS category, SUM\(i.amount\) AS total FROM sale_items/, [{ category: 'Alimento balanceado', total: 156000 }, { category: 'Peluquería', total: 18000 }]],
  [/SELECT p.method, SUM\(p.amount\)/, [{ method: 'Efectivo', total: 100000 }, { method: 'Transferencia', total: 74000 }]],
  [/EXTRACT\(DOW/, [{ dow: 6, hour: 11, n: 4, total: 80000 }, { dow: 6, hour: 12, n: 2, total: 30000 }, { dow: 2, hour: 17, n: 1, total: 9000 }]],
  [/to_char\(on_date, 'YYYY-MM'\) AS ym, COUNT/, [{ ym: today.slice(0, 7), n: 5, total: 174000, cost: 120000 }]],
  [/to_char\(on_date, 'YYYY-MM'\) AS ym, kind/, [{ ym: today.slice(0, 7), kind: 'out', category: 'Alquiler y servicios', total: 50000 }]],
  [/SELECT id, email, name, role, active FROM users/, [{ id: 1, email: 'qa-duena@test', name: 'Dueña QA', role: 'admin', active: true }, { id: 2, email: 'qa-empleado@test', name: 'Empleado QA', role: 'staff', active: true }]],
  [/FROM audit_log a/, [{ id: 1, at: new Date().toISOString(), user_name: 'Dueña QA', action: 'Precio manual', entity: 'venta', entity_id: 1, before: '{"price":52000}', after: '{"price":50000}', reason: 'cliente frecuente' }]],
  [/SELECT DISTINCT action FROM audit_log/, [{ action: 'Precio manual' }]],
  [/SELECT id, created_at, label, auto, counts FROM backups/, [{ id: 1, created_at: new Date().toISOString(), label: 'Copia automática diaria', auto: true, counts: '{"products":5,"sales":2,"clients":2}' }]],
  [/pg_database_size/, [{ bytes: 12 * 1024 * 1024 }]],
  [/FROM cash_movements c WHERE|FROM cash_movements c ORDER|FROM cash_movements c\b.*LIMIT 1000/, [{ id: 1, on_date: today, kind: 'in', concept: 'Venta N° 1 – QA Alimento', category: 'Ventas', method: 'Efectivo', amount: 52000, sale_id: 1, stock_delta: 0 }, { id: 2, on_date: today, kind: 'out', concept: 'Luz', category: 'Alquiler y servicios', method: 'Transferencia', amount: 30000, sale_id: null, stock_delta: 0 }]],
  [/SELECT on_date, kind, method, amount FROM cash_movements/, [{ on_date: today, kind: 'in', method: 'Efectivo', amount: 52000 }]],
  [/SELECT 1 FROM cash_closings/, []],
  [/FROM cash_closings k/, []],
  [/SELECT at, week, recipients, ok, error FROM report_log/, []],
]);
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).filter((x) => x[0]));
auth.currentUser = async (req) => (cookies(req).demo_rol === 'empleado' ? USERS.staff : USERS.admin);
// ?rol=empleado / ?rol=dueno en la dirección cambia de usuario (cookie solo para la demo).
const http = require('http');
const origCreate = http.createServer;
http.createServer = (handler) =>
  origCreate((req, res) => {
    const m = /[?&]rol=(empleado|dueno)/.exec(req.url || '');
    if (m) {
      res.writeHead(302, { 'Set-Cookie': 'demo_rol=' + m[1] + '; Path=/', Location: '/' });
      return res.end();
    }
    return handler(req, res);
  });
require('../server/index.js');
