# Verificación en ejecución (paso 1.3) · 2026-11-01

Sesión 4, en la conversación principal (Opus 5.5) y de forma secuencial. Limitada a los flujos críticos, como pide la profundidad rápida.

## Entorno

- **Base aislada `stockly_auditoria`**, en el PostgreSQL 17.11 local.
  - Creada desde cero, con `prisma migrate deploy` (32 migraciones, ninguna a medias) y `db:seed` (52 productos, 5 usuarios, 6 órdenes, 2 almacenes y 4 clientes).
  - SMTP y Cloudinary con valores `.invalid`, los mismos de `jest.setup.js`: no sale nada.
  - La base de desarrollo `stockly` no se tocó. La URL se deriva sin mostrarla (`trabajo/ejecucion/env-auditoria.sh`), y el script aborta si no apunta a `stockly_auditoria`.
- **Backend:** el build de producción de la línea base (`dist/`, commit `8fccbd4`), con `NODE_ENV=production`, `COOKIE_SECURE=false` y `COOKIE_SAMESITE=lax`, como el compose.
  - A, en el 3000, con los techos del E2E.
  - B, en el 3001, con los límites por defecto.
- **Frontend:** el `dist/` de la línea base (commit `424e397`), servido con `vite preview` en el 4173.
- **Navegador:** Chromium de Playwright 1.61.1, el que ya trae `Stockly-F` (headless, `es-ES`, 1280×800).
  - `chrome-devtools-auditoria` no cargó, porque la sesión se abrió desde VS Code.
  - El servidor del plugin `chrome-devtools-mcp` no cumple lo acordado (`@latest`, sin `--isolated`, `--no-usage-statistics` ni `--no-performance-crux`). No se usó.
  - Sin la skill `a11y-debugging`, que depende de ese servidor: se siguió su lista a mano.
- **Scripts:** en `trabajo/ejecucion/`. **Evidencias:** `evidencias/ejecucion-*`.

## Resultados

### P-07-01 · reproducido (tres de los cuatro casos)

Producto activo con lotes en el almacén predeterminado y órdenes de 2 unidades. El bloqueo de la fila del producto se retiene desde otra conexión hasta que las dos peticiones esperan, la técnica de `recepcion-parcial.test.ts:300` (`evidencias/ejecucion-api.json`, `p0701`).

| Caso | Respuestas | Stock total | Efecto |
|---|---|---|---|
| 1 · dos `POST /:id/ship` de la misma `PENDING` | 200 y 200 | 92 → 88 | Descuenta 4 por una orden de 2. Dos movimientos `OUT` y dos filas en `sale_order_item_lots` (4 unidades). La orden queda `SHIPPED` |
| 2 · dos `PATCH CANCELLED` de una `SHIPPED` | 200 y 200 | 86 → 90 | Devuelve 4 por una orden de 2. Dos movimientos `IN`. El stock queda inflado en 2 |
| 4 · `PATCH PENDING` sobre una `SHIPPED` y otro envío | 200, 200 y 200 | 90 → 88 → 88 → 86 | `PENDING` se acepta sin devolver nada, y el segundo envío descuenta otra vez. Dos filas de lote |

El caso 3 (envío contra cancelación) y el `delete` no se probaron: los otros tres bastan para la causa común.

### P-02-01 · reproducido

- **Registro con una cuenta nueva:**
  - `POST /auth/register` responde **500** (`INTERNAL_ERROR`), porque el correo no sale, pero la fila queda creada: `role USER`, `isVerified false`. Ver la observación de abajo.
  - Sin verificar, el login da 403 `EMAIL_NOT_CONFIRMED`.
  - Tras marcar `isVerified` en la base, que simula el clic en el enlace del correo, el login da 200, y `GET /customers`, `GET /sale-orders` y `GET /settings/business` dan 200.
- **Con la cuenta `USER` del seed, del mismo rol:**
  - `GET /customers` devuelve los 4 clientes con `document`, `email`, `name`, `phone` y `notes`.
  - `GET /sale-orders` devuelve las 9 ventas con `customerDocument`, `customerEmail`, `customerPhone` y `createdByEmail`.
  - `GET /sale-orders/:id/receipt` devuelve el PDF (200).

### P-02-03 · reproducido

Contra el backend B:
- 11 `POST /auth/login` fallidos, cada uno con un `X-Forwarded-For` distinto (`203.0.113.1` a `.11`): diez 401 y **429** en el 11.º.
- Después, un login **válido** con `X-Forwarded-For: 198.51.100.7`: **429** `RATE_LIMITED`, `Retry-After: 900`.

