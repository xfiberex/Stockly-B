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
coincidir `DATABASE_URL`. El puerto cambia según el equipo —**5433** en el original,
**5432** en el actual— y es lo primero que hay que ajustar si `verify` falla al conectar.
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
| Tests | **265/265** | **232/232** |
| Cobertura (sentencias) | 88.48 % | 30.01 % |
| Lint | — | **0 errores, 0 avisos** |

**E2E:** `pnpm test:e2e:full` desde `Stockly-F` → **9 pasados, 1 omitido**, sin levantar
nada a mano. Arranca solo la base de datos, el backend y el frontend.

**Tier 0: 8/8** ✅ · **Tier 1: 26/26** ✅ · **Tier 2: 7/41** · Total **42/100**.

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

Tres tests lo sostienen y conviene no desactivarlos: `theme.test.ts` recalcula los
contrastes desde el CSS, `tokens.test.ts` recorre todos los archivos buscando utilidades
crudas, y los de `Button`/`Badge` comprueban que ninguna variante emita una.
La regla al escribir interfaz es nombrar el papel, no el valor: `bg-surface`, no `bg-white`.

Lo que queda del bloque de diseño: **T2-38** (icono además de color en los estados;
`textoLegibleSobre()` de `shared/lib/color.ts` ya está disponible), **T2-39**, **T2-40** y
**T2-41**. Ninguna es grande.

**Pendiente relacionado:** las paletas de los gráficos de Recharts siguen como hex dentro
de los componentes. No son utilidades —`fill`/`stroke` son props—, así que ningún test las
detecta; llevarlas a los tokens exige leer las variables CSS desde JS.

Después, dos raíces más: **T2-10** (logging estructurado, que desbloquea T2-07 y hace
diagnosticable todo lo demás) y **T2-11** (saltar al contenido, que desbloquea T2-18).
Como relleno entre tareas grandes, las de esfuerzo bajo y sin dependencias: T2-01, T2-32,
T2-33, T2-27, T2-06, T2-34, T2-08 y la tanda de accesibilidad T2-13/14/15/16.

Las tareas de Docker (**T2-25, T2-26, T2-28**) conviene agruparlas con la verificación
pendiente de **T1-21**, para una sesión en un equipo donde el daemon arranque.

Además, el cierre del Tier 1 dejó **dos hallazgos sin tarea asignada** (tabla al final del
ROADMAP): la interfaz no permite cancelar una orden de venta ya enviada —la reposición de
stock de T0-03 existe en el backend pero no se puede alcanzar desde la aplicación—, y
falta un índice por `createdAt` en `products` pese a que todos los listados ordenan por él.

`shared/lib/color.ts` (de T2-17) ya calcula el color de texto legible sobre cualquier
fondo: **T2-38** tiene el mismo problema en `Badge` y puede reutilizarlo.
