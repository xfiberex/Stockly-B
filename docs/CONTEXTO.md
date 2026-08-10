# Contexto de trabajo — al 2026-08-10

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
| Tests | **402/402** | **471/471** *(+1 omitido)* |
| Cobertura (sentencias) | 91.95 % *(suelo 85 %)* | 52.17 % *(suelo 45 %)* |
| Lint | — | **0 errores, 0 avisos** |

**E2E:** `pnpm test:e2e:full` desde `Stockly-F`, sin levantar nada a mano —arranca solo la base
de datos, el backend y el frontend—. En este equipo (2026-08-10): **9 pasados,
1 omitido, 0 fallos**, en verde en `chromium` **y** en `Mobile Chrome` desde T2-45.

**Tier 0: 8/8** ✅ · **Tier 1: 26/26** ✅ · **Tier 2: 48/48** ✅ · **Tier 3: 15/15** ✅ ·
**Tier 4: 4/11** · Total **101/108**. **Los cuatro tiers de trabajo están cerrados.** Del Tier 4,
que la auditoría dejó fuera del alcance inmediato a propósito, se abordaron **T4-01**, **T4-02** y
**T4-03** el 2026-08-10: las dos primeras por ser la causa raíz común de T0-03, T1-03 y T1-05 y su
consecuencia directa, la tercera porque T2-35–T2-37 ya habían hecho el trabajo caro. **T4-11** —el
selector de tema— se añadió ese mismo día y no viene de la auditoría, sino de una limitación que el
propio cierre de T4-03 dejó anotada. Las siete restantes siguen fuera de alcance, listadas para que
no hacerlas sea una decisión consciente.

La aplicación pasó de tener el guardado de configuración roto, las etiquetas de producto inertes,
una ventana de 15 minutos de acceso para cuentas desactivadas, cinco listados que reventaban con un
`page` no numérico, ningún índice en la base, `logout` expuesto a CSRF y el correo saliendo en
claro, a tener todo eso corregido, medido y con tests. La pila completa —base, backend y frontend
tras nginx— se levanta con `docker compose up -d --build` y el login funciona contra
`http://localhost:8080`.

*Dos apuntes sobre las cifras. La cobertura del frontend cruzó por fin el objetivo del roadmap
(**49.74 %**, meta ≥ 45 %) al cubrir `ProductsPage`, la navegación y los guardianes de diseño. Y el
denominador subió de 104 a 107 el 2026-08-09 con `T2-46`–`T2-48`, tres hallazgos de un repaso de la
aplicación en marcha anotados ya cerrados, y a 108 el 2026-08-10 con `T4-11`: **no descontaron ni
una tarea de la lista de trabajo**, porque ninguno estaba en ella.*

**Las fichas de la auditoría son pistas, no descripciones verificadas.** Cuatro se comprobaron
equivocadas al abordarlas: la premisa de `T3-08` era **falsa** (Heroicons ya emitía `aria-hidden`,
así que el criterio se cumplía solo, y el fallo real era el opuesto); el enunciado de `T3-05` no
describía el código —el botón de la interfaz nunca tuvo dos rutas—; `T3-09` se quedaba corta, porque
el botón flotante no «probablemente solapaba» la paginación, la dejaba **sin poder pulsarse** y no
solo en móvil; y `T3-03` contaba mal, decía un módulo divergente y eran cinco. Conviene medir antes
de arreglar, y medir otra vez después.

### La documentación del proyecto

| Documento | Para qué |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Las 108 tareas con su progreso y las métricas. La fuente de verdad del trabajo |
| [INFORME-AUDITORIA.md](INFORME-AUDITORIA.md) | El informe del 2026-08-04. **Congelado**: está escrito en presente y describe un estado que ya no existe |
| [adr/](adr/) | **Seis decisiones de arquitectura.** Léelas antes de simplificar algo que parezca complicado de más: están ahí porque la opción evidente es la equivocada. La 0005 explica por qué **no hay CI**, que es lo que más fácilmente se deshace por reflejo |
| [`Stockly-F/docs/design-system.md`](../../Stockly-F/docs/design-system.md) | Lectura previa a tocar cualquier pantalla |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Puerta de calidad, convención de commits y qué anotar al cerrar una tarea |
| [CHANGELOG.md](../CHANGELOG.md) | Registro de cambios de los dos repositorios |
| [README-proyecto.md](README-proyecto.md) | Arranque desde cero de los dos repositorios |