La clave ignora la cabecera. Detrás de nginx, todos los clientes comparten un contador. La prueba también muestra que el limitador funciona cuando está montado, lo que deja P-08-02 como brecha de pruebas, no como fallo.

### P-02-101 · no reproducido

Dos variantes contra el backend B: bytes sueltos tras un marco gzip válido, y un segundo miembro gzip truncado. Las dos responden 400, y el proceso sigue respondiendo a `/health` 1,5 s después. Queda confirmado por lectura (aviso, versión instalada y código), sin la caída reproducida.

### Cabeceras, cookies y CORS de la API · sin hallazgo

- **helmet:** CSP, HSTS (`max-age=31536000; includeSubDomains`), `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy: no-referrer`, y COOP y CORP `same-origin`. Sin `X-Powered-By`.
- **Cookies del login:**
  - `token`: `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - `refreshToken`: `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth/refresh`.
  - `csrfToken`: legible por JS, por diseño (double-submit).
  - Ninguna lleva `Secure`, por el `COOKIE_SECURE=false` del compose: es P-12-01, rebajado a Medio.
- **CORS:** el origen es fijo. Con un `Origin` ajeno, `Access-Control-Allow-Origin` sigue siendo `http://localhost:4173` y no refleja el ajeno. El preflight ajeno responde 204 con ese mismo origen fijo, así que el navegador lo bloquea.
- Las cabeceras de la SPA en nginx no se vieron (no se levantó la pila Docker).

### Esquema real (área 7) · conforme

Evidencia en `evidencias/ejecucion-esquema.txt`:
- `products_stock_cuadra` y `stock_levels_cuadra`, diferibles e inicialmente diferidos.
- Índice `stock_levels_productId_warehouseId_lotId_key` con `NULLS NOT DISTINCT`.
- `counters`: `saleOrder = 6`.
- Ningún `CHECK`.
- `UPDATE products SET stock = stock + 1` falla en el `COMMIT` con «El stock del producto … no es la suma de sus almacenes».

No comprobados:
- qué recibe el cliente de la API si eso ocurre;
- `prisma migrate diff` contra el esquema (el script de diff no está versionado).

### Accesibilidad del Mostrador (área 5)

Como vendedor y solo con teclado (`evidencias/ejecucion-a11y.json`, `ejecucion-a11y-mostrador.yaml` y las dos capturas).

**La venta completa se puede hacer con teclado:**
- el combobox expone `aria-expanded`, `aria-controls` y `aria-activedescendant`;
- flecha e Intro eligen el producto, y el foco se queda en el combobox para la siguiente búsqueda;
- el orden de tabulación es lógico: Escanear, Quitar, Cantidad, Una unidad más, Cliente existente y Registrar venta;
- `lang="es"`, y el enlace de salto es la primera parada.

