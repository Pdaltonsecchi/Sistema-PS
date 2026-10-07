// Corre todos los tests (test/*.test.js) en un solo proceso con node:test.
// Uso: npm test   (equivale a: node test/run.js)
const fs = require('fs');
const path = require('path');
for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js')).sort()) require(path.join(__dirname, f));
