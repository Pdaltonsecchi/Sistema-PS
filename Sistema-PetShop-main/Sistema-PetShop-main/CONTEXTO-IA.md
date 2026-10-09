# Contexto técnico del proyecto (para quien programe o para otra IA)

Sistema de gestión para **el dueño de un pet shop** en Argentina (vende alimento, accesorios, juguetes, higiene, y ofrece baño y peluquería). Nació como **SYSVET/VETFLOW**, un sistema para veterinarias, y se reconvirtió: se quitó todo lo médico y se agregaron ventas con ganancia, punto de venta, agenda de peluquería y números para el dueño. Después pasó por una **auditoría de calidad** (etapa 2): precio controlado por el servidor, auditoría, numeración sin huecos, agenda con controles, Resumen unificado, escáner, accesibilidad, celular y PWA. El dueño no es programador: los mensajes de cara al usuario van en español rioplatense, claros y sin tecnicismos.

## Arquitectura

```
Navegador (HTML + CSS + JS plano, sin build)   public/index.html, styles.css, ui-rules.js, app.js, sw.js, manifest.webmanifest
        │  fetch() a /api/... (JSON, cookie de sesión)
        ▼
Node.js (http nativo, sin framework)
  server/index.js        → arranque, cabeceras de seguridad (CSP), estáticos, HTTPS forzado, /healthz,
                           errores 500 con código de referencia, tarea horaria del informe semanal
  server/api.js          → router propio, helpers comunes, sesión/usuarios, bootstrap, configuración, auditoría
  server/routes/*.js     → catalog (productos, códigos, servicios, proveedores), sales (ventas y caja),
                           people (clientes, mascotas, agenda), summary (Resumen e informe), backups
  server/logic.js        → reglas de negocio PURAS (precio, descuentos, pagos, agenda, márgenes, CSV, códigos)
  server/report.js       → envío de emails por API (Resend o Brevo), sin dependencias
  server/auth.js         → scrypt, cookie firmada HMAC "petshop_session", rate limit de login, primer admin
  server/db.js           → pool "pg" (max 5), parseo NUMERIC→number y DATE→'AAAA-MM-DD', tx(), migrate()
  server/backup.js       → copias gzip+base64 dentro de la base (7 automáticas, 10 manuales), export/restore
  server/util.js         → validaciones con mensajes en lenguaje natural, listas fijas, HttpError(status, msg, {code})
        │
        ▼
PostgreSQL en Neon (plan gratuito, misma región que Render: Ohio / AWS us-east-2; también anda en Supabase con "Session pooler" :5432). db/schema.sql se ejecuta en cada arranque.
```

Hosting: Render Web Service plan Free (`render.yaml`). Única dependencia: `pg`. No se usan funciones propias del proveedor de base (Storage, Auth, etc.): cualquier PostgreSQL con SSL sirve.

## Reglas clave

