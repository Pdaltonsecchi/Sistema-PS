# Lector de códigos de barras: cómo probarlo

El sistema lee códigos de barras con **la cámara del celular o de la computadora** y con **lectores USB/Bluetooth** (los que "escriben" como un teclado). Sirve para **vender** y para **ingresar mercadería**. El código queda guardado en el producto; un mismo producto puede tener **varios códigos** (distintas presentaciones de fábrica).

## Qué hace cada botón

| Dónde | Botón | Qué hace |
|---|---|---|
| Vender | **📷 Escanear con la cámara** | Abre la cámara en una franja arriba de la venta. Cada código leído **suma 1 unidad** al carrito (si ya estaba, suma 1 y resalta la línea). Los productos por kilo piden los kilos. El precio siempre sale del sistema. |
| Vender | Buscador + lector USB | Pasás el producto por el lector y se agrega solo (el lector escribe el código y "aprieta Enter"). También funciona sin tocar el buscador. |
| Stock | **📷 Vender con escáner** | Lee un código y abre la venta rápida de ese producto. |
| Stock | **📷 Ingresar con escáner** | Modo continuo: escaneás, elegís la cantidad que entra (− / +) y tocás **Sumar al stock**; vuelve a la cámara para el siguiente. Abajo queda la lista de lo ingresado, con **Deshacer** por línea. El dueño además puede cargar costo, proveedor, vencimiento y el gasto en caja. |
| Producto | **📷 Escanear** (junto al código) | Carga el código en el producto. Si ya tiene uno, lo agrega en «Otros códigos». |

**Código que no existe en el sistema:** el dueño elige **Cargar producto nuevo** (se abre el formulario con el código ya puesto) o **Asociar a un producto existente**. El empleado ve un aviso para que lo cargue el dueño (decisión de permisos: el empleado puede vender e ingresar mercadería, pero crear productos con precio y costo, o reasignar códigos, es del dueño).

**Casos especiales:** producto sin stock → no se agrega y avisa · producto vencido → el empleado no puede venderlo; el dueño confirma · cantidad mayor al stock → se pone el máximo y avisa · código mal leído (dígito de control EAN/UPC que no coincide) → pide volver a escanear · el mismo código no se lee dos veces seguidas (1,5 s).

## Requisitos

- **HTTPS**: los navegadores solo dan acceso a la cámara en páginas seguras. Render ya da HTTPS. En la computadora, `http://localhost` también sirve.
- **Permiso de cámara**: la primera vez el navegador pregunta. Si se rechazó, el sistema lo explica y ofrece **escribir el código** o **leerlo de una foto**.
- Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 y QR. Usa el detector del navegador (Chrome en Android) y, si no existe, la librería ZXing (`public/vendor/`, licencia MIT), que se descarga solo al abrir el escáner.
- Botones del escáner: **🔦 Linterna** (si el teléfono la tiene), **🔄 Cambiar cámara** (si hay más de una), **🖼 Leer de una foto**, **🔔/🔕 sonido**. La cámara se apaga sola al cerrar el escáner, cambiar de pantalla o bloquear el teléfono.

## Prueba manual (15 minutos)

1. Abrí el sistema en el celular con la dirección https de Render e ingresá como dueño.
2. **Producto nuevo:** Stock → **📷 Ingresar con escáner** → escaneá un producto que no esté cargado → **Cargar producto nuevo** → completá nombre y precio → Guardar. Al volver a escanearlo, tiene que aparecer la tarjeta para sumar stock.
3. **Sumar stock:** escaneá un producto existente → cantidad 3 → **Sumar al stock**. Verificá en Stock que subió 3. Tocá **Deshacer** en la lista y verificá que bajó.
4. **Vender:** Vender → **📷 Escanear con la cámara** → escaneá dos veces el mismo producto → tiene que quedar 1 línea con cantidad 2 y el precio de lista → **Cobrar**.
5. **Permiso denegado:** en el navegador, bloqueá la cámara para el sitio y volvé a abrir el escáner: tiene que aparecer la explicación y la opción de escribir el código o usar una foto.
6. **Lector USB** (en la computadora): en Vender, sin hacer clic en ningún campo, pasá un producto por el lector: se tiene que agregar a la venta.
7. **Como empleado:** escaneá un código desconocido: tiene que aparecer el aviso «Pedile al dueño que lo cargue».

Navegadores a probar: **Chrome en Android** (detector nativo) y **Safari en iPhone** (usa ZXing). Anotá en este archivo el modelo y la versión con la que lo probaste.

## Códigos de prueba para imprimir

Podés generar EAN-13 de prueba en cualquier generador gratuito de códigos de barras (buscá "generador EAN-13") e imprimirlos. Usá números que empiecen con **200 a 299** (reservados para uso interno, no chocan con productos reales). Estos tienen el dígito de control correcto:

```
2000000000015   2000000000022   2000000000039   2000000000046   2000000000053
```

Para verificar el dígito de control de otro número, el sistema lo calcula solo: si al escanearlo dice «el dígito de control no coincide», el código impreso está mal.
