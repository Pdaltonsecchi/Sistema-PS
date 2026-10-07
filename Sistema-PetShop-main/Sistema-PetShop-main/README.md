# Sistema de gestión para pet shop — guía para ponerlo en marcha

Sistema pensado para **el dueño del pet shop**: el stock de lo que vendés, las ventas del mostrador, la caja y, sobre todo, **los números** (cuánto vendiste, cuánto ganaste, qué se vende más, qué hay que pedir). También guarda tus clientes con sus mascotas y la agenda de peluquería y baño.

**No trae ningún dato de ejemplo**: arranca vacío para que cargues tus productos, servicios y precios.

## Qué hace

| Pantalla | Para qué sirve | Quién la ve |
|---|---|---|
| **Resumen** | Todos los números en una sola pantalla, con **selector de período** (hoy, ayer, 7 días, este mes, mes anterior o un rango). Pestañas: **General** (vendido, ganancia y margen, ticket promedio, ventas, efectivo en caja, gastos, evolución, mes a mes, lo más vendido, categorías, medios de pago, comparación con el mes anterior y el año pasado, horarios y días pico, avisos), **Productos** (rentabilidad por producto, marca o categoría), **Clientes** (frecuentes, perdidos con botón de WhatsApp, nuevos vs. recurrentes), **Personal** (rendimiento de cada peluquero) y **Proyección** (cómo cierra el mes y punto de equilibrio) | Todos (el empleado ve ventas y cantidades, sin costos ni ganancias) |
| **Vender** | Punto de venta: buscás o escaneás productos (cámara o lector USB), sumás servicios, cantidades con − / + (con tope de stock), descuento, cliente (opcional), forma de pago o **pago mixto** → **Cobrar**. Atajos: F2 buscar, F4 cobrar, Esc vaciar. Imprime ticket de 58 u 80 mm | Todos (cambiar un precio: solo el dueño y con motivo) |
| **Ventas** | Historial con número correlativo, búsqueda, ganancia, ticket para reimprimir y **anular venta** con motivo obligatorio (devuelve el stock y saca el ingreso de la caja) | Todos (el empleado solo ve las de hoy, sin ganancias) |
| **Stock** | Catálogo con categorías, marca, varios códigos de barras, venta por unidad o **suelto por kilo**, costo, margen, vencimiento, regalo/promoción, botón **Vender**, "llegó mercadería", **ingreso con escáner**, ajustes, historial, **abrir bolsa**, **actualizar precios por %** y **Para pedir** (pedido por proveedor para copiar o mandar por WhatsApp) | Todos (costos y cambios: solo el dueño) |
| **Servicios** | Precios de baño y peluquería (con duración) | Todos (editar: dueño) |
| **Agenda** | Turnos por mascota y **peluquero**, vista Día en grilla horaria, Semana y Mes. Avisa superposiciones, fuera de horario y fechas pasadas. Estados y botón **Cobrar** | Todos |
| **Clientes** | Contacto, mascotas (especie, raza, tamaño, notas de peluquería), compras, turnos y WhatsApp | Todos (borrar: dueño) |
| **Proveedores** | Contacto, productos que te vende y lo que le pagaste | Todos (editar: dueño) |
| **Caja** | Ingresos y egresos con forma de pago, efectivo que debería haber, **cierre de caja diario** y exportación a Excel (CSV) | Dueño |
| **Copias de seguridad** | Copia automática diaria, descarga comprimida a tu computadora y espacio usado de la base | Dueño |
| **Usuarios y actividad** | Dueño/administrador y empleados, y el **registro de actividad** (cambios de precio, anulaciones, stock, caja, usuarios) | Dueño |
| **Configuración** | Nombre, dirección y ticket; horario comercial; medios de pago; gastos fijos; umbrales; **informe semanal por email** | Dueño |

Se puede **instalar como app** en el celular o la computadora (en Chrome: menú ⋮ → «Instalar app» / «Agregar a pantalla principal»).

Vas a usar tres servicios gratuitos:

| Servicio | Para qué sirve |
|---|---|
| **Supabase** | Guarda todos los datos (la base de datos) |
| **GitHub** | Guarda estos archivos para que Render los pueda leer |
| **Render** | Hace funcionar el sistema en internet y le pone HTTPS solo |

