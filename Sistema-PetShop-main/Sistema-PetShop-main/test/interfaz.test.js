'use strict';

/**
 * Chequeos estáticos de la interfaz (public/app.js) contra el servidor, para que no queden botones sin acción,
 * llamadas a rutas inexistentes ni listas distintas entre la pantalla y el servidor.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { api } = require('./_fake');
const U = require('../server/util');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('cada botón (data-action) tiene su acción', () => {
  const start = app.indexOf('var actions={');
  const body = app.slice(start, app.indexOf('\n};', start));
  const handlers = new Set([...body.matchAll(/^\s*'?([\w-]+)'?:\s*(?:async\s+)?function/gm)].map((m) => m[1]));
  // Acciones fijas en el HTML y las que arma segHTML('accion', ...).
  const used = new Set([...app.matchAll(/data-action="([\w-]+)"/g)].map((m) => m[1]).concat([...app.matchAll(/segHTML\('([\w-]+)'/g)].map((m) => m[1])));
  const missing = [...used].filter((a) => !handlers.has(a));
  assert.deepEqual(missing, []);
});

test('cada llamada de la pantalla a /api tiene una ruta en el servidor', () => {
  // Arma la ruta a partir de la expresión: '/sales/'+id+'/void' → /api/sales/1/void (sin el ?query).
  const calls = new Set();
  for (const m of app.matchAll(/(?:api|apiConfirm|downloadFile)\(((?:'[^']*'|[^,)'])+)/g)) {
    let path = '';
    for (const p of m[1].split('+')) {
      if (/^\s*'/.test(p)) path += p.trim().slice(1, -1);
      else if (path.endsWith('/')) path += '1'; // un id después de una barra; lo demás es el ?query opcional
    }
    path = path.split('?')[0];
    if (path.startsWith('/')) calls.add('/api' + path);
  }
  assert.ok(calls.size > 40, 'se encontraron ' + calls.size + ' llamadas');
  const bad = [...calls].filter((c) => !api.routes.some((r) => r.re.test(c)));
  assert.deepEqual(bad, []);
});

test('la pantalla Reportes ya no existe: todo vive en Resumen', () => {
  assert.ok(!/\['reportes'/.test(app), 'el menú no debe tener Reportes');
  assert.ok(!api.routes.some((r) => /reports/.test(r.re.source)), 'no deben quedar rutas /api/reports');
});

test('las listas de la pantalla coinciden con las del servidor', () => {
  const pick = (name) => {
    const m = app.match(new RegExp('var ' + name + '=(\\[[^;]*\\]);'));
    return m ? JSON.stringify(eval(m[1])) : null;
  };
  assert.equal(pick('PROD_CATS'), JSON.stringify(U.PROD_CATS));
  assert.equal(pick('SERV_CATS'), JSON.stringify(U.SERV_CATS));
  assert.equal(pick('CASH_IN_CATS'), JSON.stringify(U.CASH_IN_CATS));
  assert.equal(pick('CASH_OUT_CATS'), JSON.stringify(U.CASH_OUT_CATS));
  assert.equal(pick('ADJUST_REASONS'), JSON.stringify(U.ADJUST_REASONS));
  assert.equal(pick('ALL_PAY'), JSON.stringify(U.METHODS));
  assert.equal(pick('PET_SPECIES'), JSON.stringify(U.PET_SPECIES));
});

test('la pantalla no guarda datos sensibles en el navegador (solo preferencias)', () => {
  const keys = [...app.matchAll(/store\.set\('([\w_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), ['petshop_beep', 'petshop_cart_draft', 'petshop_last_export', 'petshop_period']);
  assert.ok(!/localStorage\.setItem\(/.test(app.replace(/var store=[^\n]*/, '')), 'todo acceso a localStorage pasa por store');
});

test('el service worker nunca guarda respuestas de /api', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  assert.match(sw, /\/api\//);
  assert.match(sw, /startsWith\('\/api\/'\)\)\s*return/);
});

test('Copias de seguridad: la pantalla no menciona el plan gratuito', () => {
  assert.doesNotMatch(app, /plan gratuito|base de datos gratuita/i);
  assert.match(app, /El sistema no guarda copias fuera de esta base de datos\. Por eso guarda una copia por día dentro de la misma base/);
});

test('cargando: botones, ventanas, filtros y búsquedas usan el mismo patrón; las descargas avisan', () => {
  assert.match(app, /busyWhile\(b,Promise\.resolve\(\)\.then\(function\(\)\{return fn\(b\.dataset\.id,b\);\}\)\)/, 'botones de la pantalla');
  assert.match(app, /busyWhile\(bt,Promise\.resolve\(\)\.then\(b\.fn\)\)/, 'botones de las ventanas (por ejemplo «Ver» de una venta)');
  assert.match(app, /refreshing=busyWhile\(main,/, 'filtros y búsquedas de Ventas y Caja');
  const dl = app.slice(app.indexOf('async function downloadFile'), app.indexOf('\n}', app.indexOf('async function downloadFile')));
  assert.match(dl, /toast\('Descarga iniciada: '\+name\)/, 'Exportar CSV y las copias avisan que la descarga empezó');
});

test('Clientes: «Nuevo cliente» queda fijo arriba junto al buscador', () => {
  assert.match(app, /<div class="pac-top"><div class="head"><h1>Clientes<\/h1><button class="btn primary" data-action="new-client">/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  assert.match(css, /\.pac-top\{position:sticky;top:0;z-index:6;[^}]*background:var\(--panel\)/);
});

test('desactivar un usuario explica que no se borra', () => {
  assert.match(app, /no podrá iniciar sesión, pero sigue apareciendo en el registro de actividad e historial\. No se elimina de forma permanente/);
  assert.match(app, /if\(u\.active&&!d\.active&&!await confirmDeactivate\(u\)\)/);
});
