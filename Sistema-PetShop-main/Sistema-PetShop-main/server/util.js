'use strict';

/**
 * Error con código HTTP y mensaje para el usuario (en español claro). `extra` viaja en la respuesta JSON:
 * { code } le dice a la interfaz qué hacer (por ejemplo, pedir confirmación) y { details } da datos extra.
 */
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}
const bad = (message, extra) => new HttpError(400, message, extra);
const HANDLED = Symbol('handled');

const METHODS = ['Efectivo', 'Transferencia', 'Tarjeta de débito', 'Tarjeta de crédito'];
// Categorías del catálogo del pet shop.
const PROD_CATS = [
  'Alimento balanceado', 'Snacks y premios', 'Accesorios', 'Juguetes', 'Higiene y cuidado',
  'Salud (venta libre)', 'Camas y transporte', 'Acuario', 'Aves y roedores', 'Otros',
];
// Para qué animal es un producto (opcional, sirve para filtrar).
const SPECIES_OPTS = ['Perro', 'Gato', 'Perro y gato', 'Otras mascotas'];
// Unidad de venta: por unidad o suelto por kilo.
const UNITS = ['u', 'kg'];
const SERV_CATS = ['Baño', 'Peluquería', 'Otros'];
const PET_SPECIES = ['Perro', 'Gato', 'Otro'];
const PET_SIZES = ['Chico', 'Mediano', 'Grande'];
// Ingresos y egresos tienen categorías separadas. Las ventas entran solas como "Ventas".
const CASH_IN_CATS = ['Ventas', 'Aporte de capital', 'Otros ingresos'];
const CASH_OUT_CATS = ['Compra de mercadería', 'Alquiler y servicios', 'Sueldos', 'Impuestos', 'Insumos de peluquería', 'Retiro de caja', 'Otros'];
// Motivos permitidos al ajustar stock a mano.
const ADJUST_REASONS = ['Rotura', 'Vencimiento', 'Error de carga', 'Uso interno (peluquería)', 'Faltante', 'Otro'];
// Estados de un turno.
const APPT_STATUS = ['reservado', 'confirmado', 'en_curso', 'listo', 'entregado', 'no_vino', 'cancelado'];

const TZ = 'America/Argentina/Buenos_Aires';

/** Fecha de hoy en Argentina, como AAAA-MM-DD. */
function todayAR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Primer día del mes de `iso`, retrocediendo `back` meses. */
function monthStart(iso, back) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 - (back || 0);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}
/** Último día del mes de `iso`. */
function monthEnd(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** Días entre dos fechas AAAA-MM-DD (b − a). */
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;

/* ---------- validaciones (mensajes en lenguaje natural, sin tecnicismos) ---------- */
function reqStr(v, label, max) {
  if (typeof v !== 'string' || !v.trim()) throw bad('Completá «' + label + '».');
  const s = v.trim();
  if (s.length > (max || 200)) throw bad('«' + label + '» es demasiado largo (máximo ' + (max || 200) + ' caracteres).');
  return s;
}
function optStr(v, max, label) {
  if (v == null) return '';
  if (typeof v !== 'string') throw bad('Hay un dato que no se pudo leer. Revisá el formulario.');
  const s = v.trim();
  if (s.length > (max || 500)) throw bad((label ? '«' + label + '»' : 'Un texto') + ' es demasiado largo (máximo ' + (max || 500) + ' caracteres).');
  return s;
}
/**
 * Teléfono opcional. Solo dígitos, espacios, +, - y (); si se completa, con al menos 6 dígitos.
 * Devuelve { phone, norm } (norm = solo dígitos).
 */
function optPhone(v) {
  const s = optStr(v, 50, 'Teléfono');
  if (!s) return { phone: '', norm: '' };
  if (!/^[0-9 +()-]+$/.test(s)) throw bad('El teléfono solo puede tener números, espacios, + , - y paréntesis.');
  const norm = s.replace(/\D/g, '');
  if (norm.length < 6) throw bad('El teléfono tiene que tener al menos 6 números.');
  return { phone: s, norm };
}
function reqDate(v, label) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('Elegí una fecha válida en «' + label + '».');
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw bad('Elegí una fecha válida en «' + label + '».');
  return v;
}
function optDate(v, label) {
  return v == null || v === '' ? null : reqDate(v, label);
}
/** Fecha que no puede ser posterior a hoy (nacimiento, compra, venta...). */
function pastDate(v, label) {
  reqDate(v, label);
  if (v > todayAR()) throw bad('«' + label + '» no puede ser posterior a hoy.');
  return v;
}
function optPastDate(v, label) {
  return v == null || v === '' ? null : pastDate(v, label);
}
/** Hora: acepta "HH:MM" o "HH:MM:SS" y siempre devuelve "HH:MM:SS". */
function reqTime(v, label) {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)) throw bad('Elegí una hora válida en «' + label + '».');
  return v.length === 5 ? v + ':00' : v;
}
function reqNum(v, label, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !isFinite(n)) throw bad('Escribí un número en «' + label + '».');
  if (min != null && n < min) throw bad('«' + label + '» no puede ser menor a ' + String(min).replace('.', ',') + '.');
  if (max != null && n > max) throw bad('«' + label + '» es demasiado grande.');
  return n;
}
function reqInt(v, label, min, max) {
  const n = reqNum(v, label, min, max);
  if (!Number.isInteger(n)) throw bad('En «' + label + '» va un número entero (sin decimales).');
  return n;
}
function money(v, label) {
  return round2(reqNum(v, label, 0, 1e9));
}
/** Valor opcional de una lista: '' o null = sin dato. */
function optOneOf(v, list, label) {
  if (v == null || v === '') return null;
  return oneOf(v, list, label);
}
/**
 * Cantidad de un producto según su unidad: por unidad, un entero; por kilo, hasta 3 decimales (gramos).
 * `allowZero` para stock mínimo/inicial; `allowNeg` para ajustes.
 */
