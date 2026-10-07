'use strict';

/**
 * Reglas de negocio puras (sin base de datos), para poder probarlas con tests automáticos.
 * La API (server/api.js) las usa tal cual: si un test pasa acá, la regla vale en el sistema.
 */
const U = require('./util');
const { HttpError } = U;

/* ============================================================
   Ventas: precio, descuento, pagos
   ============================================================ */
const sameMoney = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

/**
 * Calcula una venta. El precio SIEMPRE sale de la base (src.price). Solo el administrador puede aplicar otro
 * precio, y tiene que escribir el motivo. Un empleado que manda otro precio recibe 403.
 * items: [{ type, id, qty, price?, reason?, src: { name, category, unit, price, cost, expires } }]
 * discount: { type: 'amount'|'percent', value } | null
 * opts: { admin, today, confirmExpired }
 */
function priceSale(items, discount, opts) {
  const lines = items.map((it) => {
    const src = it.src;
    let price = Number(src.price);
    let reason = '';
    const wants = it.price != null && it.price !== '' ? U.money(it.price, 'Precio de ' + src.name) : null;
    if (wants != null && !sameMoney(wants, src.price)) {
      if (!opts.admin) throw new HttpError(403, 'Solo el administrador puede cambiar precios.', { code: 'price_forbidden' });
      reason = typeof it.reason === 'string' ? it.reason.trim() : '';
      if (reason.length < 3) throw U.bad('Para cambiar el precio de «' + src.name + '» escribí el motivo (por ejemplo: “cliente frecuente”).');
      if (reason.length > 200) throw U.bad('El motivo del cambio de precio es demasiado largo.');
      price = wants;
    }
    if (it.type === 'product' && src.expires && src.expires < opts.today) {
      if (!opts.admin) throw new HttpError(409, '«' + src.name + '» está vencido y no se puede vender. Avisale al dueño.', { code: 'expired_forbidden' });
      if (!opts.confirmExpired) throw new HttpError(409, '«' + src.name + '» está vencido. ¿Lo vendés igual?', { code: 'expired' });
    }
    const sub = U.round2(price * it.qty);
    return {
      type: it.type, id: it.id, name: src.name, category: src.category || '', unit: src.unit || 'u', qty: it.qty,
      price, listPrice: Number(src.price), reason, cost: it.type === 'product' ? Number(src.cost) || 0 : 0, sub,
    };
  });
  const subtotal = U.round2(lines.reduce((n, l) => n + l.sub, 0));
  let disc = 0;
  if (discount && discount.value !== '' && discount.value != null) {
    const type = U.oneOf(discount.type, ['amount', 'percent'], 'Tipo de descuento');
    const v = U.reqNum(discount.value, 'Descuento', 0, 1e9);
    if (type === 'percent' && v > 100) throw U.bad('El descuento no puede ser mayor al 100 %.');
    disc = type === 'percent' ? U.round2((subtotal * v) / 100) : U.round2(v);
  }
  if (disc > subtotal) throw U.bad('El descuento no puede ser mayor que el subtotal.');
  // El descuento se reparte entre las líneas según su importe (la última absorbe el redondeo).
  let left = disc;
  lines.forEach((l, i) => {
    const part = i === lines.length - 1 ? left : subtotal > 0 ? U.round2((disc * l.sub) / subtotal) : 0;
    l.amount = U.round2(l.sub - part);
    left = U.round2(left - part);
  });
  const total = U.round2(subtotal - disc);
  const costTotal = U.round2(lines.reduce((n, l) => n + l.cost * l.qty, 0));
  return { lines, subtotal, discount: disc, total, costTotal, profit: U.round2(total - costTotal) };
}

/**
 * Formas de pago de una venta: una sola (method) o mixta (payments: [{method, amount}]).
 * Los montos tienen que sumar exactamente el total. Devuelve [{method, amount}] sin montos en cero.
 */
function splitPayments(total, method, payments, allowed) {
  const list = allowed && allowed.length ? allowed : U.METHODS;
  if (!Array.isArray(payments) || !payments.length) {
    return [{ method: U.oneOf(method, list, 'Forma de pago'), amount: U.round2(total) }];
  }
  if (payments.length > list.length) throw U.bad('Hay formas de pago repetidas.');
  const seen = {};
  const out = payments
    .map((p) => {
      const m = U.oneOf(p && p.method, list, 'Forma de pago');
      if (seen[m]) throw U.bad('La forma de pago «' + m + '» está repetida.');
      seen[m] = true;
      return { method: m, amount: U.money(p.amount, 'Monto en ' + m) };
    })
    .filter((p) => p.amount > 0);
  const sum = U.round2(out.reduce((n, p) => n + p.amount, 0));
  if (!sameMoney(sum, total)) {
    throw U.bad('Los pagos suman ' + fmtMoney(sum) + ' y el total es ' + fmtMoney(total) + '. Revisá los montos.');
  }
  if (!out.length) return [{ method: list[0], amount: 0 }];
  return out;
}
const fmtMoney = (n) => '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/* ============================================================
   Agenda: superposiciones, horario comercial
   ============================================================ */
