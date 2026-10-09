'use strict';

/** Reglas puras de la pantalla (public/ui-rules.js): gráficos, Enter en Vender y cargas que llegan desordenadas. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/ui-rules');

test('gráfico mes a mes: las etiquetas del eje X nunca se pisan', () => {
  const W = 604; // ancho útil del gráfico de barras
  for (const n of [1, 6, 10, 12, 24, 31, 62, 90, 400]) {
    for (const minPx of [40, 46]) {
      const step = R.labelStep(n, W, minPx);
      // Entre dos etiquetas escritas hay al menos minPx.
      assert.ok((W / n) * step >= minPx, n + ' columnas, paso ' + step);
      assert.ok(R.labelCount(n, step) <= Math.floor(W / minPx) + 1, n + ' columnas: demasiadas etiquetas');
    }
  }
  assert.equal(R.labelStep(12, W, 46), 1); // 12 meses: un mes por columna
  assert.equal(R.labelStep(24, W, 46), 2); // 24 meses: uno sí y uno no
});

test('Vender: Enter con el nombre exacto de un producto agrega el primer resultado (no ofrece un código nuevo)', () => {
  assert.equal(R.posEnterAction('Jaula', { barcodeMatch: false, results: 1 }), 'first');
  assert.equal(R.posEnterAction('Jau', { barcodeMatch: false, results: 3 }), 'first');
  assert.equal(R.posEnterAction('7790000000014', { barcodeMatch: true, results: 1 }), 'barcode');
  // Solo con la lista vacía se trata como un código nuevo, y solo si parece un código.
  assert.equal(R.posEnterAction('7791234567890', { barcodeMatch: false, results: 0 }), 'unknown');
  assert.equal(R.posEnterAction('Jaula', { barcodeMatch: false, results: 0 }), 'none');
  assert.equal(R.posEnterAction('  ', { results: 2 }), 'none');
});

test('Resumen: al cambiar el filtro, una respuesta vieja que llega tarde se descarta', async () => {
  const seq = R.latest();
  const shown = [];
  const load = (label, ms) => {
    const t = seq.next();
    return new Promise((ok) => setTimeout(ok, ms)).then(() => {
      if (seq.isCurrent(t)) shown.push(label);
    });
  };
  // "Rango" (lento) y enseguida "Este mes" (rápido): solo se muestra el último pedido.
  await Promise.all([load('rango ene-oct', 40), load('este mes', 5)]);
  assert.deepEqual(shown, ['este mes']);
});

function fakeEl() {
  const cls = new Set(), attrs = {};
  return { cls, attrs, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) }, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('cargando: lo rápido no parpadea, lo lento muestra el aviso y siempre se quita', async () => {
  const fast = fakeEl();
  assert.equal(await R.busyWhile(fast, wait(5).then(() => 'ok'), 40), 'ok');
  await wait(60);
  assert.equal(fast.cls.has('busy'), false, 'una respuesta rápida nunca muestra el círculo');

  const slow = fakeEl();
  const p = R.busyWhile(slow, wait(80), 20);
  await wait(40);
  assert.equal(slow.cls.has('busy'), true);
  assert.equal(slow.attrs['aria-busy'], 'true');
  await p;
  assert.equal(slow.cls.has('busy'), false);
  assert.equal(slow.attrs['aria-busy'], undefined);

  const bad = fakeEl();
  await assert.rejects(R.busyWhile(bad, wait(40).then(() => { throw new Error('falló'); }), 10), /falló/);
  assert.equal(bad.cls.has('busy'), false, 'si falla también se quita');
});
