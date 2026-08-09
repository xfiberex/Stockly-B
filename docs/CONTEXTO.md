# Contexto de trabajo — sesión del 2026-08-07

Arranque en frío para continuar en otro equipo. El detalle de cada tarea está en
[ROADMAP.md](ROADMAP.md); esto es lo que ese documento no cuenta.

---

## 1. Arrancar en la máquina nueva

```bash
git pull                                  # en Stockly-B y en Stockly-F
cd Stockly-B && cp .env.example .env      # bastan 4 variables (ver abajo)
cd ../Stockly-F && cp .env.example .env   # solo VITE_API_URL
```

Los `.env` **no están en git** y no deben estarlo: sus valores (JWT_SECRET, Cloudinary,
SMTP) se pasan a mano. Desde **T1-26** solo son imprescindibles cuatro: `DATABASE_URL`,
`JWT_SECRET`, `JWT_EXPIRES_IN` y `FRONTEND_URL`. Sin las de Cloudinary o SMTP el servidor
arranca igual y solo esa función responde **503** con un mensaje que dice qué falta.

**Base de datos.** Sirve cualquier PostgreSQL con la base creada; solo tiene que
coincidir `DATABASE_URL`. **El proyecto se trabaja desde dos equipos y el puerto no es el
mismo en los dos** —anda entre **5432** y **5433**—; como el `.env` no viaja en git, cada
máquina tiene el suyo. Si `verify` falla al conectar, eso es lo primero que hay que mirar,
y el valor bueno es el que diga el `.env` local, no el que ponga aquí ningún documento.
Con Docker: `docker compose up db -d` **desde `Stockly-B/`**, que es donde vive ahora el
`docker-compose.yml`.

**Dependencias.** Si `node_modules` viene de otro equipo, pnpm quiere purgarlo y aborta
sin TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Con `CI=true` en el entorno,
`pnpm install --frozen-lockfile` lo recrea sin preguntar.

Tras el seed, el admin es `admin@stockly.app` / `Admin1234!`.

---

## 2. Tres decisiones que gobiernan el trabajo

**Sin CI.** No hay GitHub Actions ni pipeline de ningún proveedor, y no deben proponerse.
Se eliminaron deliberadamente el 2026-08-06. La puerta de calidad es `pnpm verify` en
local, en cada repositorio, antes de dar por cerrada una tarea.

**Los docs viven en `Stockly-B/docs/`** aunque cubran los dos repositorios: la carpeta que
los contiene no está bajo control de versiones, así que alojarlos en el backend es lo que
hace que viajen entre equipos. Las rutas `Stockly-F/src/...` que aparecen en ellos se
refieren al repositorio hermano.

**Toda tarea cerrada se anota en el ROADMAP**: casilla marcada, fila en Progreso, métricas
al día, y una línea de «Verificado localmente» con cifras reales. Si algo del criterio de
aceptación no se pudo comprobar, se dice explícitamente en lugar de darlo por bueno.

---

## 3. Estado a fecha de hoy

| | Backend | Frontend |
|---|---|---|
| `pnpm verify` | ✅ exit 0 | ✅ exit 0 |
| Tests | **298/298** | **386/386** |
| Cobertura (sentencias) | 89.04 % *(suelo 85 %)* | 44.76 % *(suelo 42 %)* |
| Lint | — | **0 errores, 0 avisos** |

**E2E:** `pnpm test:e2e:full` desde `Stockly-F`, sin levantar nada a mano —arranca solo la base
de datos, el backend y el frontend—. En este equipo (2026-08-08): **9 pasados,
1 omitido, 0 fallos**, en verde en `chromium` **y** en `Mobile Chrome` desde T2-45.

**Tier 0: 8/8** ✅ · **Tier 1: 26/26** ✅ · **Tier 2: 35/48** · Total **70/107**.

*El denominador subió de 104 a 107 el 2026-08-09 con `T2-46`–`T2-48`, tres hallazgos de un repaso de la aplicación en marcha, anotados ya cerrados: **no descontaron ni una tarea de la lista de trabajo**, porque ninguno estaba en ella. Las pendientes del Tier 2 son **13**, y las 13 tienen ya todas sus dependencias satisfechas.*