const toMin = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));
/** Dos intervalos [inicio, inicio + duración) se pisan si cada uno empieza antes de que termine el otro. */
function overlaps(aTime, aDur, bTime, bDur) {
  const a0 = toMin(aTime);
  const b0 = toMin(bTime);
  return a0 < b0 + Number(bDur) && b0 < a0 + Number(aDur);
}
const INACTIVE = ['cancelado', 'no_vino'];
const normStaff = (s) => String(s || '').trim().toLowerCase();
/**
 * Turnos del mismo día que chocan con `a`: misma mascota, o el mismo personal asignado (si está cargado).
 * Dos turnos se pueden pisar solo si los atiende personal distinto. Los cancelados y los "no vino" no ocupan lugar.
 */
function findConflicts(a, others) {
  if (INACTIVE.includes(a.status)) return [];
  return others.filter(
    (o) =>
      o.id !== a.id &&
      o.date === a.date &&
      !INACTIVE.includes(o.status) &&
      (o.petId === a.petId || (normStaff(a.staff) && normStaff(o.staff) === normStaff(a.staff))) &&
      overlaps(a.time, a.duration, o.time, o.duration)
  );
}

// Horario comercial por día de la semana (0 = domingo). null = cerrado.
const DEFAULT_HOURS = { 0: null, 1: ['09:00', '19:00'], 2: ['09:00', '19:00'], 3: ['09:00', '19:00'], 4: ['09:00', '19:00'], 5: ['09:00', '19:00'], 6: ['09:00', '19:00'] };
const weekday = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
/** ¿El turno entra completo dentro del horario de ese día? */
function withinHours(hours, date, time, duration) {
  const h = (hours || DEFAULT_HOURS)[weekday(date)];
  if (!h) return false;
  const s = toMin(time);
  return s >= toMin(h[0]) && s + Number(duration) <= toMin(h[1]);
}
/** Valida y normaliza el horario comercial que se guarda en la configuración. */
function checkHours(h) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const v = h && h[d];
    if (!v) {
      out[d] = null;
      continue;
    }
    if (!Array.isArray(v) || v.length !== 2) throw U.bad('El horario comercial no es válido.');
    const a = U.reqTime(v[0], 'Apertura').slice(0, 5);
    const b = U.reqTime(v[1], 'Cierre').slice(0, 5);
    if (toMin(b) <= toMin(a)) throw U.bad('En el horario comercial, el cierre tiene que ser después de la apertura.');
    out[d] = [a, b];
  }
  return out;
}

/* ============================================================
   Números para el Resumen
   ============================================================ */
/** Variación % de `cur` contra `ref`. null si no hay referencia (evita dividir por cero). */
function pctChange(cur, ref) {
  if (ref == null || Number(ref) === 0) return null;
  return Math.round(((Number(cur) - Number(ref)) / Math.abs(Number(ref))) * 1000) / 10;
}
/** Margen bruto % (ganancia / ventas). null si no hubo ventas. */
const marginPct = (sales, profit) => (Number(sales) > 0 ? Math.round((Number(profit) / Number(sales)) * 1000) / 10 : null);
/**
 * Punto de equilibrio: cuánto hay que vender para cubrir los gastos fijos con el margen bruto promedio.
 * null si el margen es 0 o negativo (con ese margen no hay venta que alcance).
 */
function breakEven(fixedCosts, margin) {
  if (margin == null || margin <= 0) return null;
  return U.round2(Number(fixedCosts) / (margin / 100));
}
/**
 * Proyección del mes: ritmo del mes en curso vs. promedio de los últimos 3 meses.
 * m: { sales, expenses, day, daysInMonth, avgSales, avgExpenses }
 */
function projectMonth(m) {
  const day = Math.max(1, m.day);
  const paceS = (m.sales / day) * m.daysInMonth;
  const paceE = (m.expenses / day) * m.daysInMonth;
  const hasAvg = m.avgSales > 0 || m.avgExpenses > 0;
  const mix = (a, b) => (hasAvg ? (a + b) / 2 : a);
  const sales = {
    expected: U.round2(mix(paceS, m.avgSales)),
    optimistic: U.round2(hasAvg ? Math.max(paceS, m.avgSales) : paceS),
    prudent: U.round2(hasAvg ? Math.min(paceS, m.avgSales) : paceS),
  };
  // Lo ya vendido y gastado no puede "desaparecer": las proyecciones nunca son menores a lo real.
  Object.keys(sales).forEach((k) => (sales[k] = Math.max(sales[k], U.round2(m.sales))));
  const expenses = {
    expected: Math.max(U.round2(mix(paceE, m.avgExpenses)), U.round2(m.expenses)),
    optimistic: Math.max(U.round2(hasAvg ? Math.min(paceE, m.avgExpenses) : paceE), U.round2(m.expenses)),
    prudent: Math.max(U.round2(hasAvg ? Math.max(paceE, m.avgExpenses) : paceE), U.round2(m.expenses)),
  };
  return { sales, expenses };
}
/** Día del mes en que se alcanza `target` al ritmo actual (null si no se alcanza este mes). */
function reachDay(sold, target, day, daysInMonth) {
  if (target == null) return null;
  if (sold >= target) return day;
  const perDay = sold / Math.max(1, day);
  if (perDay <= 0) return null;
  const d = Math.ceil(target / perDay);
  return d <= daysInMonth ? d : null;
}