Tiempo estimado: 30 a 45 minutos.

---

## Paso 1 · Crear la base de datos (Supabase)

1. Entrá a **supabase.com** y creá una cuenta.
2. Tocá **New project**. Poné el nombre `petshop`.
3. En **Database password** elegí una contraseña **solo con letras y números** (sin símbolos como @ # / %) y **guardala**.
4. En **Region** elegí la más cercana (por ejemplo *South America (São Paulo)*).
5. Esperá unos minutos a que termine de crearse.
6. Tocá el botón **Connect** (arriba, en la barra de tu proyecto) y elegí **Session pooler**. Copiá la dirección: empieza con `postgresql://postgres.` y contiene `pooler.supabase.com`.
   - Si no encontrás *Session pooler*: copiá la de **Transaction pooler** (termina en `:6543/postgres`) y cambiá `6543` por `5432`.
   - No uses la dirección que tiene `db.` seguido de tu código y `.supabase.co`: es la conexión directa y desde Render no funciona.
7. Reemplazá `[YOUR-PASSWORD]` por la contraseña del paso 3 (sin los corchetes).

Esa dirección es tu `DATABASE_URL`. **No hace falta crear tablas**: el sistema las crea solo la primera vez.

## Paso 2 · El código en GitHub

El código ya está en el repositorio `Sistema-PetShop`. Render lee la rama que elijas (`main`, una vez que pases estos cambios a esa rama).

## Paso 3 · Poner el sistema en internet (Render)

1. Entrá a **render.com** y creá una cuenta (podés entrar con tu cuenta de GitHub).
2. Tocá **New +** → **Web Service** y conectá el repositorio `Sistema-PetShop`.
3. Completá:
   - **Language / Runtime:** Node
   - **Root Directory:** dejalo vacío (el sistema está en la raíz del repositorio)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. En **Environment Variables** agregá:

| Nombre | Qué poner |
|---|---|
| `DATABASE_URL` | La dirección del Paso 1 (con tu contraseña) |
| `SESSION_SECRET` | Un texto largo al azar, de 40 caracteres o más |
| `ADMIN_EMAIL` | Tu email (va a ser tu usuario para ingresar) |
| `ADMIN_PASSWORD` | La contraseña con la que vas a ingresar (mínimo 8 caracteres) |
| `NODE_ENV` | `production` |
| `SHOP_NAME` | (opcional) El nombre de tu negocio. También se cambia después en **Configuración** |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` | (opcionales) Para el informe semanal por email: ver más abajo |

5. En **Advanced** poné **Health Check Path:** `/healthz`.
6. Tocá **Create Web Service** y esperá. Cuando diga *Live*, Render te muestra la dirección de tu sistema (algo como `https://petshop.onrender.com`).

> Atajo opcional: el proyecto trae un archivo `render.yaml`. Si en Render elegís **New +** → **Blueprint**, carga esta configuración sola y solo te pide `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `SHOP_NAME`.

## Paso 4 · Primer ingreso y carga inicial

1. Abrí la dirección de tu sistema e ingresá con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
2. Tocá **Cambiar contraseña** (abajo a la izquierda) y poné una que solo vos sepas.
3. **Proveedores:** cargá a quién le comprás.
4. **Stock → Nuevo producto:** cargá cada producto con su **precio de venta** y su **costo** (lo que te cuesta). Sin el costo, el sistema no puede calcular tu ganancia.
   - **Alimento suelto:** creá un producto "Se vende: suelto, por kilo" (por ejemplo *Alimento perro adulto – suelto*). En la bolsa cerrada, completá *Kilos que trae la bolsa* y elegí ese producto suelto: así, con **Abrir bolsa**, los kilos pasan solos al suelto.
5. **Servicios:** cargá los precios de baño y peluquería (tip: uno por tamaño de perro).
6. **Usuarios:** creá a tus empleados. Pueden vender, cobrar, manejar la agenda y los clientes, pero **no ven costos, ganancias, la caja ni los reportes**, y no pueden cambiar precios ni anular ventas.

> Después de que el sistema crea tu usuario, cambiar `ADMIN_PASSWORD` en Render ya no tiene efecto. Para cambiar la contraseña usá el botón dentro del sistema.

## El día a día

- **Vender:** pantalla *Vender* (o botón *Vender* en cada producto del Stock). Con un **lector de código de barras USB** solo pasás el producto: se suma solo a la venta. Con el celular usá **📷 Escanear con la cámara** (hace falta abrir el sistema con https, como en Render). Detalle y prueba paso a paso: [`docs/escaner.md`](docs/escaner.md).
- **Llegó mercadería:** en *Stock*, botón **+** del producto o **📷 Ingresar con escáner** (modo continuo). Suma el stock, actualiza el costo y, si querés, registra el gasto en caja.
- **Qué pedir:** *Stock → Para pedir* te arma el pedido por proveedor; **Copiar pedido** o **Enviar por WhatsApp**.
- **Peluquería:** agendá el turno en *Agenda* (con quién lo atiende); cuando está listo, tocá el turno → **Listo para retirar** → **Cobrar**.
- **Fin del día:** *Caja → Cierre de caja*: contás la plata, la escribís y el sistema te dice si hay diferencia.
- **Inflación:** *Stock → % Actualizar precios* sube los precios de una categoría, marca o proveedor de una vez, con redondeo.
- **Cambiar un precio en una venta:** solo el dueño, escribiendo el motivo. Queda en *Usuarios y actividad → Actividad*.

## Informe semanal por email (opcional)

Todos los lunes (o el día que elijas) te llega un resumen de la semana: vendido, ganancia, comparación, lo más vendido, poco stock, vencimientos, clientes que dejaron de venir y turnos «No vino».

1. Creá una cuenta gratuita en **Resend** (resend.com) o **Brevo** (brevo.com) y verificá tu email o dominio como remitente.
2. Copiá la **API key**.
3. En Render → tu servicio → **Environment**, agregá:
   - `EMAIL_PROVIDER` = `resend` o `brevo`
   - `EMAIL_API_KEY` = la API key
   - `EMAIL_FROM` = `Mi Pet Shop <avisos@tudominio.com>` (el remitente verificado)
4. En el sistema: **Configuración → Informe semanal**: activalo, elegí día, hora y destinatarios, y tocá **Enviarme el informe ahora** para probarlo. Abajo ves los envíos y, si falló alguno, el motivo.
5. **Importante (plan gratuito):** Render se duerme cuando nadie lo usa, y dormido no puede mandar el informe. Para que llegue igual, creá una tarea gratuita en **cron-job.org** que todos los días a la hora elegida haga un **POST** a `https://TU-SISTEMA.onrender.com/api/cron/weekly-report` con el encabezado `X-Cron-Secret` igual a la variable `CRON_SECRET` de Render (si usaste el Blueprint, Render la genera sola; si no, creala con un texto largo al azar). El sistema envía una sola vez por semana, aunque lo llamen todos los días.

Si no cargás estas variables, la función queda desactivada y el sistema funciona igual.

## Copias de seguridad (leer con atención)

La base de datos gratuita **no incluye copias de seguridad propias**. Por eso el sistema:

- Hace **una copia automática por día**, guardada dentro de la misma base (se conservan las últimas 7). Sirve si borrás algo sin querer.
- Permite **descargar una copia** (*Copias de seguridad → Descargar copia comprimida*, un archivo `.json.gz` liviano; también en JSON). Esto es lo que te protege de verdad si se perdiera la base.

**Hábito recomendado: descargá una copia por lo menos una vez por semana.** El sistema te avisa en la barra lateral y en el Resumen si pasaron más de 7 días.

### Prueba de restauración (una vez por mes, 10 minutos)

Una copia que nunca se probó no es una copia. Para comprobar que las tuyas sirven, sin tocar tus datos reales:

1. Descargá la copia comprimida del día.
2. Creá un **segundo proyecto gratuito en Supabase** (por ejemplo `petshop-prueba`) y un **segundo servicio en Render** apuntando a esa base (mismas variables, otro `DATABASE_URL`).
3. Entrá al sistema de prueba → *Copias de seguridad* → **Cargar desde archivo** → elegí la copia → confirmá.
4. Revisá que coincidan la cantidad de productos, el stock de 3 productos al azar, las ventas del último día y el total del mes en *Resumen*.
5. Listo: borrá el servicio y el proyecto de prueba.

## Cosas que tenés que saber del plan gratuito

- **Render (gratis):** si nadie usa el sistema durante 15 minutos, se "duerme". La próxima vez que alguien lo abra, tarda cerca de un minuto en despertar. Si te molesta en el mostrador, el plan pago más chico (Starter) lo deja siempre encendido.
- **Supabase (gratis):** el proyecto se pausa si pasa una semana sin usarse (usándolo todos los días no pasa). Si se pausa, los datos siguen ahí y lo reactivás desde el panel de Supabase.
- **Espacio:** 500 MB. El sistema guarda solo texto y números (sin fotos ni archivos), así que alcanza para años de ventas. En *Copias de seguridad* ves cuánto espacio usás.

## Seguridad

- Las contraseñas se guardan cifradas. Las sesiones duran 7 días, se cierran solas si cambiás la contraseña y viajan en una cookie `HttpOnly`, `Secure` y `SameSite=Strict` (protección contra CSRF, sumada al control de origen).
- Después de 5 intentos fallidos de ingreso, ese usuario se bloquea 15 minutos.
- Los permisos (dueño / empleado) se controlan **en el servidor**: aunque alguien llame a la API directamente, un empleado no puede ver costos, caja, copias ni usuarios, cambiar precios ni anular ventas. Todo cambio sensible queda en el registro de actividad.
- Toda la comunicación va por HTTPS. Las consultas a la base son parametrizadas (un texto como `O'Brien` o `select` se guarda tal cual, sin riesgo).
- Si algo falla del lado del servidor, la pantalla muestra «Algo salió mal (código ABC123)»: con ese código se encuentra el detalle en los Logs de Render.
- El ticket que imprime el sistema es un **comprobante interno, no una factura**: la facturación electrónica (ARCA/AFIP) se sigue haciendo por fuera.
- Guardás nombres y teléfonos de tus clientes: conviene tener en cuenta la ley argentina de protección de datos personales.

## Si algo no anda

- **Render dice "Deploy failed" o la página no abre:** Render → tu servicio → **Logs**. Lo más común: falta `DATABASE_URL` o `SESSION_SECRET` (o es muy corto), la contraseña de la base tiene símbolos, o se usó la conexión directa en vez del *Session pooler*.
- **«El email o la contraseña no son correctos» con tu usuario:** revisá `ADMIN_EMAIL` y `ADMIN_PASSWORD` en Render.
- **Te olvidaste la contraseña:** otro administrador puede cambiarla desde **Usuarios**.
- **«Algo salió mal (código …)»:** buscá ese código en los Logs de Render.

## Para quien lo mantenga (técnico)

- Node 18 o superior. Única dependencia: `pg`. Sin frameworks: servidor HTTP propio en `server/` (rutas en `server/routes/`, reglas de negocio puras en `server/logic.js`), página estática en `public/`. Ver `CONTEXTO-IA.md`.
- Las tablas están en `db/schema.sql` y se crean y actualizan solas al iniciar (migraciones idempotentes, sin borrar datos).
- **Tests:** `npm test` (usa `node:test`, incluido en Node; no instala nada). Prueban las reglas de negocio, la tabla de permisos por ruta, ventas y agenda contra la API real con una base simulada en memoria, y la coherencia entre la pantalla y el servidor.
- **Demo sin base de datos:** `npm run demo` levanta el sistema en `http://localhost:3999` con datos de prueba "QA" (`?rol=empleado` para ver la vista del empleado, `?rol=dueno` para volver). No guarda nada.
- Probarlo con una base real: copiar `.env.example` como `.env`, cargar las variables (con `DATABASE_SSL=false` si la base es local) y ejecutar `node --env-file=.env server/index.js` (Node 20.6 o superior).
- Íconos de la app: `npm run iconos` los regenera en `public/icons/`. El lector de códigos usa ZXing (licencia MIT), en `public/vendor/`.