**Los dos primeros tiers están cerrados.** La aplicación pasó de tener el guardado de
configuración roto, las etiquetas de producto inertes, una ventana de 15 minutos de acceso
para cuentas desactivadas, cinco listados que reventaban con un `page` no numérico, ningún
índice en la base, `logout` expuesto a CSRF y el correo saliendo en claro, a tener todo eso
corregido, medido y con tests.

**La única salvedad es T1-21** (contenedor sin privilegios): el `Dockerfile` ya lleva
`USER node`, pero **el daemon de Docker no arranca en este equipo**, así que
`docker exec … id` → `uid=1000(node)` sigue sin comprobarse. Es lo primero que hay que
ejecutar en una máquina con Docker.

---

## 4. Trampas del entorno, ya pagadas

Cada una costó un fallo antes de entenderse. No hace falta redescubrirlas.

**El formato multipart no se puede probar por HTTP en la suite del backend.**
`upload.middleware` está mockeado en `products.test.ts`, así que multer —que es quien
parsea ese cuerpo— nunca corre y un `.field()` acaba en 422 con `req.body` sin parsear. La
normalización de `tagIds` se valida contra el esquema directamente.

**`process.exit()` en Windows aborta libuv** si hay un proceso hijo aún cerrándose
(`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) y devuelve un código de salida
sin sentido *aunque la comprobación haya pasado*. Por eso `scripts/smoke.js` espera el
evento `exit` del hijo y usa `process.exitCode`. Usa `SMOKE_PORT` (3100) para no chocar
con el `dev`.

**jsdom no aplica las clases de Tailwind**, así que la navegación de escritorio y la móvil
están ambas en el DOM y los enlaces salen duplicados. Hay que acotar con `within` al
contenedor (`#mobile-menu`).

**Los listados paginados responden `res.body.data.data`**, con la lista dentro de `data`
junto a `meta`.

**Zod 4:** `z.ZodRawShape` es de solo lectura y `Object.fromEntries` infiere un tipo
demasiado estrecho para castear. Para construir un esquema dinámico, `Record<string,
z.ZodTypeAny>` y un bucle.

**No borrar productos en los tests del backend**: los de otros bloques tienen movimientos
de stock asociados y la FK lo impide. Basta con limpiar lo propio.

**La base de tests `Stockly_test` no tiene tabla `_prisma_migrations`.** `migrate deploy`
contra ella falla con **P3005** («the database schema is not empty»). Se sincroniza con
`prisma db push` apuntando `DATABASE_URL` a `Stockly_test` — y hay que hacerlo cada vez que
se añade una migración, porque `pnpm verify` solo migra la base de desarrollo.

**CSRF** (double-submit): para un PATCH/POST manual contra el servidor hay que leer la
cookie `csrfToken` y reenviarla en la cabecera `x-csrf-token`. En `NODE_ENV=test` se
omite. Desde **T1-19** solo quedan exentas siete rutas públicas de `/auth`: `logout`,
`PUT /me` y `PATCH /me/password` **exigen token**.

**El rate limit se agota con el E2E.** Cien peticiones por IP cada 15 minutos es poco para
una pasada de navegador: el 429 hace fallar pruebas que no van de eso, e incluso la
comprobación de salud del `webServer`. `RATE_LIMIT_MAX` y `AUTH_RATE_LIMIT_MAX` suben el
techo (ya vienen puestas en `playwright.config.ts`); el limitador y CSRF siguen activos.
**Y ojo con los servidores huérfanos:** `reuseExistingServer` reaprovecha lo que haya en el
puerto, así que un backend que quedó vivo de una pasada anterior llega con su cupo gastado y
responde **429 hasta en `/health`** — Playwright se queda esperando y muere con «Timed out
waiting 120000ms from config.webServer». Se mata el proceso del 3000 y del 5173 y se repite.

**Un *transport* de pino cuesta caro con el E2E delante.** `pino-pretty` no formatea en
proceso: levanta un hilo de trabajo y le pasa cada línea por un canal. Con cuatro
navegadores, Vite compilando y el servidor en `tsx`, eso subió la pasada de **36 s a 66 s**
y puso a dos pruebas a agotar su tiempo, de forma reproducible. Por eso `logger.ts`
condiciona el formato legible a `process.stdout.isTTY`: si nadie está mirando la terminal,
JSON directo y sin hilo. Vale la regla general: **antes de acusar al código de una tarea,
comparar contra el estado anterior con `git stash` en la misma máquina** — aquí evitó dos
diagnósticos equivocados, y también demostró que un `pnpm dev` olvidado ocupando un puerto
falsea toda la medición.

**Tras un clic de navegación, la página no ha cambiado todavía.** React Router navega dentro
de un `startTransition`: la URL se actualiza antes de que React confirme el render nuevo, y con
las rutas en `lazy()` esa confirmación espera al *chunk*. Medir el `document.title`, el foco o
una región viva justo después del clic —o justo después de un `waitForURL`— da el estado
**anterior**, y parece un fallo del código. Hay que esperar a que la página esté pintada
(`getByRole("heading", …)`). Pasó al verificar T2-18 y costó una medición en falso.

**Un `Proxy` como mock de módulo cuelga la suite.** Al mockear Recharts con un `Proxy` que
devuelve un componente para cualquier propiedad, también responde a `then`: el módulo pasa a
ser «thenable», el `import()` que lo espera **no resuelve nunca** y vitest se queda parado sin
dar un solo error. Y aunque se excluya `then`, vitest comprueba que el mock exporte lo que el
módulo real exporta, y un `Proxy` no pasa esa comprobación. Hay que enumerar los componentes.

**La cobertura tiene suelo desde T2-22** (`jest.config.js` y `vite.config.ts`): backend
85/72/87/87 y frontend 42/50/33/43, unos puntos por debajo de lo real. Sin CI, ese umbral es
lo único que impide que la cobertura se erosione. **Al subirla, hay que subir el umbral**, o
deja de significar nada.

**React Router no restablece el desplazamiento al cambiar de ruta.** Se conserva el del
documento anterior y se aterriza a media página, con el `<h1>` por encima del borde superior:
había que subir a mano para ver en qué sección se estaba. Lo enmascaraba a medias el `focus()`
de T2-18 —al enfocar un elemento más alto que la ventana, el navegador desplaza *lo mínimo*, y
desde abajo eso alinea el **final** de `<main>` con el borde inferior, nunca su principio—, así
que parecía un desplazamiento caprichoso en vez de uno ausente. Medido: desde 800 px en
Reportes, ir a Dashboard dejaba la página en 202 px y el título en −113. Ahora `AnuncioDeRuta`
manda `window.scrollTo(0, 0)` y enfoca con `preventScroll`, para que no haya dos mecanismos
decidiendo dónde queda la página. **En `POP` no se toca**: atrás y adelante restauran la
posición guardada, y forzar el principio borraría justo lo que se espera recuperar.

**Los archivos del frontend tienen finales de línea CRLF.** Un reemplazo de varias líneas
escrito con `\n` no encuentra nada y **falla en silencio**: el script dice que terminó, el
archivo sigue igual. Para cambios multilínea hay que usar las herramientas de edición, no
`String.replace` desde consola. Es hermana de la trampa de PowerShell, y se nota tarde.

**PowerShell 5.1 destroza el UTF-8.** `Get-Content -Raw | ... | Set-Content` lee con la
página de códigos ANSI y reescribe en UTF-8, dejando doble codificación (`—` → `â€"`), y
la conversión inversa no siempre es reversible. Para editar archivos hay que usar las
herramientas de edición, no reemplazos por consola. Ha pasado dos veces: con el README
(restaurado desde git) y con `index.css` (reescrito a mano, porque sus cambios aún no
estaban commiteados y `git checkout` los habría perdido).

---

## 5. Tres cosas que dependen de ti, no del código

**Rotar la contraseña `Ad159753`.** Apareció en un conflicto de merge sin resolver que
estaba commiteado y pusheado en `Stockly-F/main` desde el 2026-08-05 (merge `4254582`),
dentro de `e2e/smoke.spec.ts`. El conflicto ya está resuelto a favor de la credencial del
seed, pero **la contraseña estuvo en el repositorio y sigue en el historial de ese merge**.
T0-06 había purgado esa misma credencial reescribiendo el historial; el merge la devolvió.

**En un despliegue nuevo nadie es administrador hasta ejecutar `pnpm db:seed`.** Desde
T1-22 el registro público crea siempre usuarios `USER`. Para promover a alguien:
`PATCH /api/v1/users/:id/role` desde una cuenta que ya sea ADMIN.

**Comprobar T1-21 en una máquina con Docker.** El `Dockerfile` ya corre como `node`, pero
falta ejecutar `docker compose up --build` y `docker exec stockly_backend id` para
confirmar `uid=1000(node)` y que `prisma migrate deploy` siga teniendo los permisos que
necesita al arrancar el contenedor.

---

## 6. Por dónde seguir

En marcha el **Tier 2**. Cerrado ya el bloque de arrastres del Tier 1: **T2-03 + T2-04**
(órdenes de compra paginadas; ya no queda ninguna lista de la API sin techo), **T2-29**
(esquema de Swagger, que ahora está atado al validador por un test) y **T2-17**
(conmutadores de etiqueta accesibles).

**El sistema de diseño ya está en su sitio** (T2-35, T2-36 y T2-37): la capa semántica
existe, los primitivos la consumen y **no queda ninguna utilidad de color cruda** en la
interfaz — eran 561. Cambiar la paleta es ahora editar `index.css`.

Los tests que lo sostienen no conviene desactivarlos: `theme.test.ts` recalcula los
contrastes desde el CSS, `tokens.test.ts` recorre todos los archivos buscando utilidades
crudas, los de `Button`/`Badge` comprueban que ninguna variante emita una, y
`estados.test.tsx` exige que dos estados del mismo conjunto no dibujen el mismo icono.
La regla al escribir interfaz es nombrar el papel, no el valor: `bg-surface`, no `bg-white`.

**Con T2-38, el estado ya no se comunica solo por color.** Etiqueta, color e icono de cada
estado salen de un descriptor único en `Stockly-F/src/shared/lib/estados.ts`, y `EstadoBadge`
lo pinta entero: no hay forma de poner uno sin los otros. Al añadir un estado nuevo hay que
elegir icono ahí mismo, y el test lo comprueba comparando la **geometría del trazo** del SVG,
no el nombre del componente importado. La tarea destapó que «bajo» y «agotado» eran el mismo
triángulo ámbar, indistinguibles incluso con color.

**Las tablas ya piden cifras tabulares desde `index.css`** (T2-39), no celda a celda: una
tabla de inventario existe para comparar cifras en vertical, así que la próxima que se
escriba nace alineada. Fuera de tablas la utilidad `tabular-nums` va explícita. Aviso para
quien mida esto en el navegador: **Tailwind solo genera las utilidades que aparecen escritas
en el código**, así que una contraprueba con `proportional-nums` no mide nada si esa clase no
está en ningún archivo; hay que tocar `style.fontVariantNumeric`.

**Dos densidades, un solo componente** (T2-40): `min-h-11` (44 px, mínimo táctil) hasta `md`
y `md:min-h-9` (36 px) a partir de ahí. Al añadir un control nuevo hay que llevar el par
entero; `densidad.test.tsx` falla si falta una de las dos clases. Lo que no puede crecer sin
dejar de parecer lo que es —la casilla de 16 px, el interruptor de 24— recibe el toque en su
envoltorio, no en el dibujo.

**Salvedad de T2-40 que conviene no dar por hecha:** la fila de la tabla de productos se
quedó en **48 px**, no en los 36 del perfil denso. No es un descuido: relleno 6+6, nombre 20
y SKU 16 ya suman 48, y la celda de la miniatura, 44. Bajar a 36 exige quitar el SKU de la
tabla o encoger la miniatura a 24 px, y eso es una decisión de producto.

**La escala tipográfica está cerrada, no solo documentada** (T2-41). `index.css` borra los
espacios de nombres de Tailwind (`--text-*: initial`, `--font-weight-*: initial`) y declara
cinco tamaños y cuatro pesos: **un `text-3xl` escrito por inercia no pinta nada**. Si algo se
ve con el tamaño equivocado, es la primera sospecha; `tipografia.test.ts` lo señala por
archivo. De Inter se cargan solo los subconjuntos latinos: los `@fontsource/inter/400.css`
traen siete `@font-face` por peso (cirílico, griego, vietnamita…) y los `latin-*.css`, uno.

**El bloque de diseño está terminado** (T2-35 a T2-41): color, estados, cifras, densidad y
tipografía. Los cinco tests que lo sostienen —`theme`, `tokens`, `estados`, `densidad`,
`tipografia`, más los de `Button`/`Badge`— no son decorativos: cada uno cerró un agujero que
ya se había colado una vez. `textoLegibleSobre()` de `shared/lib/color.ts` sigue disponible
por si hace falta.

**Ya hay observabilidad** (T2-10): `pino` + `pino-http` con `requestId` por petición,
devuelto en `x-request-id` y presente en cada línea; en producción, JSON. Al depurar un
fallo, pedir ese identificador es lo primero. Las cabeceras van redactadas (`cookie`,
`authorization`): sin eso, pino-http registra la sesión completa en cada llamada.

Con el log en su sitio, **las alertas de bajo stock ya no bloquean la respuesta** (T2-07).
Se disparan sin esperar y sus fallos se registran; `esperarAlertasEnVuelo()` existe para que
los tests puedan esperarlas de verdad. Si añades otro aviso por correo, sigue ese patrón.

**El enlace de saltar al contenido** (T2-11) es ahora el primer elemento enfocable, y
`<main id="contenido" tabIndex={-1}>` es su destino. Ese `tabIndex` no se puede quitar: sin
él el foco no viaja y el enlace pasa a ser decoración. **T2-18 usa ese mismo destino**: en
cada cambio de ruta, `AnuncioDeRuta` mueve allí el foco y cambia el texto de una región
`aria-live`, así que el Tab siguiente ya cae dentro del contenido y no al principio del menú.

**El bloque de accesibilidad del Tier 2 está cerrado** (T2-11 a T2-18): salto al contenido,
foco y anuncio al navegar, ARIA y Escape en los desplegables, nombres en los selectores de
color y en las casillas de fila, fin del `<button>` dentro de `<a>` y respeto por
`prefers-reduced-motion`.

**Los ítems de menú son cajas delimitadas** (2026-08-09, a petición de diseño). Menú de
usuario, Catálogo/Órdenes/Admin, Exportar y el menú móvil salen todos de
`clasesDeItemDeMenu()` en `Stockly-F/src/shared/lib/`: borde **transparente en reposo** —para
que el texto no baile un píxel al señalar— que se pinta en `hover` y en `focus-visible`. La
opción activa y la acción destructiva se delimitan en su propio color (azul de sección, rojo
de peligro). Al añadir un desplegable nuevo, usar ese helper y `CLASES_PANEL_DE_MENU`, que da
al panel relleno por los cuatro lados: con los ítems delimitados, un borde pegado al borde del
panel se lee como un fallo de dibujo, y **los ítems se separan entre sí** (`gap-1`): pegados,
dos recuadros contiguos comparten línea y parecen solaparse — no se notaba mientras no tenían
borde. **Los disparadores siguen la misma regla** y además
conservan el borde **mientras el menú está abierto**, para leerse como una pieza con el panel.
El menú de usuario lleva cabecera con nombre y correo: en el disparador el nombre se recorta a
144 px y en pantallas pequeñas ni aparece, así que es el único sitio donde la cuenta se lee
entera.

**Medir un color justo después de un clic o un `hover` da el color de antes.** Los controles
llevan `transition-colors`, que dura 150–200 ms: `getComputedStyle` leído inmediatamente
devuelve el fotograma inicial —`rgba(0,0,0,0)` en un fondo que va a ser azul— y parece que la
clase no se aplica. Con `waitForTimeout(400)` sale el valor real. Costó media hora y dos
hipótesis falsas al ajustar los menús: llegué a creer que Tailwind no generaba las utilidades.
**Regla:** para un estado con transición, o se espera a que termine, o se mira una captura.

**Y al medir, hacerlo sobre el elemento que se tocó.** Un `document.querySelectorAll(...).find(...)`
dentro de `page.evaluate` puede caer en otro nodo con el mismo texto —la interfaz duplica la
navegación en escritorio y móvil—. `locator.evaluate()` mide justo el que Playwright pulsó.

**Los dos proyectos del E2E corren en paralelo contra la misma base**, así que un test que
pulse «el primero de la lista» puede operar sobre lo que acaba de crear el otro proyecto.
Pasó con el escenario de la venta cancelada: `chromium` enviaba la orden de `Mobile Chrome` y
el stock nunca bajaba. La cura no fue serializar, sino **nombrar**: las acciones de fila de las
órdenes de venta llevan el número de la orden en su `aria-label`, y el test localiza la suya.
Vale como regla: si un test necesita `.first()`, casi siempre falta un nombre accesible.
Y si una pasada se interrumpe, deja órdenes y productos `E2E-*` a medias en la base de
desarrollo, que ensucian la siguiente.

**Un desplegable de navegación no es un `menu`.** La ficha de T2-16 pedía `role="menu"` y
`role="menuitem"` en `NavDropdown`, y **no se aplicó a propósito**: ese rol es para comandos
de aplicación; con él, los enlaces de Catálogo/Órdenes/Admin dejan de anunciarse como enlaces
y desaparecen de la lista de enlaces del lector de pantalla. Se quedó en *disclosure*
(`aria-haspopup` + `aria-expanded` + `aria-controls` + Escape). `UserMenu` sí conserva
`role="menu"`, que ya tenía: ahí dentro hay un comando de verdad («Cerrar sesión»).
**Lo destapó el E2E**, que dejó de encontrar «Productos» por rol de enlace: un fallo de una
prueba ajena señalando un problema real, no un selector viejo.

**Al añadir una ruta hay que darle título** en `Stockly-F/src/shared/lib/titulos.ts`, o
`titulos.test.ts` falla — a propósito: sin entrada, al llegar a esa sección se anunciaría
«Página no encontrada», que es peor que el silencio. No se leen del `<h1>` porque, con las
rutas en `lazy()`, al cambiar de ruta todavía no hay `<h1>` que leer. Ese archivo es también
el que pone el `document.title` de cada pestaña.

**Pendiente relacionado:** las paletas de los gráficos de Recharts siguen como hex dentro
de los componentes. No son utilidades —`fill`/`stroke` son props—, así que ningún test las
detecta; llevarlas a los tokens exige leer las variables CSS desde JS.

Como relleno entre tareas grandes, las de esfuerzo bajo y sin dependencias: T2-01, T2-32,
T2-33, T2-27, T2-06, T2-34, T2-08 y la tanda de accesibilidad T2-13/14/15/16.

Las tareas de Docker (**T2-25, T2-26, T2-28**) conviene agruparlas con la verificación
pendiente de **T1-21**, para una sesión en un equipo donde el daemon arranque.

Los **tres hallazgos que el cierre del Tier 1 dejó sin tarea ya la tienen** (2026-08-08), y el
Tier 2 pasa por eso de 41 a 44 tareas — y a **45** con T2-45, que salió de verificar la primera:

- **T2-42 ✅ hecha** — la interfaz ya permite cancelar una orden de venta enviada, así que la
  reposición de stock de T0-03 **deja de ser inalcanzable desde la aplicación**. Es la única de
  las tres que le faltaba al usuario.
- **T2-43 ✅ hecha** — `products` ya tiene índice por `createdAt`, y el de `isActive` **no se
  retiró: se amplió** a `(isActive, createdAt)`. Hacen falta los dos porque el filtro por estado
  es opcional: el listado sin filtro no lo sirve el compuesto, cuya primera columna no es la
  fecha. El listado del catálogo pasa de `Seq Scan` de 10.3 ms a `Index Scan Backward` de 0.016.
- **T2-44 ✅ hecha** — `formatearImporte()` en `shared/lib/moneda.ts` es el único sitio donde se
  da forma a un importe, y también el único que escribe el `$`. Dos exclusiones a propósito: las
  etiquetas compactas de los ejes de las gráficas y `dailyVelocity`, que no es dinero.

**Los cuatro hallazgos del 2026-08-08 están cerrados** (T2-42, T2-43, T2-44 y T2-45).

**Con T2-42, la asimetría de confirmación es intencionada:** cancelar una orden *pendiente* sigue
siendo un clic directo, porque no toca inventario; cancelar una *enviada* abre un diálogo que dice
cuántas unidades vuelven y de qué productos. Lo que se confirma es el movimiento de stock, no el
cambio de estado. El recuento del diálogo **excluye los ítems sin `productId`**, porque el backend
repone con `where: { productId: { not: null } }` y prometer esas unidades sería mentir. Si algún
día se añade otra transición que mueva inventario, ese es el patrón a repetir.

**Para ejecutar el E2E en este equipo** faltaban los navegadores de Playwright:
`pnpm exec playwright install chromium` (113 MB, una sola vez).

**T2-45 salió de verificar T2-42, y es la trampa de móvil que conviene no volver a pagar.** Los
dos escenarios que pasan por el formulario de producto fallaban en `Mobile Chrome` con un mensaje
que señalaba a otro sitio: «el `<label>` de *Stock mínimo* intercepta el clic». No era el modal ni
el formulario. **Un contenedor `overflow-x-auto` ensancha el viewport de diseño de Chrome de
Android con el ancho de su contenido aunque lo recorte visualmente**, y todo lo `position: fixed`
se dimensiona contra ese viewport: con la tabla de productos en pantalla, un `fixed inset-0` medía
**663 px sobre una pantalla de 393**, así que el modal se centraba en 663 y su mitad derecha —el
botón primario— quedaba fuera del borde. El `<label>` era solo lo que había bajo las coordenadas.

La cura es `contain: paint` en el scroller, y los tres candidatos evidentes **no funcionan**,
comprobado uno a uno: `body { overflow: hidden }` (lo que pone el modal) no influye, porque el
viewport ya estaba ensanchado sin ningún modal abierto; `html { overflow-x: hidden }` no cambia
nada; y quitar el `min-w-160` de la tabla tampoco, porque el ancho mínimo intrínseco de las celdas
ya supera la pantalla. Al añadir una tabla nueva hay que llevar `contain-paint` en su scroller:
`desbordes.test.ts` falla si falta.

**Moraleja repetida:** el fallo de Playwright nombraba un elemento que no tenía nada que ver.
Medir la geometría —una sonda `position: fixed` y los rectángulos reales— costó cuatro pasadas y
descartó tres hipótesis; leer el mensaje de error habría llevado a arreglar el formulario.

**Para verificar cambios de interfaz en el navegador**, el camino corto: `pnpm dev` en los
dos repositorios, entrar con `admin@stockly.app` / `Admin1234!` y, si hace falta un estado
que la base de desarrollo no tiene (un producto agotado, una venta pendiente o enviada),
crearlo por la API con el token CSRF de la cookie **y borrarlo después**. Ojo: una venta ya
enviada no se puede borrar por la API, así que la limpieza pide un script con el cliente de
Prisma —`pnpm exec tsx`, importando `./src/shared/lib/prisma`, que es quien tiene el adaptador
configurado; construir un `PrismaClient` a pelo falla.
