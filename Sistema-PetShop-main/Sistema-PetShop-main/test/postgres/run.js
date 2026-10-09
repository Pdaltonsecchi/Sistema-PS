'use strict';

/**
 * Pruebas contra un PostgreSQL REAL (las de `npm test` usan una base simulada y no ejecutan el SQL).
 * Uso: TEST_DATABASE_URL=postgres://usuario@localhost:5432/base_de_prueba npm run test:pg
 * ¡Borra todos los datos de esa base! Usá una base vacía, nunca la del negocio.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log('test:pg: definí TEST_DATABASE_URL (una base vacía de prueba) para correr estas pruebas.');
  process.exit(0);
}
process.env.DATABASE_URL = url;
if (process.env.DATABASE_SSL === undefined && /localhost|127\.0\.0\.1/.test(url)) process.env.DATABASE_SSL = 'false';

const fs = require('fs');
const path = require('path');
for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js')).sort()) require(path.join(__dirname, f));
