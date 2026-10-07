'use strict';

/* ============================================================
   Resumen (una sola pantalla con todos los números) e informe semanal por email
   Todo se calcula acá con consultas agregadas; las ventas anuladas no cuentan. Lo que muestra costos,
   márgenes o ganancias es solo para el dueño (lo valida el servidor, no solo la pantalla).
   ============================================================ */
module.exports = function (H) {
  const { add, db, U, L, HttpError, isAdmin, getSettings, drawerAt, report, sendCsv, fmtD, num } = H;
  const TZ = U.TZ;
  const LOCAL_DATE = "(s.created_at AT TIME ZONE '" + TZ + "')";

  /** Período pedido (por defecto, hoy) y el período anterior de igual largo, para comparar. */
  function range(q) {
    const today = U.todayAR();
    const from = q.get('from') ? U.reqDate(q.get('from'), 'Desde') : today;
    const to = q.get('to') ? U.reqDate(q.get('to'), 'Hasta') : from;
    if (to < from) throw U.bad('«Hasta» no puede ser anterior a «Desde».');
    const days = U.daysBetween(from, to) + 1;
    if (days > 800) throw U.bad('Elegí un período de hasta 2 años.');
    return { from, to, days, prevFrom: U.addDays(from, -days), prevTo: U.addDays(from, -1) };
  }
  /** El mismo período corrido `months` meses (con el día recortado al fin de mes). */
  function shiftMonths(iso, months) {
    const first = U.monthStart(iso, months);
    const last = Number(U.monthEnd(first).slice(8, 10));
    return first.slice(0, 8) + String(Math.min(Number(iso.slice(8, 10)), last)).padStart(2, '0');
  }

  async function totals(from, to) {
    const [s, e, nc] = await Promise.all([
      db.query('SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(cost_total), 0) AS cost FROM sales WHERE voided_at IS NULL AND on_date BETWEEN $1 AND $2', [from, to]),
      db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE kind = 'out' AND category <> 'Retiro de caja' AND on_date BETWEEN $1 AND $2", [from, to]),
      db.query("SELECT COUNT(*) AS n FROM clients WHERE (created_at AT TIME ZONE '" + TZ + "')::date BETWEEN $1 AND $2", [from, to]),
    ]);
    const n = Number(s.rows[0].n);
    const total = U.round2(Number(s.rows[0].total));
    const profit = U.round2(total - Number(s.rows[0].cost));
    return { count: n, total, profit, margin: L.marginPct(total, profit), avg: n ? U.round2(total / n) : 0, expenses: U.round2(Number(e.rows[0].total)), newClients: Number(nc.rows[0].n) };
  }
  const hideMoney = (t) => Object.assign({}, t, { profit: null, margin: null, expenses: null });

  // Pantalla principal del Resumen: tarjetas, evolución, lo más vendido, categorías, medios de pago y avisos.
  add('GET', '/api/summary', async (ctx) => {
    const admin = isAdmin(ctx);
    const R = range(ctx.query);
    const today = U.todayAR();
    const daily = R.days <= 62;
    const series = daily
      ? await db.query('SELECT on_date AS k, SUM(total) AS total, SUM(total - cost_total) AS profit, COUNT(*) AS n FROM sales WHERE voided_at IS NULL AND on_date BETWEEN $1 AND $2 GROUP BY on_date', [R.from, R.to])
      : await db.query("SELECT to_char(on_date, 'YYYY-MM') AS k, SUM(total) AS total, SUM(total - cost_total) AS profit, COUNT(*) AS n FROM sales WHERE voided_at IS NULL AND on_date BETWEEN $1 AND $2 GROUP BY 1", [R.from, R.to]);
    await H.autoReady(db);
    const [cur, prev, top, cats, pays, appts, closing, movesToday] = await Promise.all([
      totals(R.from, R.to),
      totals(R.prevFrom, R.prevTo),
      db.query(
        'SELECT i.name, i.unit, SUM(i.qty) AS qty, SUM(i.amount) AS total, SUM(i.amount - i.qty * i.unit_cost) AS profit FROM sale_items i JOIN sales s ON s.id = i.sale_id ' +
          "WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 AND i.kind = 'product' GROUP BY i.name, i.unit",
        [R.from, R.to]
      ),
      db.query(
        "SELECT CASE WHEN i.category = '' THEN 'Sin categoría' ELSE i.category END AS category, SUM(i.amount) AS total FROM sale_items i JOIN sales s ON s.id = i.sale_id " +
          'WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY total DESC',
        [R.from, R.to]
      ),
      db.query('SELECT p.method, SUM(p.amount) AS total FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 GROUP BY p.method', [R.from, R.to]),
      db.query("SELECT COUNT(*) FILTER (WHERE status IN ('reservado', 'confirmado', 'en_curso', 'listo')) AS pending, COUNT(*) FILTER (WHERE status NOT IN ('cancelado', 'no_vino')) AS total FROM appointments WHERE on_date = $1", [today]),
      db.query('SELECT 1 FROM cash_closings WHERE on_date = $1', [today]),
      db.query('SELECT COUNT(*) AS n FROM cash_movements WHERE on_date = $1', [today]),
    ]);
    const map = {};
    series.rows.forEach((x) => (map[x.k] = x));
    const points = [];
    if (daily) {
      for (let d = R.from; d <= R.to; d = U.addDays(d, 1)) points.push({ key: d, total: U.round2(Number((map[d] || {}).total || 0)), profit: U.round2(Number((map[d] || {}).profit || 0)), count: Number((map[d] || {}).n || 0) });
    } else {
      for (let m = R.from.slice(0, 7); m <= R.to.slice(0, 7); m = U.monthStart(U.addDays(m + '-01', 32)).slice(0, 7)) {
        points.push({ key: m, total: U.round2(Number((map[m] || {}).total || 0)), profit: U.round2(Number((map[m] || {}).profit || 0)), count: Number((map[m] || {}).n || 0) });
      }
    }
    const topRows = top.rows.map((x) => ({ name: x.name, unit: x.unit, qty: Number(x.qty), total: U.round2(Number(x.total)), profit: U.round2(Number(x.profit)) }));
    const catTotal = cats.rows.reduce((n, x) => n + Number(x.total), 0);
    const out = {
      from: R.from, to: R.to, days: R.days, prevFrom: R.prevFrom, prevTo: R.prevTo, granularity: daily ? 'day' : 'month',
      kpis: admin ? cur : hideMoney(cur),
      prev: admin ? prev : hideMoney(prev),
      change: {
        total: L.pctChange(cur.total, prev.total), count: L.pctChange(cur.count, prev.count), avg: L.pctChange(cur.avg, prev.avg), newClients: L.pctChange(cur.newClients, prev.newClients),
        profit: admin ? L.pctChange(cur.profit, prev.profit) : null, expenses: admin ? L.pctChange(cur.expenses, prev.expenses) : null,
      },
      series: points.map((p) => (admin ? p : { key: p.key, total: p.total, count: p.count, profit: null })),
      topByUnits: topRows.slice().sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 5).map((x) => (admin ? x : Object.assign({}, x, { profit: null }))),
      topByProfit: admin ? topRows.slice().sort((a, b) => b.profit - a.profit).slice(0, 5) : null,
      categories: cats.rows.map((x) => ({ category: x.category, total: U.round2(Number(x.total)), share: catTotal ? Math.round((Number(x.total) / catTotal) * 1000) / 10 : 0 })),
      payments: pays.rows.map((x) => ({ method: x.method, total: U.round2(Number(x.total)) })),
      alerts: { apptsPending: Number(appts.rows[0].pending), apptsToday: Number(appts.rows[0].total) },
    };
    if (admin) {
      out.drawer = await drawerAt(db, today);
      out.alerts.cashNotClosed = !closing.rows[0] && Number(movesToday.rows[0].n) > 0;
    }
    return out;
  });

  /* ---------- Mes a mes (últimos 6 o 12 meses) ---------- */
  async function monthly(months) {
    const today = U.todayAR();
    const from = U.monthStart(today, months - 1);
    const to = U.monthEnd(today);
    const [s, c] = await Promise.all([
      db.query("SELECT to_char(on_date, 'YYYY-MM') AS ym, COUNT(*) AS n, SUM(total) AS total, SUM(cost_total) AS cost FROM sales WHERE voided_at IS NULL AND on_date BETWEEN $1 AND $2 GROUP BY 1", [from, to]),
      db.query("SELECT to_char(on_date, 'YYYY-MM') AS ym, kind, category, SUM(amount) AS total FROM cash_movements WHERE on_date BETWEEN $1 AND $2 GROUP BY 1, 2, 3", [from, to]),
    ]);
    const rows = [];
    const idx = {};
    for (let i = months - 1; i >= 0; i--) {
      const m = { ym: U.monthStart(today, i).slice(0, 7), count: 0, sales: 0, cost: 0, profit: 0, purchases: 0, expenses: 0 };
      rows.push(m);
      idx[m.ym] = m;
    }
    s.rows.forEach((x) => {
      const m = idx[x.ym];
      if (!m) return;
      m.count = Number(x.n);
      m.sales = Number(x.total);
      m.cost = Number(x.cost);
    });
    c.rows.forEach((x) => {
      const m = idx[x.ym];
      if (!m || x.kind !== 'out') return;
      if (x.category === 'Compra de mercadería') m.purchases += Number(x.total);
      else if (x.category !== 'Retiro de caja') m.expenses += Number(x.total);
    });
    rows.forEach((m) => {
      ['sales', 'cost', 'purchases', 'expenses'].forEach((k) => (m[k] = U.round2(m[k])));
      m.profit = U.round2(m.sales - m.cost);
      m.result = U.round2(m.profit - m.expenses);
    });
    return rows;
  }
  const monthsParam = (q) => (Number(q.get('months')) === 6 ? 6 : 12);
  add('GET', '/api/summary/monthly', { admin: true }, async (ctx) => ({ months: await monthly(monthsParam(ctx.query)) }));
  add('GET', '/api/summary/monthly/export', { admin: true }, async (ctx) => {
    const rows = await monthly(monthsParam(ctx.query));
    return sendCsv(
      ctx,
      'mes-a-mes-' + U.todayAR() + '.csv',
      ['Mes', 'Ventas', 'Vendido', 'Costo de lo vendido', 'Ganancia bruta', 'Gastos', 'Resultado', 'Compras de mercadería'],
      rows.map((m) => [m.ym, m.count, num(m.sales), num(m.cost), num(m.profit), num(m.expenses), num(m.result), num(m.purchases)])
    );
  });

  /* ---------- Rentabilidad por producto, marca o categoría ---------- */
  async function profitability(q) {
    const R = range(q);
    const group = ['product', 'brand', 'category'].includes(q.get('group')) ? q.get('group') : 'product';
    const key = group === 'product' ? 'i.name' : group === 'brand' ? "COALESCE(NULLIF(p.brand, ''), 'Sin marca')" : "COALESCE(NULLIF(i.category, ''), 'Sin categoría')";
    const r = await db.query(
      'SELECT ' + key + " AS name, MAX(i.unit) AS unit, SUM(i.qty) AS qty, SUM(i.amount) AS total, SUM(i.qty * i.unit_cost) AS cost FROM sale_items i JOIN sales s ON s.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id " +
        "WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 AND i.kind = 'product' GROUP BY 1",
      [R.from, R.to]
    );
    const s = await getSettings();
    const items = r.rows.map((x) => {
      const total = U.round2(Number(x.total));
      const cost = U.round2(Number(x.cost));
      return { name: x.name, unit: group === 'product' ? x.unit : 'u', qty: Number(x.qty), total, cost, profit: U.round2(total - cost), margin: L.marginPct(total, total - cost) };
    });
    const allProfit = items.reduce((n, x) => n + x.profit, 0);
    items.forEach((x) => {
      x.share = allProfit > 0 ? Math.round((x.profit / allProfit) * 1000) / 10 : null;
      x.low = x.margin != null && x.margin < s.lowMargin;
    });
    items.sort((a, b) => b.profit - a.profit);
    return { from: R.from, to: R.to, group, lowMargin: s.lowMargin, items, top10: items.slice(0, 10).map((x) => x.name) };
  }
  add('GET', '/api/summary/products', { admin: true }, async (ctx) => profitability(ctx.query));
  add('GET', '/api/summary/products/export', { admin: true }, async (ctx) => {
    const P = await profitability(ctx.query);
    return sendCsv(
      ctx,
      'rentabilidad-' + P.from + '_a_' + P.to + '.csv',
      [P.group === 'product' ? 'Producto' : P.group === 'brand' ? 'Marca' : 'Categoría', 'Unidades', 'Ingresos', 'Costo', 'Ganancia', 'Margen %', '% de la ganancia'],
      P.items.map((x) => [x.name, num(x.qty), num(x.total), num(x.cost), num(x.profit), x.margin == null ? '' : num(x.margin), x.share == null ? '' : num(x.share)])
    );
  });

  /* ---------- Horarios y días pico ---------- */
  add('GET', '/api/summary/hours', async (ctx) => {
    const R = range(ctx.query);
    const r = await db.query(
      'SELECT EXTRACT(DOW FROM ' + LOCAL_DATE + ')::int AS dow, EXTRACT(HOUR FROM ' + LOCAL_DATE + ')::int AS hour, COUNT(*) AS n, SUM(s.total) AS total ' +
        'FROM sales s WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 GROUP BY 1, 2',
      [R.from, R.to]
    );
    const cells = r.rows.map((x) => ({ dow: x.dow, hour: x.hour, n: Number(x.n), total: U.round2(Number(x.total)) }));
    const byDay = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const c = cells.filter((x) => x.dow === d);
      return { dow: d, n: c.reduce((s, x) => s + x.n, 0), total: U.round2(c.reduce((s, x) => s + x.total, 0)) };
    });
    return { from: R.from, to: R.to, cells, byDay, phrase: L.peakPhrase(cells) };
  });

  /* ---------- Clientes frecuentes, perdidos, nuevos y recurrentes ---------- */
  async function clientsReport(q) {
    const R = range(q);
    const s = await getSettings();
    const lostDays = Number(q.get('lostDays')) >= 7 ? Math.min(365, Number(q.get('lostDays'))) : s.lostDays;
    const today = U.todayAR();
    const [freq, hist, nv] = await Promise.all([
      db.query(
        "SELECT c.id, trim(c.first_name || ' ' || c.last_name) AS name, c.phone, COUNT(*) AS n, SUM(s.total) AS total, " +
          '(SELECT MAX(s2.on_date) FROM sales s2 WHERE s2.client_id = c.id AND s2.voided_at IS NULL) AS last ' +
          'FROM sales s JOIN clients c ON c.id = s.client_id WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 GROUP BY c.id ORDER BY n DESC, total DESC LIMIT 50',
        [R.from, R.to]
      ),
      db.query(
        "SELECT c.id, trim(c.first_name || ' ' || c.last_name) AS name, c.phone, COUNT(*) AS purchases, MIN(s.on_date) AS first, MAX(s.on_date) AS last, SUM(s.total) AS total " +
          'FROM sales s JOIN clients c ON c.id = s.client_id WHERE s.voided_at IS NULL AND s.on_date >= $1 GROUP BY c.id',
        [U.addDays(today, -365)]
      ),
      db.query(
        'SELECT COUNT(*) FILTER (WHERE f.first BETWEEN $1 AND $2) AS nuevos, COUNT(*) FILTER (WHERE f.first < $1) AS recurrentes FROM ' +
          '(SELECT s.client_id, MIN(s.on_date) AS first FROM sales s WHERE s.voided_at IS NULL AND s.client_id IS NOT NULL GROUP BY s.client_id ' +
          'HAVING bool_or(s.on_date BETWEEN $1 AND $2)) f',
        [R.from, R.to]
      ),
    ]);
    const lost = L.lostClients(
      hist.rows.map((x) => ({ id: x.id, name: x.name, phone: x.phone, purchases: Number(x.purchases), first: x.first, last: x.last, total: U.round2(Number(x.total)) })),
      today,
      lostDays
    ).slice(0, 50);
    return {
      from: R.from, to: R.to, lostDays,
      frequent: freq.rows.map((x) => ({ id: x.id, name: x.name, phone: x.phone, count: Number(x.n), total: U.round2(Number(x.total)), avg: U.round2(Number(x.total) / Number(x.n)), last: x.last })),
      lost,
      newVsReturning: { new: Number((nv.rows[0] || {}).nuevos || 0), returning: Number((nv.rows[0] || {}).recurrentes || 0) },
    };
  }
  add('GET', '/api/summary/clients', async (ctx) => clientsReport(ctx.query));
  add('GET', '/api/summary/clients/export', { admin: true }, async (ctx) => {
    const C = await clientsReport(ctx.query);
    return sendCsv(
      ctx,
      'clientes-' + C.from + '_a_' + C.to + '.csv',
      ['Tipo', 'Cliente', 'Teléfono', 'Compras', 'Total', 'Ticket promedio', 'Última compra', 'Días sin comprar'],
      C.frequent.map((x) => ['Frecuente', x.name, x.phone, x.count, num(x.total), num(x.avg), fmtD(x.last), ''])
        .concat(C.lost.map((x) => ['Perdido', x.name, x.phone, x.purchases, num(x.total), '', fmtD(x.last), x.daysSince]))
    );
  });

  /* ---------- Comparación contra el mes anterior y el mismo mes del año pasado ---------- */
  add('GET', '/api/summary/compare', { admin: true }, async (ctx) => {
    const R = range(ctx.query);
    const ref = { prevMonth: [shiftMonths(R.from, 1), shiftMonths(R.to, 1)], prevYear: [shiftMonths(R.from, 12), shiftMonths(R.to, 12)] };
    const [cur, pm, py, first] = await Promise.all([
      totals(R.from, R.to),
      totals(ref.prevMonth[0], ref.prevMonth[1]),
      totals(ref.prevYear[0], ref.prevYear[1]),
      db.query('SELECT MIN(on_date) AS d FROM sales WHERE voided_at IS NULL'),
    ]);
    const firstSale = first.rows[0].d;
    const hasYear = !!firstSale && firstSale <= ref.prevYear[1];
    const keys = [['total', 'Vendido', true], ['profit', 'Ganancia', true], ['expenses', 'Gastos', false], ['avg', 'Ticket promedio', true], ['count', 'Ventas', true], ['newClients', 'Clientes nuevos', true]];
    const rows = keys.map(([k, label, upIsGood]) => ({
      key: k, label, upIsGood, current: cur[k],
      prevMonth: { value: pm[k], diff: U.round2(cur[k] - pm[k]), pct: L.pctChange(cur[k], pm[k]) },
      prevYear: hasYear ? { value: py[k], diff: U.round2(cur[k] - py[k]), pct: L.pctChange(cur[k], py[k]) } : null,
    }));
    const daily = async (a, b) => {
      const r = await db.query('SELECT on_date, SUM(total) AS total FROM sales WHERE voided_at IS NULL AND on_date BETWEEN $1 AND $2 GROUP BY on_date', [a, b]);
      const m = {};
      r.rows.forEach((x) => (m[x.on_date] = Number(x.total)));
      const out = [];
      for (let d = a, i = 0; d <= b && i < 62; d = U.addDays(d, 1), i++) out.push(U.round2(m[d] || 0));
      return out;
    };
    const lines = R.days <= 62 ? { current: await daily(R.from, R.to), prevMonth: await daily(ref.prevMonth[0], ref.prevMonth[1]), prevYear: hasYear ? await daily(ref.prevYear[0], ref.prevYear[1]) : null } : null;
    return { from: R.from, to: R.to, ref, hasYear, rows, lines };
  });

  /* ---------- Rendimiento del personal ---------- */
  add('GET', '/api/summary/staff', { admin: true }, async (ctx) => {
    const R = range(ctx.query);
    const r = await db.query(
      "SELECT COALESCE(NULLIF(a.staff, ''), 'Sin asignar') AS staff, COUNT(*) AS total, " +
        "COUNT(*) FILTER (WHERE a.status IN ('listo', 'entregado')) AS done, COUNT(*) FILTER (WHERE a.status = 'no_vino') AS noshow, " +
        "COUNT(*) FILTER (WHERE a.status = 'cancelado') AS cancelled, AVG(a.duration_min) FILTER (WHERE a.status IN ('listo', 'entregado')) AS est, " +
        'AVG(EXTRACT(EPOCH FROM (a.finished_at - a.started_at)) / 60) FILTER (WHERE a.finished_at IS NOT NULL AND a.started_at IS NOT NULL AND a.finished_at > a.started_at) AS real, ' +
        'COALESCE(SUM(sr.rev), 0) AS revenue, ' +
        "MODE() WITHIN GROUP (ORDER BY sv.name) FILTER (WHERE sv.name IS NOT NULL) AS top_service " +
        'FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id ' +
        "LEFT JOIN (SELECT i.sale_id, SUM(i.amount) AS rev FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE i.kind = 'service' AND s.voided_at IS NULL GROUP BY i.sale_id) sr ON sr.sale_id = a.sale_id " +
        'WHERE a.on_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY done DESC',
      [R.from, R.to]
    );
    const pctOf = (a, b) => (Number(b) ? Math.round((Number(a) / Number(b)) * 1000) / 10 : null);
    return {
      from: R.from, to: R.to,
      items: r.rows.map((x) => ({
        staff: x.staff, total: Number(x.total), done: Number(x.done), revenue: U.round2(Number(x.revenue)),
        estMinutes: x.est == null ? null : Math.round(Number(x.est)), realMinutes: x.real == null ? null : Math.round(Number(x.real)),
        noShowPct: pctOf(x.noshow, x.total), cancelPct: pctOf(x.cancelled, x.total), topService: x.top_service || '',
      })),
    };
  });

  /* ---------- Proyección de caja y punto de equilibrio del mes ---------- */
  async function projection() {
    const today = U.todayAR();
    const s = await getSettings();
    const monthFrom = today.slice(0, 7) + '-01';
    const day = Number(today.slice(8, 10));
    const daysInMonth = Number(U.monthEnd(today).slice(8, 10));
    const prevFrom = U.monthStart(today, 3);
    const prevTo = U.addDays(monthFrom, -1);
    const fixed = s.fixedCategories.length ? s.fixedCategories : ['__ninguna__'];
    const [cur, curOut, prev, prevOut, curFixed, prevFixed, firstSale] = await Promise.all([
      db.query('SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(cost_total), 0) AS cost FROM sales WHERE voided_at IS NULL AND on_date BETWEEN $1 AND $2', [monthFrom, today]),
      db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE kind = 'out' AND category <> 'Retiro de caja' AND on_date BETWEEN $1 AND $2", [monthFrom, today]),
      db.query('SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(cost_total), 0) AS cost FROM sales WHERE voided_at IS NULL AND on_date BETWEEN $1 AND $2', [prevFrom, prevTo]),
      db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE kind = 'out' AND category <> 'Retiro de caja' AND on_date BETWEEN $1 AND $2", [prevFrom, prevTo]),
      db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE kind = 'out' AND category = ANY($3::text[]) AND on_date BETWEEN $1 AND $2", [monthFrom, today, fixed]),
      db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE kind = 'out' AND category = ANY($3::text[]) AND on_date BETWEEN $1 AND $2", [prevFrom, prevTo, fixed]),
      db.query('SELECT MIN(on_date) AS d FROM sales WHERE voided_at IS NULL'),
    ]);
    // Promedio mensual de los últimos 3 meses, contando solo los meses en que el sistema ya se usaba.
    const fs = firstSale.rows[0].d;
    const prevMonths = fs ? Math.max(0, Math.min(3, (Number(prevTo.slice(0, 4)) - Number(fs.slice(0, 4))) * 12 + Number(prevTo.slice(5, 7)) - Number(fs.slice(5, 7)) + 1)) : 0;
    const avg = (x) => (prevMonths ? U.round2(Number(x) / prevMonths) : 0);
    const sales = U.round2(Number(cur.rows[0].total));
    const expenses = U.round2(Number(curOut.rows[0].total));
    const p = L.projectMonth({ sales, expenses, day, daysInMonth, avgSales: avg(prev.rows[0].total), avgExpenses: avg(prevOut.rows[0].total) });
    const allSales = Number(cur.rows[0].total) + Number(prev.rows[0].total);
    const allCost = Number(cur.rows[0].cost) + Number(prev.rows[0].cost);
    const margin = L.marginPct(allSales, allSales - allCost);
    const fixedCosts = Math.max(U.round2(Number(curFixed.rows[0].total)), avg(prevFixed.rows[0].total));
    const need = L.breakEven(fixedCosts, margin);
    const reach = L.reachDay(sales, need, day, daysInMonth);
    return {
      month: today.slice(0, 7), day, daysInMonth, sales, expenses, avgMonths: prevMonths,
      projection: p,
      result: {
        expected: U.round2(p.sales.expected - p.expenses.expected),
        optimistic: U.round2(p.sales.optimistic - p.expenses.optimistic),
        prudent: U.round2(p.sales.prudent - p.expenses.prudent),
      },
      breakEven: { fixedCosts, fixedCategories: s.fixedCategories, margin, need, progress: need ? Math.min(100, Math.round((sales / need) * 1000) / 10) : null, reachDate: reach ? today.slice(0, 8) + String(reach).padStart(2, '0') : null },
    };
  }
  add('GET', '/api/summary/projection', { admin: true }, async () => projection());

  // Detalle de ventas por línea, para abrir en Excel.
  add('GET', '/api/summary/sales-export', { admin: true }, async (ctx) => {
    const R = range(ctx.query);
    const r = await db.query(
      "SELECT s.number, s.on_date, s.method, trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS client, u.name AS seller, i.kind, i.name, i.category, i.unit, i.qty, i.unit_price, i.list_price, i.price_reason, i.unit_cost, i.amount " +
        'FROM sale_items i JOIN sales s ON s.id = i.sale_id LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.created_by ' +
        'WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 ORDER BY s.on_date, s.number, i.id LIMIT 100000',
      [R.from, R.to]
    );
    return sendCsv(
      ctx,
      'ventas-' + R.from + '_a_' + R.to + '.csv',
      ['Fecha', 'Venta N°', 'Tipo', 'Artículo', 'Categoría', 'Cantidad', 'Unidad', 'Precio de lista', 'Precio cobrado', 'Motivo del cambio', 'Costo unitario', 'Cobrado', 'Ganancia', 'Forma de pago', 'Cliente', 'Vendió'],
      r.rows.map((x) => [
        fmtD(x.on_date), x.number, x.kind === 'product' ? 'Producto' : 'Servicio', x.name, x.category, num(x.qty), x.unit === 'kg' ? 'kg' : 'unidad', num(x.list_price), num(x.unit_price), x.price_reason,
        num(x.unit_cost), num(x.amount), num(U.round2(Number(x.amount) - Number(x.qty) * Number(x.unit_cost))), x.method, x.client, x.seller || '',
      ])
    );
  });

  /* ============================================================
     Informe semanal por email (lunes, semana anterior)
     ============================================================ */
  const fmt$ = (n) => L.fmtMoney(U.round2(n));
  const pctTxt = (p) => (p == null ? 'sin datos para comparar' : (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toString().replace('.', ',') + ' %');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** Semana anterior (lunes a domingo) respecto de `today`. */
  function lastWeek(today) {
    const dow = new Date(today + 'T12:00:00Z').getUTCDay();
    const monday = U.addDays(today, -((dow + 6) % 7) - 7);
    return { from: monday, to: U.addDays(monday, 6) };
  }
  async function buildWeekly() {
    const s = await getSettings();
    const W = lastWeek(U.todayAR());
    const prevFrom = U.addDays(W.from, -7);
    const [cur, prev, top, low, exp, noshow] = await Promise.all([
      totals(W.from, W.to),
      totals(prevFrom, U.addDays(W.from, -1)),
      db.query(
        "SELECT i.name, SUM(i.qty) AS qty, i.unit, SUM(i.amount) AS total FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.voided_at IS NULL AND s.on_date BETWEEN $1 AND $2 AND i.kind = 'product' GROUP BY i.name, i.unit ORDER BY total DESC LIMIT 5",
        [W.from, W.to]
      ),
      db.query('SELECT name, stock, min_stock, unit FROM products WHERE stock <= min_stock ORDER BY stock LIMIT 15'),
      db.query("SELECT name, expires_on FROM products WHERE expires_on IS NOT NULL AND expires_on <= $1 AND stock > 0 ORDER BY expires_on LIMIT 15", [U.addDays(U.todayAR(), 30)]),
      db.query("SELECT COUNT(*) AS n FROM appointments WHERE status = 'no_vino' AND on_date BETWEEN $1 AND $2", [W.from, W.to]),
    ]);
    const lost = (await clientsReport(new URLSearchParams({ from: W.from, to: W.to }))).lost.slice(0, 10);
    const li = (arr, f) => (arr.length ? '<ul>' + arr.map((x) => '<li>' + f(x) + '</li>').join('') + '</ul>' : '<p style="color:#6B7280">Nada para mostrar.</p>');
    const qty = (n, u) => String(Number(n)).replace('.', ',') + (u === 'kg' ? ' kg' : '');
    const html =
      '<div style="font-family:Arial,sans-serif;color:#374151;max-width:640px">' +
      '<h1 style="font-size:20px">' + esc(s.shopName) + ': resumen de la semana</h1>' +
      '<p>Del ' + fmtD(W.from) + ' al ' + fmtD(W.to) + '.</p>' +
      '<table cellpadding="6" style="border-collapse:collapse">' +
      '<tr><td>Vendido</td><td><b>' + fmt$(cur.total) + '</b></td><td>' + pctTxt(L.pctChange(cur.total, prev.total)) + ' vs. semana anterior</td></tr>' +
      '<tr><td>Ganancia bruta</td><td><b>' + fmt$(cur.profit) + '</b></td><td>' + pctTxt(L.pctChange(cur.profit, prev.profit)) + '</td></tr>' +
      '<tr><td>Ventas</td><td><b>' + cur.count + '</b></td><td>Ticket promedio ' + fmt$(cur.avg) + '</td></tr>' +
      '<tr><td>Gastos y compras</td><td><b>' + fmt$(cur.expenses) + '</b></td><td></td></tr>' +
      '<tr><td>Turnos «No vino»</td><td><b>' + Number(noshow.rows[0].n) + '</b></td><td></td></tr></table>' +
      '<h2 style="font-size:16px">Lo más vendido</h2>' + li(top.rows, (x) => esc(x.name) + ': ' + qty(x.qty, x.unit) + ' (' + fmt$(Number(x.total)) + ')') +
      '<h2 style="font-size:16px">Poco stock</h2>' + li(low.rows, (x) => esc(x.name) + ': quedan ' + qty(x.stock, x.unit)) +
      '<h2 style="font-size:16px">Por vencer o vencidos</h2>' + li(exp.rows, (x) => esc(x.name) + ': ' + fmtD(x.expires_on)) +
      '<h2 style="font-size:16px">Clientes que dejaron de venir</h2>' + li(lost, (x) => esc(x.name) + ' (hace ' + x.daysSince + ' días' + (x.phone ? ', tel. ' + esc(x.phone) : '') + ')') +
      '<p style="color:#6B7280;font-size:12px">Informe automático del sistema de gestión. Se puede desactivar en Configuración.</p></div>';
    return { week: W.from, subject: s.shopName + ': resumen de la semana del ' + fmtD(W.from) + ' al ' + fmtD(W.to), html, recipients: s.report.recipients };
  }
  async function sendWeekly(manual) {
    const rep = await buildWeekly();
    const to = String(rep.recipients || '').split(/[,;\s]+/).filter(Boolean);
    if (!to.length) throw U.bad('Cargá al menos un email destinatario en Configuración → Informe semanal.');
    if (!report.configured()) throw new HttpError(503, 'El envío de emails no está configurado en el servidor (faltan EMAIL_PROVIDER, EMAIL_API_KEY y EMAIL_FROM en Render).', { code: 'email_not_configured' });
    try {
      await report.send(to, rep.subject, rep.html);
      await db.query('INSERT INTO report_log (week, recipients, ok) VALUES ($1, $2, TRUE)', [manual ? 'manual ' + rep.week : rep.week, to.join(', ')]);
    } catch (e) {
      await db.query('INSERT INTO report_log (week, recipients, ok, error) VALUES ($1, $2, FALSE, $3)', [manual ? 'manual ' + rep.week : rep.week, to.join(', '), String(e.message).slice(0, 500)]);
      throw new HttpError(502, 'No se pudo enviar el informe: ' + e.message);
    }
    return { ok: true, to };
  }
  /** Se llama cada hora (y desde el cron externo): envía el informe si es el día y la hora configurados y no se envió esta semana. */
  H.weeklyTick = async function () {
    const s = await getSettings();
    if (!s.report.enabled || !report.configured()) return { sent: false, reason: 'desactivado' };
    const now = new Date();
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(now.toLocaleString('en-US', { timeZone: TZ, weekday: 'short' }));
    const hour = Number(now.toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }));
    if (dow !== s.report.weekday || hour < s.report.hour) return { sent: false, reason: 'no es el horario' };
    const week = lastWeek(U.todayAR()).from;
    const done = await db.query('SELECT 1 FROM report_log WHERE week = $1 AND ok', [week]);
    if (done.rows[0]) return { sent: false, reason: 'ya enviado' };
    await sendWeekly(false);
    return { sent: true };
  };
  add('POST', '/api/report/send', { admin: true }, async () => sendWeekly(true));
  add('GET', '/api/report/preview', { admin: true }, async () => {
    const r = await buildWeekly();
    return { subject: r.subject, html: r.html };
  });
  add('GET', '/api/report/log', { admin: true }, async () => {
    const r = await db.query('SELECT at, week, recipients, ok, error FROM report_log ORDER BY at DESC LIMIT 30');
    return { configured: report.configured(), items: r.rows.map((x) => ({ at: x.at, week: x.week, recipients: x.recipients, ok: !!x.ok, error: x.error })) };
  });
  // Para un cron externo (Render se duerme en el plan gratuito): POST con el encabezado X-Cron-Secret.
  add('POST', '/api/cron/weekly-report', { public: true }, async (ctx) => {
    const secret = process.env.CRON_SECRET || '';
    if (!secret || ctx.req.headers['x-cron-secret'] !== secret) throw new HttpError(403, 'No autorizado.');
    return H.weeklyTick();
  });
};