**Una decisión del propietario que conviene no revertir:** `.agents/` y `.claude/` **se versionan a
propósito**, porque el proyecto se trabaja desde varias máquinas. Como son la mayoría de los
archivos rastreados, para buscar en el código está el alias `git buscar` — ver §5.

---

## 4. Trampas del entorno, ya pagadas

*Cada una costó un fallo antes de entenderse. No hace falta redescubrirlas.*

**Un servidor huérfano en el 3000 rompe el E2E siguiente, y la culpa es del rate limiter (2026-08-10).**
Si una pasada de `pnpm test:e2e:full` se interrumpe, el backend puede quedarse escuchando.
`playwright.config.ts` usa `reuseExistingServer: true`, así que la siguiente pasada **no
arranca uno nuevo: reutiliza ese**, y el huérfano no lleva el `RATE_LIMIT_MAX: 100000` que
el E2E inyecta a los servidores que él mismo levanta. El resultado depende de cuántas
peticiones llevara acumuladas:

- **Aún por debajo del techo:** Playwright lo reutiliza, y los tests agotan las 100
  peticiones/15 min a mitad de recorrido. Fallan por 429 unas cuantas pruebas, con síntomas
  que no mencionan el límite —esperas agotadas al rellenar un formulario, listas vacías—.
- **Ya por encima:** `/api/v1/health` responde **429**, Playwright no lo da por listo,
  intenta arrancar el suyo sobre un puerto ocupado y muere con **`Timed out waiting
  120000ms from config.webServer`**.