/**
 * Clientes perdidos: compraron al menos 2 veces y hace más de max(N días, 2 × su frecuencia habitual)
 * que no vuelven. rows: [{ id, purchases, first, last }] (fechas AAAA-MM-DD).
 */
function lostClients(rows, today, minDays) {
  const day = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
  return rows
    .filter((r) => r.purchases >= 2)
    .map((r) => {
      const gap = r.purchases > 1 ? day(r.first, r.last) / (r.purchases - 1) : null;
      const since = day(r.last, today);
      const limit = Math.max(minDays, gap ? Math.round(gap * 2) : 0);
      return Object.assign({}, r, { usualGap: gap == null ? null : Math.round(gap), daysSince: since, lost: since > limit });
    })
    .filter((r) => r.lost)
    .sort((a, b) => b.daysSince - a.daysSince);
}

const DOW = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
/** Frase con la franja de 2 horas que más vende. cells: [{ dow, hour, n, total }]. */
function peakPhrase(cells) {
  const all = cells.reduce((s, c) => s + Number(c.total), 0);
  if (!all) return '';
  const by = {};
  cells.forEach((c) => (by[c.dow + '-' + c.hour] = Number(c.total)));
  let best = null;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = (by[d + '-' + h] || 0) + (by[d + '-' + (h + 1)] || 0);
      if (!best || v > best.v) best = { d, h, v };
    }
  }
  const share = Math.round((best.v / all) * 100);
  return 'Los ' + DOW[best.d] + ' de ' + best.h + ' a ' + (best.h + 2) + ' hs concentran el ' + share + ' % de tus ventas.';
}

/* ============================================================
   CSV seguro para Excel
   ============================================================ */
/** Celda de CSV: evita que Excel ejecute fórmulas (=, +, -, @) y escapa comillas, ; y saltos de línea. */
function csvCell(v) {
  let t = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
const csvDoc = (header, rows) => '﻿' + [header.map(csvCell).join(';')].concat(rows.map((r) => r.map(csvCell).join(';'))).join('\r\n') + '\r\n';

/* ============================================================
   Códigos de barras
   ============================================================ */
/**
 * Normaliza un código: sin espacios; un UPC-A (12 dígitos) se guarda como su EAN-13 (con 0 adelante) y un
 * GTIN-14 que empieza con 0 como EAN-13, así el mismo producto se reconoce con cualquier lector.
 */
function normalizeBarcode(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw U.bad('El código de barras no es válido.');
  const t = raw.replace(/\s+/g, '');
  if (!t) return null;
  if (!/^[0-9A-Za-z._-]{4,64}$/.test(t)) throw U.bad('El código de barras solo puede tener letras, números, punto y guion (entre 4 y 64 caracteres).');
  if (/^\d{12}$/.test(t)) return '0' + t;
  if (/^0\d{13}$/.test(t)) return t.slice(1);
  return t;
}
/** Dígito verificador de EAN-8, UPC-A, EAN-13 y GTIN-14. Otros formatos (Code 128, QR...) no se verifican. */
function gtinValid(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return true;
  const d = code.split('').map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/* ============================================================
   Productos: precio y margen
   ============================================================ */
/**
 * Reglas de precio de un producto: precio 0 solo si es regalo/promoción; costo mayor al precio pide confirmación.
 * Devuelve null si está todo bien o lanza el error correspondiente.
 */
function checkProductPrice(price, cost, isGift, confirmLoss) {
  if (Number(price) === 0 && !isGift) throw U.bad('El precio de venta no puede ser $ 0. Si es un regalo o promoción, tildá “Es un regalo/promoción”.');
  if (!isGift && Number(cost) > Number(price) && !confirmLoss) {
    throw new HttpError(409, 'Con este precio perdés ' + fmtMoney(U.round2(cost - price)) + ' por unidad. ¿Lo guardás igual?', { code: 'loss' });
  }
  return null;
}

module.exports = {
  priceSale, splitPayments, overlaps, findConflicts, withinHours, checkHours, DEFAULT_HOURS, weekday,
  pctChange, marginPct, breakEven, projectMonth, reachDay, lostClients, peakPhrase,
  csvCell, csvDoc, normalizeBarcode, gtinValid, checkProductPrice, fmtMoney,
};
