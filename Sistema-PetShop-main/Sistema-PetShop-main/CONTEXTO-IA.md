# Contexto técnico del proyecto (para quien programe o para otra IA)

Sistema de gestión para **el dueño de un pet shop** en Argentina (vende alimento, accesorios, juguetes, higiene, y ofrece baño y peluquería). Nació como **SYSVET/VETFLOW**, un sistema para veterinarias, y se reconvirtió: se quitó todo lo médico y se agregaron ventas con ganancia, punto de venta, agenda de peluquería y números para el dueño. Después pasó por una **auditoría de calidad** (etapa 2): precio controlado por el servidor, auditoría, numeración sin huecos, agenda con controles, Resumen unificado, escáner, accesibilidad, celular y PWA. El dueño no es programador: los mensajes de cara al usuario van en español rioplatense, claros y sin tecnicismos.

## Arquitectura

```
Navegador (HTML + CSS + JS plano, sin build)   public/index.html, styles.css, app.js, sw.js, manifest.webmanifest
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
PostgreSQL en Supabase (plan gratuito, "Session pooler" :5432). db/schema.sql se ejecuta en cada arranque.
```

Hosting: Render Web Service plan Free (`render.yaml`). Única dependencia: `pg`. No se usa Supabase Storage ni Auth.

## Reglas clave

- **Precio:** `POST /api/sales` recalcula todo con los precios de la base (`L.priceSale`). Un empleado que manda otro precio recibe 403; el dueño puede, con motivo (≥ 3 letras), y queda `list_price` + `price_reason` en `sale_items` y una fila en `audit_log`.
- **Numeración:** `sales.number` sale de `counters` (UPDATE dentro de la transacción): un rollback no consume números. `sales.idem_key` (índice único) evita duplicados por doble clic.
- **Pago mixto:** `sale_payments` (un ingreso en caja por medio). `sales.method = 'Mixto'` si hay más de uno.
- **Anular:** motivo obligatorio; devuelve stock, borra los ingresos de caja, marca `voided_at` (conserva el número).
- **Agenda:** `L.findConflicts` (misma mascota o mismo `staff`), `L.withinHours` (horario en Configuración), fechas pasadas. El servidor responde 409 con `{code}` (`overlap`, `hours`, `past`); la interfaz pregunta y reenvía `confirmOverlap/Hours/Past`. Solo el dueño puede forzar una superposición.
- **Confirmaciones genéricas:** cualquier 409 con `code` en `CONFIRMS` (app.js) se pregunta y se reintenta con el dato de confirmación (`confirmLoss`, `confirmDuplicate`, `confirmExpired`, `confirmFuture`, `reassign`...).
- **Productos:** precio 0 solo con `is_gift`; costo > precio pide confirmación; nombre + marca duplicado pide confirmación; varios códigos en `product_barcodes` (normalizados: UPC-A → EAN-13).
- **Resumen:** todo en `/api/summary*` con consultas agregadas; las ventas anuladas no cuentan; lo que muestra costo o ganancia es solo del dueño (el servidor oculta esos campos al empleado).
- **Permisos:** cada ruta declara `{ admin: true }`; `test/permisos.test.js` tiene la tabla completa y falla si aparece una ruta del dueño no declarada.

## Modelo de datos (db/schema.sql)

`users`, `suppliers`, `products` (+ `is_gift`), `product_barcodes`, `services`, `clients`, `pets`, `cash_movements`, `sales` (+ `number`, `idem_key`), `sale_items` (+ `list_price`, `price_reason`), `sale_payments`, `stock_movements`, `appointments` (+ `staff`, `started_at`, `finished_at`), `cash_closings`, `settings` (JSON de configuración), `audit_log`, `counters`, `report_log`, `backups`.

## Pruebas

- `npm test` → `test/run.js` corre `test/*.test.js` con `node:test` (sin dependencias):
  - `logica.test.js`: reglas puras (precio, descuentos, vencidos, pago mixto, superposiciones con bordes exactos, horario, margen, punto de equilibrio, división por cero, proyección, clientes perdidos, CSV, códigos).
  - `permisos.test.js`: la API real con una base simulada (`test/_fake.js` reemplaza "pg"): tabla de permisos, venta a $ 1, precio con motivo, numeración tras un error, idempotencia, agenda, textos con comillas/SQL.
  - `interfaz.test.js`: coherencia pantalla ↔ servidor (acciones, rutas, listas, almacenamiento local, service worker).
- `npm run demo` levanta el sistema con la base simulada y datos "QA" para revisar la interfaz sin PostgreSQL.
- **No probado contra PostgreSQL real** en esta etapa (las consultas nuevas se revisaron a mano). En el primer despliegue, mirar los Logs de Render.

## Si se modifica

- Tabla o columna nueva: `db/schema.sql` con `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, y si es de negocio, `TABLES` en `server/backup.js` (con default para copias viejas en `COL_DEFAULTS`).
- Listas fijas (categorías, formas de pago): `server/util.js` **y** `public/app.js` (un test verifica que coincidan).
- Ruta nueva: decidir `{ admin: true }` y, si es del dueño, agregarla a la tabla de `test/permisos.test.js`.
- Variables de entorno: `.env.example`, `render.yaml` y, si son obligatorias, `checkEnv()` en `server/index.js`.
- Regla de negocio nueva: si se puede, como función pura en `server/logic.js` con su test.