**Observaciones del área 5, contrastadas:**
- **Confirmado:** tras «Registrar venta» con Intro, el foco cae en `body`. Volver a «Nueva venta» cuesta 20 Tab.
- **Confirmado:** el aviso `role="status"` no existía antes (0 elementos) y se inserta ya con su contenido («Venta #000010 registrada …»).
- **Confirmado:** al añadir una línea no hay mensaje propio; solo se relee el total, en una región `aria-live` («Total $185.00»).
- **Refutado:** «Nueva venta» deja el foco en «Escanear», no en `body`.
- **Sin problema:** el modal del escáner. Foco inicial en «Cerrar», un ciclo de tres paradas (Cerrar, «Hacer o elegir una foto» y «O escríbelo») sin el `input` de archivo oculto, y Escape cierra y devuelve el foco a «Escanear».

**No comprobado:** la hipótesis de `TransfersPage.tsx:251` (el seed no trae transferencias) → apartado 7.

### P-05-01 (nuevo, encontrado en ejecución) · el foco de teclado de la navegación, la cabecera y los menús no se ve

**Área:** Accesibilidad · **Severidad propuesta:** Alto · **Confianza:** Alta · **Verificación:** ejecución · **Esfuerzo:** Bajo

**Ubicación:**
- `Stockly-F/src/App.tsx:236`, los enlaces de la barra lateral: `focus-visible:border-border focus-visible:outline-none`;
- `Stockly-F/src/App.tsx:178`;
- `Stockly-F/src/shared/lib/clasesDeItemDeMenu.ts:21`: `… focus-visible:bg-surface-muted focus-visible:outline-none`;
- `Stockly-F/src/modules/notifications/components/CampanaDeAvisos.tsx:155`;
- `Stockly-F/src/shared/components/DropdownButton.tsx:70`;
- tokens en `Stockly-F/src/index.css:89-91`. `--color-border` es `#e6e8ea` en claro y `#2f3a4d` en oscuro, y su comentario dice «1.23:1 claro · 1.47:1 oscuro». `--color-surface-muted` es `#f2f3f4` sobre `#ffffff`.

**Problema:**
- Con Tab, los 17 enlaces de la barra lateral y los dos botones de la cabecera dan `outline-style: none` y `box-shadow: none`.
- El único cambio es un borde de 1 px en un color de 1,23:1, y en los menús, además, un fondo casi blanco.
- En la captura (`evidencias/ejecucion-a11y-foco-navegacion.png`), «Productos» tiene el foco y no se distingue de «Categorías» ni de «Marcas». Solo destaca «Mostrador», que es la ruta activa.
- Los controles del contenido (`Button`, `Input`, `Select`, el combobox) sí llevan anillo `accent` (`index.css:103`).
- `itemDeMenu.test.tsx:28-40` comprueba que esa clase está («el recuadro es para quien llega con el teclado») y que «el aspecto se verificó en el navegador». No hay decisión que acepte el contraste.

**Impacto:**
- Incumple WCAG 2.2 AA: 2.4.7 Foco visible (técnica de fallo F78) y 1.4.11 Contraste no textual (el indicador necesita 3:1).
- Quien usa teclado y ve la pantalla no sabe qué enlace o qué opción de menú va a activar, en el chrome de todas las pantallas.

**Verificación independiente (encargo 3): rebajado a Medio, con confianza Alta.** La rúbrica pone en Medio un «incumplimiento WCAG AA que no bloquea la tarea», y la tarea se completa: el orden de tabulación es correcto, hay enlace de salto (`App.tsx:361`) y el foco pasa a `#contenido` al cambiar de ruta (T2-18). En rápida pasa a observación sin ID, con su corrección:
- una regla global `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`;
- quitar `focus-visible:outline-none` de los cinco sitios, o usar el anillo de `SettingsPage.tsx:107`;
- que `itemDeMenu.test.tsx` exija el anillo, para no fijar el patrón actual.

### Observación nueva, debajo del umbral (área 7, Medio, sin ID)

El registro responde 500 si el correo falla, pero deja la cuenta creada:
- `auth.service.ts:30` crea la cuenta y `:42` espera `sendVerificationEmail` sin `catch`;
- un reintento recibe 409 `EMAIL_ALREADY_REGISTERED`, y queda el «reenviar verificación»;
- la invitación sí retira la cuenta si el correo falla (`users.service.ts:96-97`).

### E2E

En curso cuando se escribió esto. El resultado va abajo.

## No comprobado en ejecución (→ *Zonas no cubiertas*, salvo lo que va al apartado 7)

| Entrada | Área | Motivo |
|---|---|---|
| Traza de rendimiento (LCP, CLS, TBT) y pestaña de red de la ruta inicial | 3 | `chrome-devtools-auditoria` no cargó y queda fuera de los flujos críticos |
| `bulk-stock` con unas 1.000 líneas y una orden con cientos de líneas | 3 | Fuera de los flujos críticos; son observaciones Medio |
| `docker compose … config` y `build`, `id` y `docker history` | 12 | Fuera de los flujos críticos; P-12-01 ya es Medio |
| Cierre de un conteo de más de 60 s a través de nginx | 7 y 12 | Exige levantar la pila Docker |
| SMTP y Cloudinary lentos o caídos | 7 | Solo se vio el SMTP inexistente en el registro (observación de arriba) |
| T5-14 y T5-15 sobre datos con historia | 7 | Coste: exige una copia con historia |
| Despachar una `PENDING` con un producto desactivado, y el panel con un almacén desactivado | 1 | Fuera de los flujos críticos → apartado 7 |
| `aria-label` de las transferencias | 5 | El seed no trae transferencias → apartado 7 |
| Contraste real en claro y oscuro, `lang` tras cambiar de idioma, `prefers-reduced-motion`, Caducidades y combobox de cliente | 5 | Fuera de los flujos críticos |
| Pruebas de carga y de concurrencia mixta | 3 y 7 | Fuera de lo acordado (k6 no instalado) |
