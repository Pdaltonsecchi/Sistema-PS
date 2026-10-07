'use strict';

/* ============================================================
   Clientes, mascotas y agenda de peluquería
   ============================================================ */
module.exports = function (H) {
  const { add, db, U, L, HttpError, audit, isAdmin, fullName, getSettings, mapClient, mapPet, listClients, mustExist } = H;

  function clientInput(b) {
    const ph = U.optPhone(b.phone);
    return {
      first: U.reqStr(b.firstName, 'Nombre', 100),
      last: U.optStr(b.lastName, 100, 'Apellido'),
      phone: ph.phone,
      norm: ph.norm,
      email: U.checkEmail(U.optStr(b.email, 150, 'Email')),
      address: U.optStr(b.address, 200, 'Dirección'),
      notes: U.optStr(b.notes, 1000, 'Notas'),
    };
  }
  function petInput(b) {
    return {
      name: U.reqStr(b.name, 'Nombre de la mascota', 100),
      species: U.oneOf(b.species || 'Perro', U.PET_SPECIES, 'Especie'),
      breed: U.optStr(b.breed, 100, 'Raza'),
      size: U.optOneOf(b.size, U.PET_SIZES, 'Tamaño'),
      birth: U.optPastDate(b.birth, 'Fecha de nacimiento'),
      notes: U.optStr(b.notes, 1000, 'Notas de peluquería'),
    };
  }
  add('GET', '/api/clients', async () => ({ items: await listClients() }));

  // Ficha del cliente: contacto, mascotas, compras y turnos.
  add('GET', '/api/clients/:id', async (ctx) => {
    const admin = isAdmin(ctx);
    const id = U.idParam(ctx.params.id);
    const r = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese cliente. Recargá la página.');
    const [pets, sales, appts] = await Promise.all([
      db.query('SELECT * FROM pets WHERE client_id = $1 ORDER BY lower(name), id', [id]),
      db.query(
        'SELECT ' + H.SALE_COLS + ", (SELECT string_agg(i.name, ', ' ORDER BY i.id) FROM sale_items i WHERE i.sale_id = s.id) AS summary" +
          H.SALE_FROM + ' WHERE s.client_id = $1 ORDER BY s.on_date DESC, s.number DESC LIMIT 300',
        [id]
      ),
      db.query(
        'SELECT a.id, a.on_date, a.at_time, a.status, a.staff, pt.name AS pet, sv.name AS service FROM appointments a JOIN pets pt ON pt.id = a.pet_id LEFT JOIN services sv ON sv.id = a.service_id ' +
          'WHERE pt.client_id = $1 ORDER BY a.on_date DESC, a.at_time DESC LIMIT 100',
        [id]
      ),
    ]);
    const list = sales.rows.map((x) => H.mapSale(x, admin));
    const ok = list.filter((x) => !x.voided);
    return Object.assign(mapClient(r.rows[0], pets.rows.map(mapPet)), {
      sales: list,
      totalSpent: U.round2(ok.reduce((n, x) => n + x.total, 0)),
      lastPurchase: ok.length ? ok[0].date : '',
      appointments: appts.rows.map((x) => ({ id: x.id, date: x.on_date, time: String(x.at_time).slice(0, 5), status: x.status, staff: x.staff, pet: x.pet, service: x.service || '' })),
    });
  });
  // Alta de cliente; puede venir con su primera mascota.
  add('POST', '/api/clients', async (ctx) => {
    const ci = clientInput(ctx.body);
    const pet = ctx.body.pet && typeof ctx.body.pet === 'object' && ctx.body.pet.name ? petInput(ctx.body.pet) : null;
    return db.tx(async (c) => {
      const r = await c.query('INSERT INTO clients (first_name, last_name, phone, phone_norm, email, address, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [
        ci.first, ci.last, ci.phone, ci.norm, ci.email, ci.address, ci.notes,
      ]);
      const id = r.rows[0].id;
      let petId = null;
      if (pet) {
        petId = (await c.query('INSERT INTO pets (client_id, name, species, breed, size, birth, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [
          id, pet.name, pet.species, pet.breed, pet.size, pet.birth, pet.notes,
        ])).rows[0].id;
      }
      return { id, petId };
    });
  });
  add('PUT', '/api/clients/:id', async (ctx) => {
    const ci = clientInput(ctx.body);
    const r = await db.query('UPDATE clients SET first_name = $1, last_name = $2, phone = $3, phone_norm = $4, email = $5, address = $6, notes = $7 WHERE id = $8 RETURNING id', [
      ci.first, ci.last, ci.phone, ci.norm, ci.email, ci.address, ci.notes, U.idParam(ctx.params.id),
    ]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese cliente. Recargá la página.');
  });
  // Eliminar un cliente borra también sus mascotas y sus turnos. Sus compras quedan (sin cliente asignado).
  add('DELETE', '/api/clients/:id', { admin: true }, async (ctx) => {
    const id = U.idParam(ctx.params.id);
    return db.tx(async (c) => {
      const r = await c.query('DELETE FROM clients WHERE id = $1 RETURNING first_name, last_name', [id]);
      if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese cliente. Recargá la página.');
      await audit(c, ctx, 'Baja de cliente', 'cliente', id, { name: fullName(r.rows[0].first_name, r.rows[0].last_name) }, null);
    });
  });

  add('POST', '/api/clients/:id/pets', async (ctx) => {
    const clientId = U.idParam(ctx.params.id);
    const p = petInput(ctx.body);
    await mustExist(db, 'clients', clientId, 'No encontramos ese cliente. Recargá la página.');
    const r = await db.query('INSERT INTO pets (client_id, name, species, breed, size, birth, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [
      clientId, p.name, p.species, p.breed, p.size, p.birth, p.notes,
    ]);
    return { id: r.rows[0].id };
  });
  add('PUT', '/api/pets/:id', async (ctx) => {
    const p = petInput(ctx.body);
    const clientId = U.idParam(ctx.body.clientId);
    await mustExist(db, 'clients', clientId, 'No encontramos ese cliente. Recargá la página.');
    const r = await db.query('UPDATE pets SET client_id = $1, name = $2, species = $3, breed = $4, size = $5, birth = $6, notes = $7 WHERE id = $8 RETURNING id', [
      clientId, p.name, p.species, p.breed, p.size, p.birth, p.notes, U.idParam(ctx.params.id),
    ]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos esa mascota. Recargá la página.');
  });
  add('DELETE', '/api/pets/:id', { admin: true }, async (ctx) => {
    const r = await db.query('DELETE FROM pets WHERE id = $1 RETURNING id', [U.idParam(ctx.params.id)]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos esa mascota. Recargá la página.');
  });

  /* ---------- Agenda de peluquería y baño (la usan el dueño y los empleados) ---------- */
  const APPT_COLS =
    'a.id, a.pet_id, a.service_id, a.on_date, a.at_time, a.duration_min, a.status, a.notes, a.sale_id, a.staff, a.started_at, a.finished_at, ' +
    'pt.name AS pet_name, pt.species, pt.breed, pt.size, pt.notes AS pet_notes, pt.client_id, cl.first_name, cl.last_name, cl.phone, sv.name AS service_name, sv.price AS service_price';
  const APPT_FROM = ' FROM appointments a JOIN pets pt ON pt.id = a.pet_id JOIN clients cl ON cl.id = pt.client_id LEFT JOIN services sv ON sv.id = a.service_id';
  function addMinutes(hhmm, min) {
    const t = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + min) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  const mapAppt = (r) => {
    const time = String(r.at_time).slice(0, 5);
    return {
      id: r.id, petId: r.pet_id, serviceId: r.service_id || null, date: r.on_date, time, duration: r.duration_min, endTime: addMinutes(time, r.duration_min),
      status: r.status, notes: r.notes, staff: r.staff || '', saleId: r.sale_id || null, pet: r.pet_name, species: r.species, breed: r.breed, size: r.size || '',
      petNotes: r.pet_notes, clientId: r.client_id, client: fullName(r.first_name, r.last_name), clientLast: r.last_name || r.first_name, phone: r.phone,
      service: r.service_name || '', servicePrice: r.service_price == null ? null : Number(r.service_price),
    };
  };
  function apptInput(b) {
    return {
      petId: U.idParam(b.petId),
      serviceId: b.serviceId ? U.idParam(b.serviceId) : null,
      date: U.reqDate(b.date, 'Fecha'),
      time: U.reqTime(b.time, 'Hora').slice(0, 5),
      duration: U.reqInt(b.duration == null || b.duration === '' ? 60 : b.duration, 'Duración', 5, 600),
      status: U.oneOf(b.status || 'reservado', U.APPT_STATUS, 'Estado'),
      staff: U.optStr(b.staff, 60, 'Atiende'),
      notes: U.optStr(b.notes, 1000, 'Notas'),
    };
  }
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  /**
   * Controles de un turno, en orden: fecha pasada, superposición (misma mascota o mismo peluquero) y horario
   * comercial. Cada aviso se puede confirmar (salvo reservar en el pasado y, para el empleado, la superposición).
   */
  async function checkAppt(c, a, selfId, b, admin) {
    const today = U.todayAR();
    if (a.date < today) {
      if (!selfId && a.status === 'reservado') {
        throw U.bad('No se puede reservar un turno en una fecha pasada. Para cargar un turno que ya pasó, elegí el estado «Entregado».', { code: 'past_reserved' });
      }
      if (b.confirmPast !== true) throw new HttpError(409, 'La fecha ' + a.date.split('-').reverse().join('/') + ' ya pasó. ¿Lo guardás igual?', { code: 'past' });
    }
    const others = (
      await c.query('SELECT a.id, a.pet_id, a.on_date, a.at_time, a.duration_min, a.status, a.staff, pt.name AS pet FROM appointments a JOIN pets pt ON pt.id = a.pet_id WHERE a.on_date = $1', [a.date])
    ).rows.map((o) => ({ id: o.id, petId: o.pet_id, date: o.on_date, time: String(o.at_time).slice(0, 5), duration: o.duration_min, status: o.status, staff: o.staff, pet: o.pet }));
    const hits = L.findConflicts({ id: selfId || 0, petId: a.petId, date: a.date, time: a.time, duration: a.duration, status: a.status, staff: a.staff }, others);
    if (hits.length && !(b.confirmOverlap === true && admin)) {
      const h = hits[0];
      const end = hhmm(Number(h.time.slice(0, 2)) * 60 + Number(h.time.slice(3, 5)) + h.duration);
      const who = h.petId === a.petId ? h.pet + ' ya tiene un turno' : (h.staff || 'Ese peluquero') + ' ya atiende a ' + h.pet;
      throw new HttpError(409, who + ' de ' + h.time + ' a ' + end + '.' + (admin ? ' ¿Reservás igual?' : ' Elegí otro horario o pedile al dueño que lo confirme.'), {
        code: admin ? 'overlap' : 'overlap_forbidden',
        details: hits.map((x) => ({ id: x.id, pet: x.pet, time: x.time, duration: x.duration, staff: x.staff })),
      });
    }
    const s = await getSettings(c);
    if (!['cancelado', 'no_vino'].includes(a.status) && !L.withinHours(s.hours, a.date, a.time, a.duration) && b.confirmHours !== true) {
      const h = s.hours[L.weekday(a.date)];
      throw new HttpError(409, (h ? 'El turno queda fuera del horario de atención de ese día (' + h[0] + ' a ' + h[1] + ').' : 'Ese día el local está cerrado.') + ' ¿Lo reservás igual?', { code: 'hours' });
    }
  }
  /** Cuándo empezó y terminó de verdad un turno (para comparar con la duración estimada). */
  function stamps(status) {
    if (status === 'en_curso') return ', started_at = COALESCE(started_at, now())';
    if (status === 'listo' || status === 'entregado') return ', started_at = COALESCE(started_at, now()), finished_at = COALESCE(finished_at, now())';
    return '';
  }

  add('GET', '/api/appointments', async (ctx) => {
    const from = U.reqDate(ctx.query.get('from') || '', 'Desde');
    const to = U.reqDate(ctx.query.get('to') || '', 'Hasta');
    if (to < from) throw U.bad('«Hasta» no puede ser anterior a «Desde».');
    const r = await db.query('SELECT ' + APPT_COLS + APPT_FROM + ' WHERE a.on_date BETWEEN $1 AND $2 ORDER BY a.on_date, a.at_time, a.id', [from, to]);
    return { items: r.rows.map(mapAppt) };
  });
  // Peluqueros cargados alguna vez (para sugerirlos en el formulario).
  add('GET', '/api/appointments/staff', async () => {
    const r = await db.query("SELECT DISTINCT staff FROM appointments WHERE staff <> '' ORDER BY staff");
    return { items: r.rows.map((x) => x.staff) };
  });
  add('POST', '/api/appointments', async (ctx) => {
    const a = apptInput(ctx.body);
    await mustExist(db, 'pets', a.petId, 'No encontramos esa mascota. Recargá la página.');
    if (a.serviceId) await mustExist(db, 'services', a.serviceId, 'No encontramos ese servicio. Recargá la página.');
    return db.tx(async (c) => {
      await checkAppt(c, a, null, ctx.body, isAdmin(ctx));
      const r = await c.query(
        'INSERT INTO appointments (pet_id, service_id, on_date, at_time, duration_min, status, notes, staff) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [a.petId, a.serviceId, a.date, a.time, a.duration, a.status, a.notes, a.staff]
      );
      if (stamps(a.status)) await c.query('UPDATE appointments SET status = status' + stamps(a.status) + ' WHERE id = $1', [r.rows[0].id]);
      return { id: r.rows[0].id };
    });
  });
  add('PUT', '/api/appointments/:id', async (ctx) => {
    const id = U.idParam(ctx.params.id);
    const a = apptInput(ctx.body);
    await mustExist(db, 'pets', a.petId, 'No encontramos esa mascota. Recargá la página.');
    if (a.serviceId) await mustExist(db, 'services', a.serviceId, 'No encontramos ese servicio. Recargá la página.');
    return db.tx(async (c) => {
      await checkAppt(c, a, id, ctx.body, isAdmin(ctx));
      const r = await c.query(
        'UPDATE appointments SET pet_id = $1, service_id = $2, on_date = $3, at_time = $4, duration_min = $5, status = $6, notes = $7, staff = $8' + stamps(a.status) + ' WHERE id = $9 RETURNING id',
        [a.petId, a.serviceId, a.date, a.time, a.duration, a.status, a.notes, a.staff, id]
      );
      if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese turno. Recargá la agenda.');
    });
  });
  // Cambio rápido de estado (en curso, listo para retirar, no vino...).
  add('POST', '/api/appointments/:id/status', async (ctx) => {
    const status = U.oneOf(ctx.body.status, U.APPT_STATUS, 'Estado');
    const r = await db.query('UPDATE appointments SET status = $1' + stamps(status) + ' WHERE id = $2 RETURNING id', [status, U.idParam(ctx.params.id)]);
    if (!r.rows[0]) throw new HttpError(404, 'No encontramos ese turno. Recargá la agenda.');
  });
  add('DELETE', '/api/appointments/:id', async (ctx) => {
    await db.query('DELETE FROM appointments WHERE id = $1', [U.idParam(ctx.params.id)]);
  });
};
