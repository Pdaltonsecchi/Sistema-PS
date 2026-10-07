'use strict';

/**
 * Envío de emails por API (sin dependencias: usa fetch de Node 18+). Proveedores soportados:
 *   EMAIL_PROVIDER=resend  → https://resend.com   (EMAIL_API_KEY = la API key)
 *   EMAIL_PROVIDER=brevo   → https://www.brevo.com (EMAIL_API_KEY = la API key v3)
 *   EMAIL_FROM = "Mi Pet Shop <avisos@midominio.com>" (un remitente verificado en el proveedor)
 * Si falta alguna variable, el informe queda desactivado y el sistema arranca igual.
 */
const PROVIDER = String(process.env.EMAIL_PROVIDER || '').toLowerCase();
const KEY = process.env.EMAIL_API_KEY || '';
const FROM = process.env.EMAIL_FROM || '';

const configured = () => !!(KEY && FROM && (PROVIDER === 'resend' || PROVIDER === 'brevo'));

function parseFrom(f) {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(f);
  return m ? { name: m[1] || m[2], email: m[2] } : { name: f.trim(), email: f.trim() };
}

async function send(to, subject, html) {
  if (!configured()) throw new Error('el envío de emails no está configurado');
  let res;
  try {
    if (PROVIDER === 'resend') {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to, subject, html }),
      });
    } else {
      const f = parseFrom(FROM);
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { name: f.name, email: f.email }, to: to.map((email) => ({ email })), subject, htmlContent: html }),
      });
    }
  } catch (e) {
    throw new Error('no hubo conexión con el servicio de email (' + e.message + ')');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.message || j.error || JSON.stringify(j);
    } catch (e) {
      /* sin detalle */
    }
    throw new Error('el servicio de email respondió ' + res.status + (detail ? ': ' + String(detail).slice(0, 200) : ''));
  }
}

module.exports = { configured, send, provider: () => PROVIDER };