function qty(v, label, unit, o) {
  o = o || {};
  const n = reqNum(v, label, o.allowNeg ? -1e6 : 0, 1e6);
  if (unit === 'kg') {
    if (Math.abs(round3(n) - n) > 1e-9) throw bad('En «' + label + '» van como máximo 3 decimales (gramos).');
  } else if (!Number.isInteger(n)) {
    throw bad('En «' + label + '» va un número entero (sin decimales).');
  }
  if (!o.allowZero && !o.allowNeg && n <= 0) throw bad('«' + label + '» tiene que ser mayor a cero.');
  if (o.allowNeg && n === 0) throw bad('«' + label + '» no puede ser cero.');
  return unit === 'kg' ? round3(n) : n;
}
/** Monto que tiene que ser mayor a cero (movimientos manuales de caja, compras de stock). */
function moneyPos(v, label) {
  const n = round2(reqNum(v, label, 0, 1e9));
  if (n < 0.01) throw bad('«' + label + '» tiene que ser mayor a cero.');
  return n;
}
function oneOf(v, list, label) {
  if (!list.includes(v)) throw bad('Elegí una opción válida en «' + label + '».');
  return v;
}
function idParam(s) {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) throw bad('No encontramos ese registro. Recargá la página e intentá de nuevo.');
  return n;
}
function checkEmail(s) {
  if (s && (s.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))) throw bad('El email no parece válido: revisá que tenga @ y un dominio (ej.: nombre@gmail.com).');
  return s;
}

/* ---------- http ---------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        tooBig = true;
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, 'Los datos que mandaste son demasiado grandes.'));
      if (!size) return resolve({});
      try {
        const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(b && typeof b === 'object' ? b : {});
      } catch (e) {
        reject(bad('No se pudieron leer los datos enviados. Recargá la página e intentá de nuevo.'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 1) return;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket.remoteAddress || 'desconocida';
}

module.exports = {
  HttpError, bad, HANDLED,
  METHODS, SPECIES_OPTS, PROD_CATS, UNITS, SERV_CATS, PET_SPECIES, PET_SIZES, CASH_IN_CATS, CASH_OUT_CATS, ADJUST_REASONS, APPT_STATUS,
  TZ, todayAR, addDays, monthStart, monthEnd, daysBetween, round2, round3,
  reqStr, optStr, optPhone, reqDate, optDate, pastDate, optPastDate, reqTime, reqNum, reqInt, money, moneyPos, oneOf, optOneOf, qty, idParam, checkEmail,
  sendJson, readBody, parseCookies, clientIp,
};