- **Precio:** `POST /api/sales` recalcula todo con los precios de la base (`L.priceSale`). Un empleado que manda otro precio recibe 403; el dueño puede, con motivo (≥ 3 letras), y queda `list_price` + `price_reason` en `sale_items` y una fila en `audit_log`.
- **Numeración:** `sales.number` sale de `counters` (UPDATE dentro de la transacción): un rollback no consume números. `sales.idem_key` (índice único) evita duplicados por doble clic; si dos pedidos con la misma clave llegan a la vez, el segundo choca con el índice (23505) y devuelve la venta del primero.
- **Venta en pocas consultas:** la latencia a la base domina el tiempo de «Cobrar», así que `POST /api/sales` hace una consulta que trae productos, servicios, cliente, mascota, turno y un posible duplicado (UNION), un UPDATE de stock en lote (unnest) y un solo INSERT encadenado (`SALE_INSERT`, CTE: contador → caja → venta → líneas → movimientos de stock → pagos → turno). Devuelve `stock` y `payments` para que la pantalla se actualice sin volver a pedir `/api/bootstrap`.
- **Pago mixto:** `sale_payments` (un ingreso en caja por medio). `sales.method = 'Mixto'` si hay más de uno.
- **Anular:** motivo obligatorio; devuelve stock, borra los ingresos de caja, marca `voided_at` (conserva el número).
- **Recordatorios:** un turno sin mascota (`appointments.pet_id` NULL, con `title`) es un recordatorio: no cuenta para superposiciones, horario, estados automáticos ni el Resumen. Un turno con servicio del catálogo exige mascota.
- **Agenda:** `L.findConflicts` (misma mascota o mismo personal asignado, `staff`): dos turnos solo se pueden pisar si los atiende personal distinto; la superposición no se puede forzar (409 `overlap_forbidden`). Cualquier otro choque de horario (otra mascota y otro personal) avisa con 409 `overlap_soft` y se puede agendar igual con `confirmOverlap` (`L.findOverlaps`). `L.withinHours` (horario guardado en `settings`, se edita en Configuración) y fechas pasadas piden confirmación (`hours`, `past`). Estados que ofrece la interfaz: Reservado → Confirmado; un turno confirmado pasa solo a «Listo para retirar» cuando termina (inicio + duración), lo hace `autoReady` en `server/api.js` (solo si `confirmed_at` es anterior al fin del turno: un turno confirmado cuando su horario ya pasó no salta de estado) al consultar la agenda, la ficha del cliente y el Resumen.
- **Confirmaciones genéricas:** cualquier 409 con `code` en `CONFIRMS` (app.js) se pregunta y se reintenta con el dato de confirmación (`confirmLoss`, `confirmDuplicate`, `confirmExpired`, `confirmFuture`, `reassign`...).
- **Productos:** precio 0 solo con `is_gift`; costo > precio pide confirmación; nombre + marca duplicado pide confirmación; varios códigos en `product_barcodes` (normalizados: UPC-A → EAN-13).
- **Resumen:** todo en `/api/summary*` con consultas agregadas; las ventas anuladas no cuentan; lo que muestra costo o ganancia es solo del dueño (el servidor oculta esos campos al empleado).
- **Configuración (`settings`):** `DEFAULT_SETTINGS` en `server/api.js`; `publicSettings` decide qué ve el empleado (nunca `fixedMonthly`). `fixedMonthly > 0` reemplaza los gastos fijos calculados por categorías en el punto de equilibrio.
- **Actividad:** `AUDIT_ACTIONS` (server/api.js) es la lista de acciones que se registran; el filtro de la pantalla la usa. Borrar un movimiento de caja pide motivo (`DELETE /api/cash/:id?reason=`) y queda quién y por qué.
- **Resumen:** «días y horarios pico» solo da conclusiones con datos suficientes (`L.PEAK_MIN`: 20 ventas en 7 días distintos); la proyección del mes usa ritmo esperado, bajo y alto solo para los días que faltan.
- **Pantalla:** reglas puras en `public/ui-rules.js` (etiquetas de gráficos que no se pisan, Enter en Vender, `latest()` para descartar respuestas viejas, `busyWhile` como único patrón de «cargando»: clase `busy` después de 150 ms).
- **Llegó mercadería (`POST /api/products/:id/purchase`):** el empleado puede mandar `paid` (total pagado) y `method`: se crea el egreso en caja y el costo pasa a `paid / qty`; no recibe `costChanged`. Precio por unidad, proveedor y fecha siguen siendo solo del dueño (403).
- **Permisos:** cada ruta declara `{ admin: true }`; `test/permisos.test.js` tiene la tabla completa y falla si aparece una ruta del dueño no declarada.

## Modelo de datos (db/schema.sql)

`users`, `suppliers`, `products` (+ `is_gift`), `product_barcodes`, `services`, `clients`, `pets`, `cash_movements`, `sales` (+ `number`, `idem_key`), `sale_items` (+ `list_price`, `price_reason`), `sale_payments`, `stock_movements`, `appointments` (+ `staff`, `started_at`, `finished_at`, `title`; `pet_id` opcional), `cash_closings`, `settings` (JSON de configuración), `audit_log`, `counters`, `report_log`, `backups`.

## Pruebas

- `npm test` → `test/run.js` corre `test/*.test.js` con `node:test` (sin dependencias):
  - `logica.test.js`: reglas puras (precio, descuentos, vencidos, pago mixto, superposiciones con bordes exactos, horario, margen, punto de equilibrio, división por cero, proyección, clientes perdidos, CSV, códigos).
  - `permisos.test.js`: la API real con una base simulada (`test/_fake.js` reemplaza "pg"): tabla de permisos, venta a $ 1, precio con motivo, numeración tras un error, idempotencia, agenda, textos con comillas/SQL.
  - `interfaz.test.js`: coherencia pantalla ↔ servidor (acciones, rutas, listas, almacenamiento local, service worker, textos).
  - `pantalla.test.js`: reglas puras de `public/ui-rules.js`.
- `npm run test:pg` → `test/postgres/*.test.js` contra un PostgreSQL real (`TEST_DATABASE_URL`, base vacía de prueba: la borra).
- `npm run demo` levanta el sistema con la base simulada y datos "QA" para revisar la interfaz sin PostgreSQL.

## Si se modifica

- Tabla o columna nueva: `db/schema.sql` con `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, y si es de negocio, `TABLES` en `server/backup.js` (con default para copias viejas en `COL_DEFAULTS`).
- Listas fijas (categorías, formas de pago): `server/util.js` **y** `public/app.js` (un test verifica que coincidan).
- Ruta nueva: decidir `{ admin: true }` y, si es del dueño, agregarla a la tabla de `test/permisos.test.js`.
- Variables de entorno: `.env.example`, `render.yaml` y, si son obligatorias, `checkEnv()` en `server/index.js`.
- Regla de negocio nueva: si se puede, como función pura en `server/logic.js` con su test.
