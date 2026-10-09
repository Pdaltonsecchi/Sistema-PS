'use strict';

const zlib = require('zlib');

/* ============================================================
   Copias de seguridad (solo el dueño)
   ============================================================ */
module.exports = function (H) {
  const { add, U, backup, audit, db } = H;

  add('GET', '/api/backups', { admin: true }, async () => ({ items: await backup.list(), usage: await backup.usage() }));

  add('POST', '/api/backups', { admin: true }, async (ctx) => {
    await backup.snapshot('Copia manual', false);
    await audit(db, ctx, 'Copia manual creada', 'copia', null, null, null);
  });

  add('DELETE', '/api/backups/:id', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const b = (await db.query('SELECT created_at, label FROM backups WHERE id = $1', [id])).rows[0];
    await backup.remove(id);
    await audit(db, ctx, 'Copia eliminada', 'copia', id, b ? { label: b.label, createdAt: b.created_at } : null, null);
  });

  // Cantidad de registros que hay hoy, para la confirmación reforzada al restaurar.
  add('GET', '/api/backups/current', { admin: true }, async () => ({ counts: await backup.currentCounts() }));

  add('POST', '/api/backups/:id/restore', { admin: true, limit: 1024 }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    await backup.restore(await backup.load(id), { confirmEmpty: ctx.body.confirmEmpty === true });
    await audit(db, ctx, 'Copia restaurada', 'copia', id, null, null);
  });

  // Descarga de la copia: comprimida (.json.gz, mucho más liviana) o JSON plano.
  add('GET', '/api/backup/export', { admin: true }, async (ctx) => {
    const json = JSON.stringify(await backup.exportAll());
    const gz = ctx.query.get('gz') === '1';
    const body = gz ? zlib.gzipSync(Buffer.from(json)) : Buffer.from(json);
    ctx.res.writeHead(200, {
      'Content-Type': gz ? 'application/gzip' : 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="copia-petshop-' + U.todayAR() + (gz ? '.json.gz' : '.json') + '"',
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
    });
    ctx.res.end(body);
    return U.HANDLED;
  });

  add('POST', '/api/restore', { admin: true, limit: 40 * 1024 * 1024 }, async (ctx) => {
    await backup.restore(ctx.body.data, { confirmEmpty: ctx.body.confirmEmpty === true });
    await audit(db, ctx, 'Copia restaurada desde archivo', 'copia', null, null, null);
  });
};