Comprobado: con el huérfano en marcha, `fetch("http://localhost:3000/api/v1/health")`
devolvía `429 {"message":"Demasiadas peticiones…"}`. La primera vez lo achaqué a que la
base se resembraba y el proceso viejo se quedaba con datos antiguos; **eso era falso**, y
la explicación correcta es esta. Antes de investigar un fallo de E2E, comprobar el puerto —
y si hay algo escuchando, mirar qué devuelve `/health` antes de matarlo:

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,5173 }
```

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

**`prisma db push` no ejecuta el SQL de las migraciones.** Solo lleva el *esquema* a la
base, así que todo lo que viva únicamente en un archivo de migración —un `CREATE
EXTENSION`, un índice parcial, un trigger— no llega a `Stockly_test`. Desde T2-09 esto
importa: el push falla con «no existe la clase de operadores gin_trgm_ops» hasta que se
crea `pg_trgm` a mano en esa base, una sola vez:

```bash
node -e "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:'…/Stockly_test'});await c.connect();await c.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');await c.end();})()"
```

**Dos procesos pueden atarse al mismo puerto en Windows, y las conexiones van al que no
es.** Con un PostgreSQL local escuchando en 5432, `docker compose up` publica el suyo
**también en 5432 sin dar ningún error** —`docker compose ps` lo muestra tan feliz—, pero
`localhost:5432` sigue llegando al local. El síntoma es desconcertante: `AuthenticationFailed`
contra una base que, según Docker, está sana. Por eso el compose acepta
`POSTGRES_HOST_PORT`; para trabajar contra el contenedor:

```bash
POSTGRES_HOST_PORT=5442 docker compose up -d
DATABASE_URL="postgresql://postgres:postgres@localhost:5442/Stockly" pnpm exec prisma db seed
```

**La pila del compose no se siembra sola.** El contenedor aplica migraciones al arrancar
(`prisma migrate deploy` en el `CMD`) pero no ejecuta el seed, así que la base queda con el
esquema y sin usuarios: el login responde **401** y parece un fallo de credenciales.

**CSRF** (double-submit): para un PATCH/POST manual contra el servidor hay que leer la
cookie `csrfToken` y reenviarla en la cabecera `x-csrf-token`. En `NODE_ENV=test` se
omite. Desde **T1-19** solo quedan exentas siete rutas públicas de `/auth`: `logout`,
`PUT /me` y `PATCH /me/password` **exigen token**.

**El rate limit se agota con el E2E.** Cien peticiones por IP cada 15 minutos es poco para una
pasada de navegador: el 429 hace fallar pruebas que no van de eso. `RATE_LIMIT_MAX` y
`AUTH_RATE_LIMIT_MAX` suben el techo y ya vienen puestas en `playwright.config.ts`; el limitador y
CSRF siguen activos. Es la otra mitad de la trampa del servidor huérfano, al principio de esta
sección.

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

**Medir un color justo después de un clic o un `hover` da el color de antes.** Los controles llevan
`transition-colors`, que dura 150–200 ms: `getComputedStyle` leído inmediatamente devuelve el
fotograma inicial —`rgba(0,0,0,0)` en un fondo que va a ser azul— y parece que la clase no se
aplica. Con `waitForTimeout(400)` sale el valor real. Costó media hora y dos hipótesis falsas al
ajustar los menús: llegué a creer que Tailwind no generaba las utilidades. **Regla:** para un
estado con transición, o se espera a que termine, o se mira una captura.

**Y al medir, hacerlo sobre el elemento que se tocó.** Un `document.querySelectorAll(...).find(...)`
dentro de `page.evaluate` puede caer en otro nodo con el mismo texto —la interfaz duplica la
navegación en escritorio y móvil—. `locator.evaluate()` mide justo el que Playwright pulsó.

**Tailwind solo genera las utilidades que aparecen escritas en el código.** Una contraprueba con
una clase que no está en ningún archivo no mide nada, porque esa clase no existe en el CSS
compilado: hay que tocar la propiedad por JS (`style.fontVariantNumeric`). Pasó al verificar las
cifras tabulares de T2-39.

**Los dos proyectos del E2E corren en paralelo contra la misma base**, así que un test que pulse «el
primero de la lista» puede operar sobre lo que acaba de crear el otro proyecto. Pasó con el
escenario de la venta cancelada: `chromium` enviaba la orden de `Mobile Chrome` y el stock nunca
bajaba. La cura no fue serializar, sino **nombrar**: las acciones de fila llevan el número de orden
en su `aria-label` y el test localiza la suya. Vale como regla: **si un test necesita `.first()`,
casi siempre falta un nombre accesible.** Y si una pasada se interrumpe, deja órdenes y productos
`E2E-*` a medias en la base de desarrollo, que ensucian la siguiente.

**Un `overflow-x-auto` ensancha el viewport de diseño en Chrome de Android** con el ancho de su
contenido, aunque lo recorte visualmente, y todo lo `position: fixed` se dimensiona contra ese
viewport: con la tabla de productos en pantalla, un `fixed inset-0` medía **663 px sobre una
pantalla de 393**, así que el modal se centraba en 663 y su botón primario quedaba fuera del borde.
La cura es `contain: paint` en el scroller, y `desbordes.test.ts` falla si falta. Los tres
candidatos evidentes **no funcionan**, comprobado uno a uno: `body{overflow:hidden}` no influye
—el viewport ya estaba ensanchado sin ningún modal—, `html{overflow-x:hidden}` no cambia nada, y
quitar el `min-w-160` de la tabla tampoco, porque el ancho mínimo intrínseco de las celdas ya supera
la pantalla.

**Un fallo de Playwright puede nombrar un elemento que no tiene nada que ver.** El de arriba decía
«el `<label>` de *Stock mínimo* intercepta el clic», que era solo lo que había bajo las coordenadas.
Medir la geometría —una sonda `position: fixed` y los rectángulos reales— costó cuatro pasadas y
descartó tres hipótesis; hacer caso al mensaje habría llevado a arreglar el formulario. Vale la
regla general: **antes de acusar al código de una tarea, comparar contra el estado anterior con
`git stash` en la misma máquina.** Ahí evitó dos diagnósticos equivocados, y también demostró que un
`pnpm dev` olvidado ocupando un puerto falsea toda la medición.

**Tailwind incrusta el color de las sombras, así que sus tokens no se pueden redefinir desde
fuera.** Las utilidades de color compilan a `var(--color-…)` y cambian solas con el tema; las
de sombra no: `.shadow-overlay` sale como `--tw-shadow: 0 8px 24px
var(--tw-shadow-color, #0f172a1f)`, con el literal dentro. Redefinir `--shadow-overlay` en
otro bloque **no hace nada y no se nota** — el token queda escrito y un test que lea el CSS lo
da por bueno. Se descubrió midiendo el modal en el navegador, que devolvía
`rgba(15, 23, 42, 0.12)` en tema oscuro. La salida es meter los dos valores **dentro** del
token con `light-dark()`, porque el literal que Tailwind incrusta es justamente ese.

**`ring-offset-2` no deja un hueco transparente: lo rellena de blanco.** Tailwind registra
`--tw-ring-offset-color` con `initial-value: #fff`, así que el anillo de foco dibuja 2 px
blancos entre el control y el borde — invisible en tema claro, un halo en oscuro. Medido sobre
el interruptor de Configuración: `rgb(255, 255, 255)` sin token y `rgb(21, 29, 44)` con
`ring-offset-surface`. No lo veía ninguna guardia de color, porque no es una utilidad cruda de
la paleta ni un hexadecimal escrito en el código; ahora lo vigila `tokens.test.ts`.

**El tema no se puede aplicar desde `main.tsx`.** Un `<script type="module">` es diferido por
definición, así que cuando corre el navegador ya pintó: quien elija un tema distinto al de su
sistema ve un fogonazo del otro en cada carga. Va en un script en línea y bloqueante dentro de
`<head>`. Se comprueba midiendo el fondo en el **primer `requestAnimationFrame`** sobre el
build de producción, con la CPU a 1/20 y la red a «Slow 3G» para que React no haya montado —y
falsificándolo: sin el script, ese mismo frame sale del color contrario.

**Un test que repara lo que vigila se queda mudo para siempre, y parece un fallo intermitente.**
El primer guardián de frescura del contrato tenía debajo otro caso que llamaba a `generar()` para
ganar cobertura — y con eso **reescribía el archivo**. Con la copia desfasada, la primera pasada
daba dos tests en rojo y de paso la arreglaba, así que la segunda salía verde y el aviso
desaparecía. El síntoma es de los peores: un fallo que no se reproduce y que uno acaba achacando a
la base de datos o al orden de los tests. **Regla: un test no escribe en el árbol.** Si hace falta
ejercitar algo que escribe, se ejercita con su comando, no dentro de la suite.

**Un `return` en el nivel superior de un `.js` rompe la cobertura, no los tests.** Node envuelve
cada módulo CommonJS en una función, así que ahí es legal y el archivo funciona; babel lo parsea
como módulo ES al instrumentar para cobertura y falla con «'return' outside of function». El
síntoma despista mucho: `pnpm test` en verde y `pnpm test:coverage` en rojo, señalando el `require`
del test en vez del archivo requerido. Pasó con `scripts/generar-contratos.js` (T4-01); la cura es
meter el cuerpo en una función y llamarla.

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

## 5. Cosas que dependen de ti, no del código

**Activar el alias de búsqueda en cada máquina nueva.** Vive en `.git/config`, que no se
versiona, así que un clon recién hecho no lo tiene. Una vez por repositorio:

```bash
git config --local include.path ../.gitconfig-stockly
```

Sin él, buscar en el código devuelve sobre todo documentación de tooling: `.agents/` y
`.claude/` se versionan a propósito (T3-06) y son la mayoría de los archivos rastreados.
Con él, `git buscar` y `git buscar-archivos` filtran a código de aplicación. Comprobado en
esta máquina: en `Stockly-F`, `z.object` pasa de **61 archivos a 8**; en `Stockly-B`, de
**57 a 14**. Está activado aquí; falta en el otro equipo.

**En un despliegue nuevo nadie es administrador hasta ejecutar `pnpm db:seed`.** Desde
T1-22 el registro público crea siempre usuarios `USER`. Para promover a alguien:
`PATCH /api/v1/users/:id/role` desde una cuenta que ya sea ADMIN.

### Resueltas

**La credencial filtrada está rotada (2026-08-10).** Apareció en un conflicto de merge sin
resolver commiteado y pusheado en `Stockly-F/main` desde el 2026-08-05 (merge `4254582`),
dentro de `e2e/smoke.spec.ts`, y devolvió al repositorio la misma contraseña que T0-06
había purgado reescribiendo el historial. El conflicto se resolvió a favor de la credencial
del seed y **la contraseña ya se cambió**, así que el valor que quedó en el historial de ese
merge está muerto.

De paso se **retiró del árbol actual**: estaba escrita en claro en `docs/CONTEXTO.md` y dos
veces en `docs/ROADMAP.md`, que son archivos versionados. Ahora esos textos dicen «la
credencial filtrada» y el registro conserva el sentido sin llevar el valor. `git grep` sobre
los dos repositorios devuelve **cero** coincidencias. En el historial sigue estando, y con el
valor ya rotado eso no es un riesgo, pero conviene saberlo si algún día se pasa un escáner
de secretos: **avisará, y será un falso positivo**.

Queda de la ficha T0-06 una gestión externa: abrir ticket a GitHub Support para recolectar el
commit huérfano `55efe3b`. No es urgente con la contraseña ya cambiada.

**T1-21 verificado (2026-08-09).** `docker exec stockly_backend id` devuelve
`uid=1000(node)`, y las migraciones se aplican al arrancar sin privilegios de root,
incluida la extensión `pg_trgm` de T2-09.

---

## 6. Decisiones vivas: lo que no conviene deshacer

**Por dónde seguir:** no queda trabajo asignado. Los cuatro tiers están cerrados y lo único abierto
es el **Tier 4** (10 tareas), que la auditoría dejó fuera del alcance inmediato a propósito.

*Lo que sigue son las decisiones que costaron una medición y que una sesión nueva podría revertir
por reflejo, agrupadas por tema. El relato tarea a tarea vive en las filas de
[Progreso](ROADMAP.md#progreso); aquí solo está el poso.*

### Diseño

La referencia es [`Stockly-F/docs/design-system.md`](../../Stockly-F/docs/design-system.md): color,
tipografía, radios, elevación, densidad, estados, iconos y movimiento, cada sección con el test que
la vigila. **Es lectura previa a tocar una pantalla**, y no es opcional: media docena de esas
reglas ponen `pnpm verify` en rojo si se incumplen.

**El modo oscuro es capa semántica, no clases `dark:`** (T4-03). Sigue la preferencia del
sistema, no hay conmutador, y no se tocó ni una pantalla: las utilidades de color compilan a
`var(--color-…)`, así que redefinir los tokens bajo `prefers-color-scheme` cambia la
aplicación entera. Si algún día se añade un selector manual, la capa ya está: lo que falta es
persistencia y un tercer estado «auto». Tres cosas que no conviene deshacer:

- **No inviertas la paleta.** Los estados se aclaran y desaturan; un `#b91c1c` sobre fondo
  oscuro es casi negro. Los ratios están medidos y `theme.test.ts` los recalcula **en los dos
  temas**.
- **Los rellenos se pintan `bg-primary text-surface`, nunca `text-white`.** Es lo que hace que
  el botón primario se invierta solo al cambiar de tema. Escribir `text-white` en un botón
  rompe el modo oscuro sin que ningún test de color lo vea.
- **Los colores de los gráficos son `var(--color-chart-N)` en las props de Recharts.** Funciona
  porque un atributo de presentación de SVG se parsea como valor CSS, y reacciona al tema sin
  volver a renderizar. Lo que sea un **estado** —entradas, salidas, stock mínimo— va con su
  token de estado, no con la paleta categórica.

Lo que ese documento no recoge:

- **Los ítems de menú son cajas delimitadas** (T2-46, a petición de diseño). Salen todos de
  `clasesDeItemDeMenu()` en `Stockly-F/src/shared/lib/`: borde transparente en reposo —para que el
  texto no baile un píxel al señalar— que se pinta en `hover` y en `focus-visible`, nunca en `focus`
  a secas, o se quedaría pegado tras un clic de ratón. Al añadir un desplegable, usar ese helper y
  `CLASES_PANEL_DE_MENU`. La separación entre ítems (`gap-1`) **no es estética**: sin ella, dos
  recuadros contiguos comparten línea y parecen solaparse — un defecto que no existía antes de
  delimitarlos.
- **La fila de la tabla de productos se quedó en 48 px**, no en los 36 del perfil denso de T2-40.
  No es un descuido: relleno 6+6, nombre 20 y SKU 16 ya suman 48, y la celda de la miniatura, 44.
  Bajar a 36 exige quitar el SKU de la tabla o encoger la miniatura a 24 px, y eso es una decisión
  de producto.
- **Pendiente:** las paletas de los gráficos de Recharts siguen como hexadecimales dentro de los
  componentes. No son utilidades —`fill` y `stroke` son props—, así que ningún test las detecta;
  llevarlas a los tokens exige leer las variables CSS desde JS.

### El contrato de la API

**La forma de las respuestas se declara en un solo sitio: `src/contratos/api.ts`** (T4-01). El
frontend no escribe la suya, recibe una copia literal generada con `pnpm contratos:generar` y
versionada allí. Para cambiar una respuesta: se edita **aquí**, se genera, y se commitea en los
**dos** repositorios — el generador lo recuerda al terminar.

Tres reglas que no conviene deshacer:

- **Ese archivo solo puede importar `zod`.** Es lo que permite copiarlo en vez de transformarlo.
  Meterle un `import` de Prisma o de `@/…` rompe la compilación del otro lado.
- **Los enums se repiten ahí a propósito**, por lo mismo. La duplicación no queda suelta:
  `src/tests/contratos.test.ts` los compara con `$Enums` y falla si divergen.
- **`price` y los `unitPrice` son `Importe`, o sea `string | number`.** No es indecisión: los
  `Decimal` de Prisma se serializan como cadena y `/reports` es la excepción, porque su servicio
  convierte con `Number(...)` antes de responder. Para pasar a número está `aNumero()`. Estrecharlo
  a `number` «para simplificar» es volver a la mentira que costó esta tarea.

El porqué de copiar en vez de publicar un paquete, con las tres alternativas descartadas y su
coste, está en [ADR 0006](adr/0006-contrato-copiado-entre-repositorios.md).

**Y el spec de OpenAPI se deriva de ahí** (T4-02). `components.schemas` no se escribe: lo genera
`swagger.esquemas.ts` desde el contrato —las respuestas— y desde los `*.validator.ts` —las
peticiones—, con `z.toJSONSchema()` de Zod 4 y `target: "openapi-3.0"`. Dos cosas que conviene no
deshacer:

- **No hace falta `zod-to-openapi`.** Zod 4.4 lo hace solo y en el dialecto exacto del spec. Añadir
  esa dependencia —que es lo que pedía la ficha, escrita cuando Zod no sabía— sería tenerla por
  costumbre.
- **Las peticiones se generan con `io: "input"`.** Los validadores usan `z.coerce.number()`: lo que
  aceptan no es lo que producen. Con la salida, el spec diría que `price` solo admite números y el
  «Try it out» mentiría con los formularios.

Las **rutas** siguen escritas a mano en `swagger.paths.ts` y así se quedan: qué endpoints hay, con
qué resumen y qué códigos devuelven no se deduce de un esquema.

### Accesibilidad

- **`<main id="contenido" tabIndex={-1}>` es un destino, no un adorno.** Sin ese `tabIndex` el foco
  no viaja y el enlace de saltar al contenido (T2-11) queda en decoración: el navegador desplaza,
  pero el siguiente Tab vuelve al principio del menú. **T2-18 usa el mismo destino** — en cada
  cambio de ruta, `AnuncioDeRuta` mueve allí el foco y cambia el texto de una región `aria-live`.
- **Un desplegable de navegación no es un `menu`.** La ficha de T2-16 pedía `role="menu"` y
  `role="menuitem"` en `NavDropdown`, y **no se aplicó a propósito**: ese rol es para comandos de
  aplicación; con él, los enlaces de Catálogo/Órdenes/Admin dejan de anunciarse como enlaces y
  desaparecen de la lista de enlaces del lector de pantalla. Se quedó en *disclosure*
  (`aria-haspopup` + `aria-expanded` + `aria-controls` + Escape). `UserMenu` sí conserva
  `role="menu"`, que ya tenía: ahí dentro hay un comando de verdad («Cerrar sesión»). **Lo destapó
  el E2E**, que dejó de encontrar «Productos» por rol de enlace: una prueba ajena señalando un
  problema real, no un selector viejo.
- **Al añadir una ruta hay que darle título** en `Stockly-F/src/shared/lib/titulos.ts`, o
  `titulos.test.ts` falla — a propósito: sin entrada, al llegar a esa sección se anunciaría «Página
  no encontrada», que es peor que el silencio. No se leen del `<h1>` porque, con las rutas en
  `lazy()`, al cambiar de ruta todavía no hay `<h1>` que leer. Ese archivo pone además el
  `document.title` de cada pestaña.

### Backend

- **Hay observabilidad** (T2-10): `pino` + `pino-http` con `requestId` por petición, devuelto en
  `x-request-id` y presente en cada línea; en producción, JSON. Al depurar un fallo, pedir ese
  identificador es lo primero. Las cabeceras van redactadas (`cookie`, `authorization`): sin eso,
  pino-http registra la sesión completa en cada llamada.
- **Las alertas de bajo stock no bloquean la respuesta** (T2-07). Se disparan sin esperar y sus
  fallos se registran; `esperarAlertasEnVuelo()` existe para que los tests puedan esperarlas de
  verdad. Si añades otro aviso por correo, sigue ese patrón.
- **La asimetría al cancelar una venta es intencionada** (T2-42). Cancelar una orden *pendiente* es
  un clic directo, porque no toca inventario; cancelar una *enviada* abre un diálogo que dice
  cuántas unidades vuelven y de qué productos. Lo que se confirma es el movimiento de stock, no el
  cambio de estado. El recuento **excluye los ítems sin `productId`**, porque el backend repone con
  `where: { productId: { not: null } }` y prometer esas unidades sería mentir. Si algún día se añade
  otra transición que mueva inventario, ese es el patrón a repetir.

### Verificar un cambio de interfaz en el navegador

`pnpm dev` en los dos repositorios y entrar con `admin@stockly.app`. Si hace falta un estado que la
base de desarrollo no tiene —un producto agotado, una venta pendiente o enviada—, crearlo por la API
con el token CSRF de la cookie **y borrarlo después**. Ojo: una venta ya enviada no se puede borrar
por la API, así que la limpieza pide un script con el cliente de Prisma (`pnpm exec tsx`, importando
`./src/shared/lib/prisma`, que es quien tiene el adaptador configurado; construir un `PrismaClient`
a pelo falla).

Los navegadores de Playwright se instalan aparte, una sola vez:
`pnpm exec playwright install chromium` (113 MB).
