# ROADMAP — Stockly

Plan de implementación derivado de [INFORME-AUDITORIA.md](INFORME-AUDITORIA.md) (2026-08-04), ampliado el 2026-08-05 con la consultoría de estilo UX/UI (tareas `T2-35`–`T2-41`, `T3-14`, `T3-15`, `T4-10`).
Cada tarea es independiente, marcable y referenciable desde commits e issues por su ID (`T{tier}-{nº}`).

> **Convención de commits:** `fix(T0-01): resolver alias de rutas en el build de producción`

> ## Estado al 2026-08-11 — **104 / 110**
>
> **Los cuatro tiers de trabajo están cerrados:** Tier 0 (8/8), Tier 1 (26/26), Tier 2 (48/48) y
> Tier 3 (15/15). Del **Tier 4** —que la auditoría dejó fuera del alcance inmediato— se abordaron
> **T4-01**, **T4-02**, **T4-03**, **T4-11**, **T4-04** y **T4-05**: las dos primeras por ser la
> causa raíz común de T0-03, T1-03 y T1-05 y su consecuencia directa; la tercera porque T2-35–T2-37
> ya habían hecho el trabajo caro; la cuarta —que no viene de la auditoría— porque el cierre de
> T4-03 dejó anotado que faltaba el conmutador manual; la quinta porque el contrato de T4-01 ya
> permitía que los errores viajaran con código; la sexta porque el valor del sistema es un
> histórico de inventario del que no había ninguna copia, y **T4-06** porque de nada sirve saber
> restaurar si nadie se entera de que hay que hacerlo. Las 6 restantes siguen fuera de alcance.
>
> Backend **414/414** tests y 91.83 % de sentencias; frontend **494/494** y 53.14 %; E2E 9 pasados
> y 1 omitido en `chromium` y en `Mobile Chrome`. Detalle en [Métricas](#métricas).
>
> **Las fichas describen el problema tal como se vio en la auditoría, no como resultó ser.** Cuatro
> se comprobaron equivocadas al abordarlas (`T3-03`, `T3-05`, `T3-08`, `T3-09`); la corrección está
> en su fila de [Progreso](#progreso). Medir antes de arreglar, y medir otra vez después.

---

## Índice

| Tier | Descripción | Tareas | Esfuerzo bajo / medio / alto |
|---|---|---:|---|
| **Tier 0** | Crítico / bloqueante — despliegue roto, corrupción de inventario, credencial expuesta | 8 | 5 / 3 / 0 |
| **Tier 1** | Alta prioridad — funcionalidades rotas, verificación local, autorización, accesibilidad grave | 26 | 23 / 3 / 0 |
| **Tier 2** | Mejoras sustanciales — rendimiento, accesibilidad, sistema de diseño, cobertura, infra, documentación | 48 | 35 / 13 / 0 |
| **Tier 3** | Pulido y mantenimiento | 15 | 15 / 0 / 0 |
| **Tier 4** | Futuro / opcional — fuera del alcance inmediato | 13 | 2 / 6 / 5 |
| | **Total** | **110** | **80 / 25 / 5** |

*Diez tareas no vienen de la auditoría, y por eso el total pasa de 100 a 110: `T2-42`–`T2-45` se añadieron el 2026-08-08 (tres del cierre del Tier 1 y una encontrada al verificar T2-42), `T2-46`–`T2-48` el 2026-08-09, de un repaso de la aplicación en marcha, `T4-11` el 2026-08-10, de una limitación que el propio cierre de T4-03 dejó anotada, `T4-12` el 2026-08-11, de otra que dejó anotada el de T4-04, y `T4-13` ese mismo día, de una discrepancia que destapó el ensayo de restauración de T4-05.*

**Ruta crítica sugerida:** `T0-01 → T0-02 → T0-03/04 → T0-05 → T1-01/T1-02 (verificación local)` ✅ *completada el 2026-08-07* y, en paralelo desde el primer día, todos los quick wins sin dependencias de Tier 1.

**Trazabilidad:** los 70 hallazgos del informe tienen al menos una tarea aquí. La correspondencia inversa está en la tabla del final. Los hallazgos con prefijo `DS-` no proceden de la auditoría sino de la consultoría de diseño del 2026-08-05.

---

## Tier 0 — Crítico / bloqueante ✅ **completado el 2026-08-04**

*El producto no se puede desplegar y corrompe datos de inventario. Nada más entra en producción hasta cerrar este tier.*

> **Estado:** las 8 tareas están aplicadas y verificadas por ejecución. `docker compose up --build` levanta el stack, aplica las 7 migraciones y responde 200 en `/api/v1/health`. Detalle en la sección [Progreso](#progreso).

- [x] **[T0-01] Resolver los alias `@/` en el JavaScript compilado**
  - **Área:** Arquitectura / DevOps
  - **Ubicación:** `Stockly-B/tsconfig.json:14-16`, `Stockly-B/package.json:8`
  - **Qué hacer:** `tsc` no reescribe los `paths`, por lo que `dist/server.js:8` emite `require("@/app")` y Node no lo resuelve. Añadir `tsc-alias` como devDependency y encadenarlo al build: `"build": "tsc && tsc-alias"`. Alternativa sin dependencia nueva: migrar a *subpath imports* nativos (`"imports"` en `package.json`).
  - **Criterio de aceptación:** `pnpm build && node dist/server.js` arranca el servidor y `GET /api/v1/health` devuelve 200. Hoy falla con `Error: Cannot find module '@/app'`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T0-02] Reparar la imagen Docker — cinco fallos independientes**
  - **Área:** DevOps
  - **Ubicación:** `Stockly-B/Dockerfile` (completo), `Stockly-B/package.json:22-28`, `Stockly-B/prisma.config.ts:13`
  - **Qué hacer:** `docker compose build backend` no llega ni al primer `pnpm install`. Verificado sorteando cada fallo uno a uno, hay cinco defectos en cascada — los cinco se corrigen en un mismo cambio:
    1. **Corepack rechaza el rango de versión.** `devEngines.packageManager.version` es `"^11.2.2"` y corepack exige una versión exacta → `Invalid package manager specification`. Fijar `pnpm@11.2.2` en el `corepack prepare` y usar el campo `"packageManager"` de npm.
    2. **`pnpm-workspace.yaml` no se copia.** Contiene la lista `allowBuilds` que pnpm 11 exige para permitir los scripts de instalación de Prisma → `ERR_PNPM_IGNORED_BUILDS` en ambos stages. Añadirlo a los dos `COPY` (`Dockerfile:9,26`).
    3. **`prisma generate` no tiene `DATABASE_URL`.** `prisma.config.ts:13` resuelve `env("DATABASE_URL")` de forma eager y `.dockerignore:3-4` excluye `.env` del contexto → `PrismaConfigEnvError`. Aportar un `ARG DATABASE_URL` de build, o hacer que la config resuelva la URL de forma perezosa.
    4. **La CLI de Prisma no está en el runner.** `prisma` es devDependency y el runner instala con `--prod` → `Command "prisma" not found`, que es literalmente lo primero que ejecuta el `CMD`. Instalarla explícitamente o moverla a `dependencies`.
    5. **`prisma.config.ts` no llega al runner.** `schema.prisma:11-13` declara el datasource **sin `url`**: vive solo en ese archivo. Añadir su `COPY --from=builder`.
  - **Criterio de aceptación:** `docker compose up --build` construye la imagen, aplica las migraciones y `curl http://localhost:3000/api/v1/health` devuelve 200. Comprobaciones intermedias verificables dentro de la imagen: `ls prisma.config.ts` la encuentra y `pnpm exec prisma --version` responde. Hoy fallan las dos.
  - **Esfuerzo:** medio
  - **Depende de:** T0-01

- [x] **[T0-03] Reponer el stock al cancelar una orden de venta ya enviada**
  - **Área:** Arquitectura / integridad de datos
  - **Ubicación:** `Stockly-B/src/modules/sale-orders/sale-orders.service.ts:79-88`
  - **Qué hacer:** La transición `SHIPPED → CANCELLED` cae en la rama de actualización plana y no devuelve el stock descontado. Añadir una rama `beingCancelled` que, dentro de una transacción, incremente el stock de cada ítem con `productId` y registre un `StockMovement` de tipo `IN` con nota de cancelación, antes de cambiar el estado. Si la decisión de producto es prohibir esta transición, rechazarla con un 400 explícito — lo que no puede quedar es el 200 silencioso actual.
  - **Criterio de aceptación:** producto con stock 100 → orden de 30 uds. → `PATCH {status:"SHIPPED"}` deja stock 70 → `PATCH {status:"CANCELLED"}` deja stock **100** y existe un `StockMovement` `IN` de `+30`. Verificado hoy: queda en 70.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna

- [x] **[T0-04] Descontar el stock al cancelar una orden de compra ya recibida**
  - **Área:** Arquitectura / integridad de datos
  - **Ubicación:** `Stockly-B/src/modules/purchase-orders/purchase-orders.service.ts:49-63`
  - **Qué hacer:** Espejo de T0-03 para `RECEIVED → CANCELLED`. El decremento debe ser **condicional** (`where: { id, stock: { gte: item.quantity } }`) y devolver 400 con mensaje claro si el stock ya se consumió, para no generar stock negativo. Registrar un `StockMovement` `OUT` por ítem.
  - **Criterio de aceptación:** producto con stock 100 → compra de 40 uds. → `PATCH {status:"RECEIVED"}` deja 140 → `PATCH {status:"CANCELLED"}` deja **100** con movimiento `OUT` de `-40`. Si el stock disponible es menor que lo recibido, la respuesta es 400 y no se modifica nada. Verificado hoy: queda en 140.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna

- [x] **[T0-05] Tests de integración para las cancelaciones con efecto sobre el stock**
  - **Área:** QA
  - **Ubicación:** `Stockly-B/src/tests/sale-orders.test.ts`, `Stockly-B/src/tests/purchase-orders.test.ts`
  - **Qué hacer:** Cubrir las cuatro transiciones: `SHIPPED→CANCELLED` (stock repuesto), `RECEIVED→CANCELLED` (stock descontado), `RECEIVED→CANCELLED` con stock insuficiente (400 y sin cambios), y `PENDING→CANCELLED` (sin efecto sobre el stock). Verificar en cada caso el `StockMovement` generado.
  - **Criterio de aceptación:** los 4 tests pasan y fallan si se revierte T0-03 o T0-04.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-03, T0-04

- [x] **[T0-06] Eliminar la credencial personal versionada en el test E2E**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-F/e2e/smoke.spec.ts:5`
  - **Qué hacer:** el valor por defecto de `E2E_PASSWORD` era una contraseña real (no la del seed, que es `Admin1234!` según `prisma/seed.ts:45`) en un archivo rastreado por git. Sustituir el valor por defecto por el del seed. Rotar la contraseña real allí donde se use. Si el repositorio va a compartirse o publicarse, purgar el valor del historial con `git filter-repo` — el commit correctivo no basta. *(El literal se omite a propósito: este archivo también está versionado.)*
  - **Criterio de aceptación:** el literal no aparece en ningún blob del historial reescrito; la contraseña original ha sido rotada; el smoke test pasa contra una base de datos recién sembrada.
  - **Esfuerzo:** bajo (medio si se purga el historial)
  - **Depende de:** ninguna

- [x] **[T0-07] Revocar las sesiones activas al restablecer la contraseña**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/modules/auth/auth.service.ts:136-139`
  - **Qué hacer:** `resetPassword` no anula `refreshToken`/`refreshExpires`, a diferencia de `updatePassword` (`:202-205`), que sí lo hace. Un atacante conserva acceso hasta 7 días tras la recuperación de la cuenta. Añadir `refreshToken: null, refreshExpires: null` al `data` del `update`.
  - **Criterio de aceptación:** tras un reset de contraseña, `POST /api/v1/auth/refresh` con la cookie de refresh previa devuelve 401.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T0-08] Test de regresión de la revocación de sesiones tras reset**
  - **Área:** QA / Seguridad
  - **Ubicación:** `Stockly-B/src/tests/auth.test.ts`
  - **Qué hacer:** Login → capturar la cookie `refreshToken` → `forgot-password` → `reset-password` con el token → verificar que `POST /auth/refresh` con la cookie antigua devuelve 401.
  - **Criterio de aceptación:** el test pasa y falla si se revierte T0-07.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-07

---

## Tier 1 — Alta prioridad

*Funcionalidades rotas visibles al usuario, ausencia de red de seguridad automatizada, autorización y barreras graves de accesibilidad.*

### Verificación local

> **Decisión (2026-08-06):** el proyecto **no usa CI**. No hay workflows de GitHub Actions ni pipeline de ningún proveedor: toda la verificación se ejecuta en local, a mano, antes de dar por cerrada una tarea. Los dos workflows que existían se han eliminado. T1-01 y T1-02 pasan a ser el guion de verificación local equivalente, que es lo que sustituye a la puerta de calidad automática.

- [x] **[T1-01] Guion de verificación local del backend** ✅ *(2026-08-07)*
  - **Área:** QA / DevOps
  - **Ubicación:** `Stockly-B/package.json` (scripts `verify` y `smoke`), `Stockly-B/scripts/smoke.js`
  - **Qué hacer:** Encadenar en un único comando la secuencia completa: `pnpm install --frozen-lockfile`, `pnpm exec prisma generate`, `pnpm exec prisma migrate deploy`, `pnpm check`, `pnpm test:coverage`, `pnpm build` y una verificación de arranque del artefacto (`node dist/server.js` + `GET /api/v1/health`) para que T0-01 no pueda regresar. Dos detalles que el código exige:
    1. **`prisma generate` va antes de todo lo demás.** El cliente se emite en `src/generated/prisma`, que está en `.gitignore`; sin generarlo fallan tanto `pnpm check` como `pnpm build`. Es el mismo orden que ya sigue el `Dockerfile:23-24`.
    2. **La base de tests debe llamarse `Stockly_test`.** `jest.setup.js:11` reescribe el nombre de la base de la `DATABASE_URL` a `Stockly_test`; creándola ya con ese nombre, migraciones, tests y arranque operan sobre la misma base y el reemplazo queda en no-op.
    Las doce variables que exige `validateEnv()` deben estar en el `.env` local — Cloudinary y SMTP admiten valores ficticios, porque los tests los mockean pero su ausencia impide arrancar (ver T1-26).
    **Implementado.** `scripts/smoke.js` arranca `dist/server.js` en `SMOKE_PORT` (3100 por defecto, para no chocar con el `dev` si está levantado) y sondea `/api/v1/health` durante 30 s. No usa `process.exit()`: en Windows, salir con el proceso hijo aún cerrándose aborta libuv y devuelve un código de salida sin sentido aunque la comprobación haya pasado.
  - **Criterio de aceptación:** `pnpm verify` pasa entero desde un checkout limpio, y falla si se rompe cualquiera de los pasos.
  - **Verificado localmente (2026-08-07):** `pnpm verify` completo contra el PostgreSQL local del puerto 5433 — `prisma generate` ✅ · `migrate deploy` ✅ · `check` ✅ · `test:coverage` ✅ **205/205** · `build` ✅ · smoke ✅ (`/api/v1/health` → **200**, salida 0). Camino de fallo comprobado renombrando `dist/server.js`: el smoke lo detecta y sale con **1**.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-01

- [x] **[T1-02] Guion de verificación local del frontend** ✅ *(2026-08-07)*
  - **Área:** QA / DevOps
  - **Ubicación:** `Stockly-F/package.json` (script `verify`)
  - **Qué hacer:** Encadenar `pnpm install --frozen-lockfile`, `pnpm check` (`tsc -b`), `pnpm lint`, `pnpm test:coverage` y `pnpm build`. Dos añadidos que el repositorio necesitaba y que ya están hechos:
    1. **No existía script `check`.** A diferencia del backend, `Stockly-F/package.json` no lo declaraba pese a que este roadmap lo da por hecho. Añadido `"check": "tsc -b"` — no emite, porque `tsconfig.app.json` tiene `noEmit: true`.
    2. **No existía campo `packageManager`.** Sin él, `--frozen-lockfile` deja de ser reproducible entre máquinas. Fijado a `pnpm@11.2.2`, el mismo que el backend.
  - **Criterio de aceptación:** `pnpm verify` pasa entero y falla ante errores de lint, tipos o tests.
  - **Verificado localmente (2026-08-07):** `pnpm verify` completo **en verde, exit code 0** — `check` ✅ · `lint` ✅ **0 errores** · `test:coverage` ✅ **190/190, 23.98 %** · `build` ✅. Estuvo bloqueado por el lint hasta cerrar T1-09 ese mismo día, que es justo el comportamiento buscado: el guion se negaba a pasar mientras el repositorio no lo mereciera.
    Dos cosas que el primer `verify` real destapó:
    - **Un conflicto de merge sin resolver commiteado** en `e2e/smoke.spec.ts:3-12` desde el merge `4254582` (2026-08-05), que reintroducía la credencial filtrada purgada por T0-06. Elevaba el lint a 27 errores. Resuelto a favor del lado del seed; el recuento vuelve a los 26 de la auditoría.
    - **ESLint analiza `coverage/`**, que son artefactos generados. De ahí salen 3 de los 4 avisos. Añadirlo a los `ignores` de `eslint.config.js` es parte de T1-09.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-09

### Etiquetas de producto (funcionalidad rota)

- [x] **[T1-03] Declarar `tagIds` en los esquemas de validación de producto** ✅ *(2026-08-07)*
  - **Área:** Arquitectura / funcionalidad
  - **Ubicación:** `Stockly-B/src/modules/products/product.validator.ts:9-24,44,58`, `Stockly-F/src/modules/products/api/product.api.ts:21-30`
  - **Qué hacer:** Ni `createProductSchema` ni `updateProductSchema` declaran `tagIds`; Zod descarta las claves desconocidas y `validate.middleware.ts:20` reemplaza `req.body` con el resultado parseado, por lo que el servicio nunca las recibe. Añadir un campo `tagIds` con `preprocess` que normalice a array (multipart envía un string cuando hay un solo valor) y valide UUIDs.
    **Implementado.** El servicio ya sabía manejar etiquetas (`connect` al crear, `set` al actualizar); solo el validador las descartaba. `tagIdsOptional` normaliza cadena → array, filtra vacíos y valida UUIDs.
    **Un hueco adicional que salió al hacerlo:** con `FormData`, una lista vacía no se puede expresar —la clave simplemente no viaja, y eso significa «no tocar las etiquetas»—, así que **quitar todas era imposible**. El cliente envía ahora `tagIds: ""` explícito y el validador lo traduce a `[]`.
  - **Criterio de aceptación:** `POST /api/v1/products` con `tagIds` en el `FormData` crea el producto con las etiquetas asociadas. Verificado hoy: 201 con 0 etiquetas asignadas.
  - **Verificado localmente (2026-08-07):** ver T1-04.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T1-04] Tests de asignación de etiquetas a productos** ✅ *(2026-08-07)*
  - **Área:** QA
  - **Ubicación:** `Stockly-B/src/tests/products.test.ts`
  - **Qué hacer:** Crear un producto con una etiqueta y verificar la relación persistida; actualizar un producto sustituyendo el conjunto de etiquetas (`set`); enviar un `tagIds` con un UUID inválido y esperar 422; filtrar el catálogo por `?tagId=` y comprobar que devuelve el producto.
  - **Criterio de aceptación:** los 4 tests pasan y fallan si se revierte T1-03.
  - **Verificado localmente (2026-08-07):** **10 tests**, los 4 pedidos más uno de vaciado y cinco de normalización. Los 4 de HTTP fallan si se revierte T1-03.
    El formato real de `multipart/form-data` **no puede ejercitarse por HTTP en esta suite**: `upload.middleware` está mockeado y multer, que es quien parsea ese cuerpo, nunca llega a correr — un `.field()` acaba en 422 por un `req.body` sin parsear. La normalización se valida entonces contra el esquema directamente, que es donde vive: cadena → array, array → array, `""` → `[]`, clave ausente → `undefined`, UUID inválido → error.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-03

### Configuración de la aplicación (funcionalidad rota)

- [x] **[T1-05] Alinear el payload de `PATCH /settings` con el contrato del backend** ✅ *(2026-08-07)*
  - **Área:** Arquitectura / funcionalidad
  - **Ubicación:** `Stockly-F/src/modules/settings/api/settings.api.ts:10-16`
  - **Qué hacer:** El frontend envía `{ updates: {...} }` y el backend espera el objeto plano (`settings.controller.ts:14` → `Object.entries(req.body)`), por lo que la clave `updates` se descarta por no estar en el catálogo y no se persiste nada. Enviar el objeto plano: `api.patch("/settings", updates)`.
  - **Criterio de aceptación:** guardar el interruptor de alertas desde la UI escribe la fila en `app_settings`. Verificado hoy: HTTP 200, `data: []`, cero filas persistidas.
  - **Verificado localmente (2026-08-07):** contra el backend real (`node dist/server.js`, PostgreSQL local), autenticado como admin y con token CSRF. Los dos payloads, uno detrás de otro:
    | Payload | Respuesta | Valor persistido |
    |---|---|---|
    | `{"updates":{"lowStockAlertEnabled":true}}` | **200**, `data` vacío | `false` — **no persiste** |
    | `{"lowStockAlertEnabled":true}` | **200**, `data: {key, value:true}` | `true` ✅ |
    El ajuste se dejó de nuevo en `false` al terminar. El 200 con `data` vacío es exactamente lo que hacía invisible el fallo, y es lo que T1-07 debe convertir en un 422.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T1-06] Corregir el tipo de `SettingEntry.value` en el frontend** ✅ *(2026-08-07)*
  - **Área:** Arquitectura / funcionalidad
  - **Ubicación:** `Stockly-F/src/modules/settings/types/settings.types.ts`, `SettingsPage.tsx`
  - **Qué hacer:** El backend devuelve `value` ya parseado (boolean para los ajustes de tipo `boolean`), pero el frontend lo tipa como `string` y compara `entry.value === "true"`, por lo que el interruptor siempre se pinta apagado y `isDirty` siempre da verdadero. Cambiar el tipo a `boolean | string | number` y normalizar la comparación.
    **Implementado.** Nuevo tipo `SettingValue = boolean | string | number` y un `esVerdadero()` que acepta tanto el boolean del backend como la cadena que produce un input. Además se **eliminó `defaultValue` de `SettingEntry`**: el backend nunca lo envía (`settings.service.ts:21-27`), solo existía en el tipo y en el mock del test — la misma clase de mentira en el contrato que causó esta tarea.
  - **Criterio de aceptación:** con `lowStockAlertEnabled` en `true` en base de datos, la página muestra el interruptor encendido y el botón «Guardar cambios» aparece deshabilitado hasta que haya un cambio real.
  - **Verificado localmente (2026-08-07):** el `GET /settings` real devuelve `"value":false` sin `defaultValue`, confirmando ambos desajustes. Tests nuevos: interruptor encendido con `value: true` y Guardar deshabilitado; y Guardar vuelve a deshabilitarse si el ajuste regresa a su valor original.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-05

- [x] **[T1-07] Añadir validación Zod al endpoint de configuración** ✅ *(2026-08-07)*
  - **Área:** Código / Seguridad
  - **Ubicación:** `Stockly-B/src/modules/settings/settings.validator.ts` *(nuevo)*, `settings.routes.ts:11`
  - **Qué hacer:** Es el único endpoint mutante sin `validate()`. Un cuerpo `null` provoca un `TypeError` (500) en `Object.entries`, y una forma incorrecta devuelve 200 sin efecto — que es exactamente cómo pasó desapercibido T1-05. Generar el esquema desde `SETTINGS_CATALOG` y aplicarlo con `.strict()`.
    **Implementado.** El esquema se construye recorriendo `SETTINGS_CATALOG` y mapeando cada `type` a su validador, así que **añadir un ajuste nuevo al catálogo lo valida sin tocar el validador**. Todas las claves son opcionales (es un PATCH parcial) pero se exige **al menos una**: un cuerpo vacío también era un 200 sin efecto. Encaja con el frontend tras T1-08, que solo envía los ajustes modificados y deshabilita Guardar cuando no hay ninguno.
  - **Criterio de aceptación:** `PATCH /settings` con `{updates:{...}}` o con un cuerpo no-objeto devuelve 422; con la forma correcta devuelve 200 y persiste.
  - **Verificado localmente (2026-08-07):** 5 tests de integración nuevos, todos en verde — clave fuera del catálogo → **422** (y cero filas escritas), payload antiguo `{updates:{…}}` → **422**, tipo equivocado (`"true"` en vez de `true`) → **422** con `field: "lowStockAlertEnabled"`, cuerpo no-objeto (`[1,2]`) → **422** en lugar de 500, y cuerpo vacío → **422**. `pnpm verify` completo del backend ✅ **209/209**.
  - **Cambio de comportamiento:** el endpoint deja de ser tolerante. El test *«ignora claves desconocidas sin romper»* se sustituyó por su contrario, que es lo que pide esta tarea: un cliente que envíe una clave desconocida ahora recibe 422 en vez de un 200 engañoso.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T1-08] Eliminar el efecto de sincronización de `SettingsPage`** ✅ *(2026-08-07)*
  - **Área:** UI/UX / Código
  - **Ubicación:** `Stockly-F/src/modules/settings/components/SettingsPage.tsx:30-55`
  - **Qué hacer:** ESLint marca `setState` síncrono dentro de un efecto. La dependencia `settings` proviene de `data ?? []`, que crea un array nuevo en cada render mientras la consulta carga, provocando renders en cascada. Derivar el estado en lugar de sincronizarlo: mantener solo un `overrides` de los valores modificados y calcular el valor mostrado y el `isDirty` en render.
    **Implementado** tal cual: un estado `cambios` que solo guarda lo que el usuario ha tocado, y `valorDe()` / `isDirty` derivados en render. Dos mejoras que salen gratis con este diseño: el guardado envía **solo los ajustes modificados** en vez de todo el catálogo, y los cambios se limpian en `onSuccess` para que la respuesta nueva del servidor no siga pisada por el estado local.
  - **Criterio de aceptación:** `pnpm lint` no reporta el error en este archivo; la página no encadena renders durante la carga (verificar con React DevTools Profiler); los tests existentes de `SettingsPage` siguen pasando.
  - **Verificado localmente (2026-08-07):** `eslint` ✅ sin errores en el archivo · los 4 tests existentes siguen pasando, más 3 nuevos (7/7). **No verificado:** el recuento de renders con el Profiler de React DevTools, que exige la app en marcha y medición manual; el efecto que los provocaba ya no existe.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-06

### Calidad estática

- [x] **[T1-09] Dejar `pnpm lint` en verde** ✅ *(2026-08-07)*
  - **Área:** QA
  - **Ubicación:** `Stockly-F/eslint.config.js`, `Stockly-F/src/modules/tags/components/TagsPage.tsx:2,33-40`
  - **Qué hacer:** Quedan **24 errores y 4 avisos** (eran 26 y 4; T1-10 resolvió dos). Desactivar `react-refresh/only-export-components` para `src/routes/**` (23 falsos positivos por los `lazy()`), añadir `coverage/` a los `ignores` —ESLint analiza los artefactos generados, de donde salen 3 de los 4 avisos de directivas `eslint-disable` inútiles—, y resolver el error de `react-hooks` que queda, el de `SettingsPage` (T1-08). Evaluar el aviso de React Compiler en `TagsPage.tsx:37` (`watch("color")` provoca el bailout del componente).
    **Implementado.** `globalIgnores` incluye ahora `coverage`; `react-refresh/only-export-components` queda desactivada solo para `src/routes/**`; y el aviso de React Compiler se resolvió en origen sustituyendo `watch("color")` por `useWatch({ control, name: "color" })` en `TagsPage` — el mismo patrón que ya usaba `ProductForm`. Las 3 directivas `eslint-disable` inútiles no había que tocarlas: estaban en `coverage/`.
  - **Criterio de aceptación:** `pnpm lint` termina con código de salida 0.
  - **Verificado localmente (2026-08-07):** `pnpm lint` → **0 errores, 0 avisos, exit code 0** ✅ (venía de 26 errores y 4 avisos en la auditoría). El componente `TagFormModal` deja además de ser descartado por el React Compiler.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-08 ✅, T1-10 ✅

- [x] **[T1-10] Corregir el `setState` en efecto de `App.tsx` y `ProductForm.tsx`** ✅ *(2026-08-07)*
  - **Área:** Código
  - **Ubicación:** `Stockly-F/src/App.tsx:170-190`, `Stockly-F/src/modules/products/components/ProductForm.tsx:26-53`
  - **Qué hacer:** En `App.tsx`, el cierre del menú móvil al cambiar de ruta puede resolverse con una `key` en el contenedor o comprobando el estado previo antes de actualizar. En `ProductForm.tsx`, el `setSelectedTagIds` dentro del efecto de `reset` puede derivarse de `product` (el componente ya se remonta por `key` desde `ProductsPage:255`).
    **Implementado**, en ambos casos derivando en render y eliminando el efecto entero:
    1. **`App.tsx`.** En lugar de un booleano `mobileOpen` sincronizado con un efecto, se guarda la ruta en la que se abrió el menú (`openedAt`) y el estado se calcula en render: `mobileOpen = openedAt === pathname`. Al navegar deja de coincidir y el menú se cierra solo, venga la navegación de un enlace del menú, del contenido o del historial del navegador.
    2. **`ProductForm.tsx`.** Los valores del producto pasan a `defaultValues` de `useForm` y las etiquetas al inicializador perezoso de `useState`. El `useEffect` de `reset` desaparece por completo. Es correcto porque `ProductsPage:255` ya remonta el formulario con `key={editingProduct?.id ?? "new"}`.
  - **Criterio de aceptación:** ESLint no reporta `react-hooks` en ninguno de los dos archivos; el menú móvil sigue cerrándose al navegar y el formulario sigue precargando las etiquetas al editar.
  - **Verificado localmente (2026-08-07):** `eslint` sobre ambos archivos ✅ **sin errores** · `pnpm check` ✅ · `pnpm test:coverage` ✅ **187/187**. El lint global baja de **26 a 24 errores**. Ninguno de los dos comportamientos estaba cubierto por tests, así que se añadieron **6**: `src/tests/App.test.tsx` (nuevo — abrir/cerrar con la hamburguesa, cierre al navegar desde **fuera** del menú, cierre al pulsar un enlace del menú) y tres en `ProductForm.test.tsx` (precarga de campos, precarga de etiquetas y su envío al actualizar, alta y baja de etiquetas sobre las precargadas). La cobertura de sentencias sube de 19.88 % a **23.83 %**.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Autenticación y autorización

- [x] **[T1-11] Comprobar `isActive` en `requireAuth`** ✅ *(2026-08-07)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/middlewares/auth.middleware.ts:14-38`
  - **Qué hacer:** El middleware solo selecciona `id` y `role`, por lo que un usuario desactivado conserva acceso durante toda la vida de su access token (15 min). Añadir `isActive` al `select` y devolver 403 si es falso. Aprovechar el mismo cambio para incluir `email` (ver T1-13).
  - **Criterio de aceptación:** desactivar un usuario desde el panel de administración invalida inmediatamente sus peticiones (403), sin esperar a que expire el token.
  - **Verificado localmente (2026-08-07):** test nuevo — `GET /auth/me` responde 200, se desactiva la cuenta en base de datos y **la misma cookie pasa a devolver 403** al instante, con el mensaje «Tu cuenta está desactivada».
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T1-12] Comprobar `isActive` también en el endpoint de refresh** ✅ *(2026-08-07)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/modules/auth/auth.service.ts:88-99`
  - **Qué hacer:** Defensa en profundidad: `refresh` no valida `isActive` ni `isVerified`. Aunque `setActive(false)` ya anula el refresh token (`users.service.ts:63-68`), la comprobación explícita cubre cualquier ruta futura de desactivación.
  - **Criterio de aceptación:** un refresh token válido de un usuario con `isActive: false` (modificado directamente en base de datos) devuelve 401.
  - **Verificado localmente (2026-08-07):** test nuevo que desactiva la cuenta **por una vía que no limpia el refresh token** —una escritura directa en base de datos, justo el hueco que cubre esta defensa— y comprueba que `POST /auth/refresh` devuelve 401.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T1-13] Centralizar `getActorEmail` y eliminar la consulta redundante** ✅ *(2026-08-07)*
  - **Área:** Refactorización / Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.controller.ts:7-13`, `sale-orders/sale-orders.controller.ts:7-13`, `purchase-orders/purchase-orders.controller.ts:7-13`
  - **Qué hacer:** La misma función está copiada literalmente tres veces, usa un `await import()` dinámico innecesario y ejecuta una consulta extra a la base de datos en **cada mutación**. Cargar el email en `requireAuth`, exponerlo como `req.userEmail` (declarándolo en la interfaz global de `Request`) y borrar las tres copias.
  - **Criterio de aceptación:** las tres funciones locales desaparecen; los registros de `AuditLog` siguen conteniendo `userEmail`; los tests de auditoría siguen pasando.
  - **Verificado localmente (2026-08-07):** las tres copias eliminadas y **12 llamadas** sustituidas por `req.userEmail` — eran 12 consultas extra a base de datos, una por cada mutación. Test nuevo: crear un producto por HTTP deja el `AuditLog` con el email correcto del actor. Los tests de auditoría siguen pasando.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-11

- [x] **[T1-14] Vincular los mensajes de error de formulario a sus campos** ✅ *(2026-08-07)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/shared/components/Input.tsx:9-42`, `Stockly-F/src/shared/components/Select.tsx:12-58`
  - **Qué hacer:** El error se pinta en un `<p>` sin relación programática con el campo, y el único indicador visual es el color del borde. Añadir `aria-invalid`, `aria-describedby` apuntando a un `<p id={`${id}-error`} role="alert">`. Estos dos componentes son la base de **todos** los formularios de la aplicación, así que la corrección se propaga sola.
  - **Criterio de aceptación:** enviar un formulario inválido hace que el lector de pantalla anuncie el mensaje de error asociado al campo enfocado; `Input.test.tsx` y `Select.test.tsx` incluyen aserciones de `aria-invalid` y `aria-describedby`.
  - **Verificado localmente (2026-08-07):** 6 tests nuevos (3 por componente) con `aria-invalid`, `aria-describedby`, `toHaveAccessibleDescription` y `role="alert"`, más el caso negativo: **sin error no queda ningún atributo ARIA residual**, que es tan importante como el positivo — un `aria-invalid="false"` permanente confunde igual. El `id` del mensaje se deriva del `id` del campo (`${id}-error`), así que la corrección se propaga sola a todos los formularios de la aplicación.
    **No verificado:** el anuncio real en un lector de pantalla; se comprueba la semántica que lo hace posible, no la locución.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Base de datos y robustez

- [x] **[T1-15] Añadir los índices ausentes en la base de datos** ✅ *(2026-08-07)*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/prisma/schema.prisma` (completo), nueva migración
  - **Qué hacer:** No existe **ningún** índice no-único en el esquema; PostgreSQL no los crea automáticamente sobre las claves foráneas. Añadir: `StockMovement([productId, createdAt])` y `([createdAt])`, `PriceHistory([productId])`, `SaleOrderItem([saleOrderId])` y `([productId])`, `PurchaseOrderItem([purchaseOrderId])` y `([productId])`, `Product([categoryId])`, `([brandId])`, `([supplierId])`, `([isActive])`, `AuditLog([createdAt])` y `([entity, action])`, `SaleOrder([status, createdAt])`, `PurchaseOrder([status, createdAt])`.
  - **Criterio de aceptación:** `EXPLAIN ANALYZE` sobre `SELECT * FROM stock_movements WHERE "productId" = $1 ORDER BY "createdAt"` pasa de `Seq Scan` a `Index Scan`; la migración aplica limpiamente y la suite del backend sigue en verde.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-07):** migración `20260807215703_add_missing_indexes`, **15 índices**, aplicada limpiamente. `EXPLAIN (ANALYZE, BUFFERS)` sobre datos sintéticos (40 000 movimientos, 40 000 registros de auditoría, 40 000 productos en 50 categorías):

    | Consulta | Antes | Después | |
    |---|---|---|---|
    | `stock_movements WHERE "productId" = $1 ORDER BY "createdAt"` | `Seq Scan`, **5.709 ms**, 617 buffers | `Bitmap Index Scan`, **0.747 ms**, 205 buffers | **7,6×** |
    | `audit_logs ORDER BY "createdAt" DESC LIMIT 50` | `Seq Scan` + `top-N heapsort`, **7.857 ms**, 455 buffers | `Index Scan Backward`, **0.110 ms**, 3 buffers | **71×** |
    | `products WHERE "categoryId" = $1 ORDER BY "createdAt" DESC LIMIT 10` | `Seq Scan`, **8.807 ms** | `Bitmap Index Scan`, **1.665 ms** | **5,3×** |

    `pnpm verify` completo ✅ **235/235**, cobertura 88.15 %, smoke ✅.

    **No aprovechado:** `products_isActive_idx`. La consulta dominante filtra `isActive = true`, que es la mayoría de las filas, así que el planificador sigue eligiendo `Seq Scan` — correctamente. Se deja porque el roadmap lo pedía y sirve al filtro inverso (`?isActive=false`), pero su coste de escritura no se compensa con la distribución actual: candidato a revisar, o a convertir en índice parcial `WHERE "isActive" = false`.

    **Fuera del alcance de la lista:** `products` no tiene índice por `createdAt` pese a que **todos** los listados ordenan por ese campo. La lista de la auditoría no lo incluía; queda anotado para T2-03 o una tarea propia.

- [x] **[T1-16] Sanear los parámetros de paginación para eliminar los 500** ✅ *(2026-08-07)*
  - **Área:** Código
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:37-38`, `users/users.service.ts:17-19`, `audit-logs/audit-logs.service.ts:43-45`, `sale-orders/sale-orders.service.ts:23-25`
  - **Qué hacer:** `parseInt("abc")` es `NaN` y `Math.max(1, NaN)` sigue siendo `NaN`, que llega a Prisma como `skip`/`take` y provoca un 500. Extraer un helper `parsePagination` en `shared/lib/` que use `Number.parseInt(...) || valorPorDefecto` y aplicarlo en los cuatro servicios.
  - **Criterio de aceptación:** `GET /api/v1/products?page=abc`, `?limit=abc`, `/users?page=xyz` y `/audit-logs?limit=nope` devuelven 200 con la paginación por defecto. Verificado hoy: los cuatro devuelven 500.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-07):** 12 tests nuevos en `src/tests/pagination.test.ts` — 7 unitarios del helper y 5 de HTTP contra los endpoints reales, todos **200 con la paginación por defecto** (`products?page=abc`, `products?limit=abc`, `users?page=xyz`, `audit-logs?limit=nope` y `sale-orders?page=abc`). `pnpm verify` completo ✅ **235/235**, cobertura **88.15 %**; el helper queda al **100 %**. Se acota además `page` a 1 000 000: sin ese techo, `?page=99999999999999` desborda el entero de 32 bits de PostgreSQL y vuelve a dar 500 por otra vía.

### Interfaz

- [x] **[T1-17] Reinicializar el formulario al editar una etiqueta** ✅ *(2026-08-07)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/tags/components/TagsPage.tsx:157`
  - **Qué hacer:** `TagFormModal` está montado de forma permanente y `useForm` solo aplica `defaultValues` en el primer montaje, por lo que editar una etiqueta abre el modal con el nombre vacío. Añadir `key={editingTag?.id ?? "new"}`, el mismo patrón que ya usan `ProductsPage:255`, `SuppliersPage:183` y `CatalogItemSection:180`.
  - **Criterio de aceptación:** pulsar «Editar» en una etiqueta abre el modal con su nombre y su color precargados; pulsar «Nueva etiqueta» a continuación abre el modal vacío.
  - **Verificado localmente (2026-08-07):** `TagsPage.test.tsx` nuevo con 3 tests — precarga al editar, cambio de una etiqueta a otra sin arrastrar datos de la anterior, y modal vacío al crear después de editar.
    **De paso:** los botones de editar y eliminar eran solo icono, sin nombre accesible — un lector de pantalla anunciaba «botón» sin decir sobre qué etiqueta. Añadido `aria-label` («Editar Oferta», «Eliminar Oferta»), que además era la única forma de localizarlos de manera robusta en el test.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T1-18] Guardia de rol en las rutas de administración del frontend** ✅ *(2026-08-07)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/shared/components/ProtectedRoute.tsx:9-33`, `Stockly-F/src/routes/index.tsx:70-79`
  - **Qué hacer:** `ProtectedRoute` solo comprueba que exista sesión. Un usuario con rol `USER` que abra `/settings`, `/audit-logs` o `/admin/users` por URL directa ve una página rota con toasts de 403 (el backend sí protege correctamente). Añadir una prop `requireRole` que redirija a `/` cuando el rol no coincida, y aplicarla a las tres rutas.
  - **Criterio de aceptación:** un usuario `USER` que navegue a `/admin/users` es redirigido al dashboard sin peticiones fallidas; un `ADMIN` accede con normalidad.
  - **Verificado localmente (2026-08-07):** 3 tests nuevos en `ProtectedRoute.test.tsx` — un `USER` en `/admin/users` acaba en el dashboard, un `ADMIN` ve la página, y sin `requireRole` sigue bastando con tener sesión. La redirección va al **dashboard, no al login**: la sesión es válida, lo que falta es el permiso. Aplicado a `/audit-logs`, `/settings` y `/admin/users`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Endurecimiento

- [x] **[T1-19] Sustituir la exención CSRF por prefijo por una lista explícita** ✅ *(2026-08-07)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/middlewares/csrf.middleware.ts:25-28`
  - **Qué hacer:** `req.path.startsWith("/api/v1/auth/")` exime también `POST /auth/logout`, `PUT /auth/me` y `PATCH /auth/me/password`, que son operaciones autenticadas y mutantes. La explotación práctica está limitada por el preflight CORS, salvo en `logout`, que es vulnerable a CSRF por formulario cross-site. Sustituir por un `Set` con las siete rutas públicas reales.
  - **Criterio de aceptación:** `PUT /api/v1/auth/me` sin cabecera `x-csrf-token` devuelve 403 con `NODE_ENV != test`; login, register, refresh, verify-email, resend-verification, forgot-password y reset-password siguen funcionando sin token.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-07):** 10 tests nuevos en `csrf.test.ts` — las tres rutas autenticadas (`POST /auth/logout`, `PUT /auth/me`, `PATCH /auth/me/password`) devuelven **403** sin token, y las siete públicas siguen pasando sin él. El frontend ya adjuntaba `x-csrf-token` en toda petición mutante (`shared/api/axios.ts:30-37`), así que endurecer no rompió ningún flujo: comprobado antes de tocar nada.

- [x] **[T1-20] Exigir TLS en el transporte SMTP** ✅ *(2026-08-07)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/lib/nodemailer.ts:20-24`
  - **Qué hacer:** Sin `secure` ni `requireTLS`, Nodemailer usa STARTTLS de forma oportunista y continúa en claro si el servidor no lo anuncia — exponiendo credenciales SMTP y los tokens de verificación y reset que viajan en los correos. Añadir `secure: env.smtp.port === 465` y `requireTLS: true`.
  - **Criterio de aceptación:** el envío contra un servidor sin STARTTLS falla con error en lugar de transmitir en claro; el envío contra el SMTP habitual sigue funcionando.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-07):** `smtp-tls.test.ts` levanta un servidor SMTP de mentira que no anuncia STARTTLS y lo rechaza con `502`. Con `requireTLS`, el envío **aborta con `ETLS`**; sin él, contra ese mismo servidor, **el correo sale en claro y es aceptado** — el contraste está escrito como tercer test, que es lo que demuestra que la corrección hace algo. Tercer caso: la configuración real del transporte declara `requireTLS: true` y `secure` solo en el puerto 465.
    **No verificado:** el envío contra el SMTP real de producción; requiere credenciales que no están en esta máquina.

- [x] **[T1-21] Ejecutar el contenedor con un usuario sin privilegios** ✅ *(implementada 2026-08-07 · **verificada por ejecución 2026-08-09**)*
  - **Área:** Seguridad / DevOps
  - **Ubicación:** `Stockly-B/Dockerfile:19-37`
  - **Qué hacer:** El stage runner nunca cambia de usuario, por lo que Node corre como root. Añadir `USER node` antes del `CMD` y ajustar la propiedad de `/app` con `COPY --chown=node:node`.
  - **Criterio de aceptación:** `docker exec stockly_backend id` devuelve `uid=1000(node)` y el contenedor arranca y sirve peticiones con normalidad.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-02
  - **Implementado (2026-08-07):** en el stage runner, `COPY --chown=node:node` en las cuatro copias, `RUN chown -R node:node /app` —`pnpm install` corre como root y deja `node_modules` y su caché a su nombre— y `USER node` antes del `CMD`.
  - ~~**NO VERIFICADO:** el criterio de aceptación exige ejecutar el contenedor y **el daemon de Docker no está disponible en esta máquina**.~~ **Verificado el 2026-08-09**, con Docker ya en marcha (motor 29.6.2):
    - `docker exec stockly_backend id` → **`uid=1000(node) gid=1000(node) groups=1000(node)`**, el criterio literal.
    - Los procesos del contenedor corren como `node`, incluido el PID 1.
    - `/api/v1/health` responde 200: el contenedor sirve peticiones con normalidad.
    - **`prisma migrate deploy` funciona sin privilegios**, que era la duda de fondo: las **10** migraciones se aplican al arrancar, incluida la de T2-09 con su `CREATE EXTENSION pg_trgm`. Comprobado en la base del contenedor: la extensión existe y `products_name_idx` está creado como `gin (name gin_trgm_ops)`.

- [x] **[T1-22] Retirar la promoción automática a ADMIN del primer usuario** ✅ *(2026-08-07)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/modules/auth/auth.service.ts:16-30`, `Stockly-B/README.md` (sección Seed)
  - **Qué hacer:** `userCount === 0 ? "ADMIN" : "USER"` convierte en administrador al primer visitante que se registre en un despliegue sin seed, y tiene una condición de carrera (dos registros concurrentes leen ambos `count() === 0`). Crear el administrador inicial exclusivamente por seed o por un comando de bootstrap explícito. Si se conserva, envolver comprobación y creación en una transacción `Serializable`.
    **Implementado por la vía limpia:** el rol se fija a `"USER"` y desaparece el `count()`. Sin consulta previa no hay carrera que resolver, así que no hizo falta la transacción `Serializable`. El administrador inicial sale del seed, que ya creaba dos (`admin@` y `carlos@`), y para promover a alguien existe `PATCH /api/v1/users/:id/role` — ambos verificados antes de escribirlo.
  - **Criterio de aceptación:** el registro público siempre crea usuarios con rol `USER`; el seed sigue generando el administrador; hay un test que verifica el rol del primer usuario registrado.
  - **Verificado localmente (2026-08-07):** test nuevo sobre el **primer** registro de una base recién limpiada —el caso exacto que antes daba ADMIN— comprobando `count() === 1` y `role === "USER"`. Backend **223/223**.
  - **Consecuencia operativa:** en un despliegue nuevo **nadie es administrador hasta ejecutar el seed**. Documentado en el README del backend, donde de paso se corrigió que el seed crea 3 usuarios y no 2 (dato erróneo, del ámbito de T1-25).
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Red de seguridad E2E

- [x] **[T1-23] Ampliar el smoke E2E a los flujos que estaban rotos** ✅ *(2026-08-07)*
  - **Área:** QA
  - **Ubicación:** `Stockly-F/e2e/smoke.spec.ts`
  - **Qué hacer:** Los tres defectos funcionales de esta auditoría no produjeron ningún fallo entre 379 tests, porque cada repositorio prueba contra su propia suposición del contrato. Añadir escenarios que crucen la frontera: (a) activar el interruptor de configuración, recargar y comprobar que sigue activo; (b) crear un producto con una etiqueta y verificar que aparece en el detalle y en el filtro por etiqueta; (c) crear una orden de venta, enviarla, cancelarla y comprobar que el stock del producto vuelve al valor inicial.
  - **Criterio de aceptación:** los 3 escenarios pasan contra la aplicación completa, y fallan si se revierte T0-03, T1-03 o T1-05.
  - **Esfuerzo:** medio
  - **Depende de:** T0-03, T1-03, T1-05, T1-24
  - **Verificado localmente (2026-08-07):** `e2e/flows.spec.ts` con los tres escenarios, más `e2e/helpers.ts`. **`pnpm test:e2e:full` → 9 pasados, 1 omitido, 0 fallos** contra la aplicación completa (backend + frontend + PostgreSQL reales), en los proyectos `chromium` y `Mobile Chrome`.
    El escenario de la venta cancelada tiene una salvedad: **la interfaz solo ofrece cancelar mientras la orden está PENDIENTE**, así que la cancelación de una orden ya enviada —el caso exacto que arregló T0-03— se hace por API con la sesión del navegador. La creación y el envío sí pasan por la interfaz. Esa carencia de la UI queda anotada como hallazgo nuevo.
    El escenario de configuración se ejecuta solo en `chromium`: `AppSetting` es estado global y los dos proyectos, en paralelo, leían el cambio del otro.
    **Encontrados por el camino, y corregidos:** el modal no tenía scroll propio (un formulario más alto que la ventana dejaba sus botones fuera de pantalla, inalcanzables), y `Input`/`Select` no asociaban la etiqueta cuando no se les pasaba `id`, así que varios campos no tenían nombre accesible.

- [x] **[T1-24] Hacer reproducible la ejecución del E2E** ✅ *(2026-08-07)*
  - **Área:** QA / DevOps
  - **Ubicación:** `Stockly-F/playwright.config.ts:21-26`
  - **Qué hacer:** El `webServer` solo arranca el frontend; el backend y la base de datos hay que levantarlos a mano, y la credencial por defecto no coincide con el seed. Añadir un `globalSetup` o un script `test:e2e:full` que orqueste `docker compose up -d db` + `db:migrate` + `db:seed` + backend + frontend, y usar la credencial del seed. Añadir el proyecto `Mobile Chrome` de Playwright para cubrir de paso los hallazgos responsive.
  - **Criterio de aceptación:** `pnpm test:e2e:full` pasa en local desde un checkout limpio sin pasos manuales previos.
  - **Esfuerzo:** medio
  - **Depende de:** T0-06
  - **Verificado localmente (2026-08-07):** `pnpm test:e2e:full` **pasa sin levantar nada a mano** — 9 pasados, 1 omitido. `e2e/global-setup.ts` comprueba que PostgreSQL responda (y solo si no responde recurre a `docker compose up -d db`, esperando hasta 60 s), aplica `prisma migrate deploy` y siembra con `db:seed`; el `webServer` de Playwright arranca **backend y frontend**, reutilizando los que ya estén en marcha. Proyecto `Mobile Chrome` añadido.
    **Hallazgo:** el rate limit global (100 peticiones / 15 min por IP) se agota en una sola pasada del navegador y devolvía **429** en pruebas que no iban de eso — incluida la comprobación de salud del `webServer`. Se añadieron `RATE_LIMIT_MAX` y `AUTH_RATE_LIMIT_MAX` para subir el techo en el E2E **sin desactivar el limitador ni CSRF**, que siguen activos durante toda la ejecución.
    La credencial ya era la del seed desde T1-02; el `.env` del backend se lee a mano en el global setup para no añadir `dotenv` al frontend.

### Documentación bloqueante

- [x] **[T1-25] Corregir las rutas de API y el stack en los READMEs** ✅ *(2026-08-07)*
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/README.md`, `README.md` (raíz)
  - **Qué hacer:** Seis divergencias verificadas contra el código: el prefijo real es `/api/v1` y no `/api`; Swagger está en `/api/v1/docs` y no en `/api-docs`; el cambio de contraseña es `PATCH /me/password` y no `PUT`; `config/env.ts` usa validación manual y no Zod; la imagen Docker es `node:22-alpine` mientras el README indica Node 20.
  - **Criterio de aceptación:** cada ruta y afirmación del README puede comprobarse contra el código; una prueba manual con curl siguiendo el README funciona.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-07):** las seis divergencias corregidas contra el código, una por una: prefijo `/api/v1` en las **once** secciones de endpoints (`app.ts:45`), Swagger en `/api/v1/docs` y **solo fuera de producción** (`swagger.ts:209`, `app.ts:47-49`), `PATCH /me/password` (`auth.routes.ts:28`), `env.ts` con validación manual y no Zod, y `node:22-alpine` en las dos etapas del `Dockerfile`. Se añadieron `pnpm verify` y `pnpm smoke`, que no estaban documentados. No queda ninguna coincidencia de `/api/` sin versionar ni de `api-docs` en los dos READMEs.
    **Nota:** el «README de la raíz» que citaba la auditoría no existe en este equipo; su papel lo cumple `docs/README-proyecto.md`, donde se corrigió la misma ruta de Swagger.

- [x] **[T1-26] Resolver la contradicción sobre las variables de entorno obligatorias** ✅ *(2026-08-07)*
  - **Área:** Documentación / Código
  - **Ubicación:** `Stockly-B/README.md`, `Stockly-B/src/config/env.ts:4-17`, `Stockly-B/.env.example`
  - **Qué hacer:** El README afirma que «Cloudinary y SMTP son opcionales en desarrollo», pero `validateEnv()` exige las ocho variables y lanza una excepción al arrancar. Es un bloqueador real de puesta en marcha. Decidir: o marcarlas como obligatorias en la documentación, o —preferible— sacarlas del array `required` y fallar solo al invocar la funcionalidad correspondiente, con un mensaje claro.
  - **Criterio de aceptación:** seguir el README desde un checkout limpio permite arrancar el backend; el comportamiento documentado coincide con el real. Anotar en `.env.example` qué variables son imprescindibles.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Resuelto por la vía preferible:** `required` baja de doce variables a **cuatro** (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`). Cloudinary y SMTP pasan a grupos opcionales con un `configured` calculado, y el fallo se traslada al punto de uso: **503 con el nombre de las variables que faltan**. Un grupo a medias avisa por consola al arrancar, porque casi siempre es un despiste.
  - **Verificado localmente (2026-08-07):** 7 tests nuevos — `validateEnv()` no lanza sin ninguna de las ocho variables opcionales, avisa cuando un grupo queda incompleto y calla cuando está completo; y las tres funciones de correo y las dos de Cloudinary rechazan con **503** nombrando la variable que falta. `.env.example` reescrito en tres bloques (imprescindibles / con valor por defecto / opcionales por grupo). El README y `CLAUDE.md` decían «doce variables»: corregido en ambos.

---

## Tier 2 — Mejoras sustanciales

### Rendimiento

- [x] **[T2-01] Middleware 404 con respuesta JSON** ✅ *(2026-08-09)*
  - **Área:** Código
  - **Ubicación:** `Stockly-B/src/shared/middlewares/notFound.middleware.ts` (nuevo), `Stockly-B/src/app.ts:74`
  - **Qué hacer:** Las rutas desconocidas devuelven la página HTML de error de Express (`<!DOCTYPE html>...Cannot GET`), rompiendo el sobre `{success, message}` que usa el resto de la API. Insertar un middleware 404 entre el router y el `errorHandler`.
  - **Criterio de aceptación:** `GET /api/v1/ruta-inexistente` devuelve 404 con `{ "success": false, "message": "..." }` y cabecera `application/json`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** `verify` ✅ **280/280** (5 tests nuevos) y comprobado **contra el servidor en marcha**, no solo con supertest: `GET /api/v1/ruta-que-no-existe` → `content-type: application/json` y `{"success":false,"message":"Ruta no encontrada: GET /api/v1/ruta-que-no-existe"}`. Fuera de `/api/v1` igual.
  - **El código de estado ya era 404 antes:** lo roto era el **formato**, y por eso `health.test.ts` daba el caso por cubierto —solo comprobaba el estado— mientras la respuesta seguía siendo una página HTML. Un cliente que hace `res.json()` con ella falla con «Unexpected token <», un error que no menciona en ningún momento que la ruta no exista: el fallo de integración más común disfrazado del menos informativo.
  - **No formatea, lanza.** Un `HttpError(404)` que recoge `errorHandler`, para que el sobre siga escribiéndose en un único sitio y el 404 quede registrado por el mismo camino que los demás errores, con su `requestId`.
  - **Va después de Swagger, no solo del router:** lo que se monte más tarde nunca llegaría a verse.
  - **Falsificado** comentando el `app.use`: caen 4 de los 5 tests, y el que sobrevive es justamente «las rutas que sí existen siguen respondiendo».
  - **Un caso del test se corrigió al comprobarlo contra el servidor real:** empezó siendo `DELETE /api/v1/health`, que en jest da 404 pero en producción **no llega hasta aquí** —la protección CSRF va antes del router y lo corta con un 403; en tests el CSRF se omite—. Se sustituyó por `GET /api/v1/auth/login`, verbo no mutante sobre una ruta que solo existe para POST, que se comporta igual en los dos sitios.

- [x] **[T2-02] Bajar a SQL los agregados del resumen de reportes** ✅ *(2026-08-09)*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/reports/reports.service.ts:19-49,73-77,105-118`
  - **Qué hacer:** Un `findMany` sin `take` carga todos los productos activos en memoria para calcular el valor de inventario y los totales por categoría en JavaScript, junto a cinco consultas SQL crudas que sí están optimizadas. Es la consulta que alimenta el dashboard, la primera pantalla tras el login. Sustituir por `GROUP BY` con `SUM(price*stock)` y `COUNT(*) FILTER (WHERE stock <= "minStock")`.
  - **Criterio de aceptación:** `GET /api/v1/reports` devuelve exactamente los mismos valores que hoy (la cobertura de `reports.service.ts` es del 100 %, sirve de red) y ya no materializa el catálogo en el proceso Node.
  - **Esfuerzo:** medio
  - **Depende de:** T1-15
  - **Verificado localmente (2026-08-09):** con **40 000 productos activos**, `getSummary()` pasa de **200.4 ms a 27.3 ms** de mediana (5 pasadas tras calentamiento) y el heap de **178.9 MB a 32.8 MB**. `verify` ✅ **301/301** (3 tests nuevos); `reports.service.ts` mantiene el **100 %** de sentencias.
  - **La equivalencia se comprobó comparando las dos respuestas completas**, no confiando en los tests: se capturó el JSON con la versión anterior (`git stash`), se restauró la nueva y se compararon. `totals` idéntico, `stockByCategory` con **el mismo contenido**, y `topByValue`, `movementsByMonth`, `lowStockProducts` y `stockMetrics` byte a byte iguales.
  - **Lo único que cambia es el orden de `stockByCategory`,** y es a mejor: antes lo daba el recorrido del `findMany`, o sea el que quisiera la base, así que dos cargas seguidas podían pintar el gráfico distinto. Ahora es `ORDER BY value DESC`, determinista. Comprobado en el dashboard real: mismos KPIs (`$2,211,974.00`, 52/48/4/8) y las barras descendiendo por valor.
  - **`COUNT(*) FILTER (WHERE …)`** deja el recuento de stock bajo en la misma pasada que la suma del valor, en vez de recorrer el catálogo dos veces en JavaScript. Y `SUM` sobre `numeric` suma en **decimal exacto**, en lugar de acumular error de coma flotante producto a producto.
  - **Tres tests para los bordes que el bucle resolvía sin querer** y que son fáciles de perder al traducir: los productos sin categoría se agrupan bajo «Sin categoría» (el `COALESCE` sobre el `LEFT JOIN`), el orden por valor es descendente, y los inactivos no cuentan ni para el valor ni para el desglose — el `WHERE "isActive" = true` va ahora repetido en cada agregado, y olvidarlo en uno solo lo desviaría todo. **Falsificados** contra la implementación anterior: dos de los tres fallan con ella.

- [x] **[T2-03] Paginar el listado de órdenes de compra en el backend** ✅ *(2026-08-07)*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/purchase-orders/purchase-orders.service.ts:13-18`
  - **Qué hacer:** `getAll()` no tiene `skip`/`take` y arrastra el detalle completo de cada ítem — es la única lista de la API sin techo. Replicar el patrón de `saleOrderService.getAll` (`sale-orders.service.ts:22-36`), incluyendo el objeto `meta`.
  - **Criterio de aceptación:** `GET /api/v1/purchase-orders?page=2&limit=5` devuelve 5 elementos y `meta` con `total`, `page`, `limit` y `totalPages`.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-16
  - **Verificado localmente (2026-08-07):** 6 tests nuevos — el criterio literal (`?page=2&limit=5` → 5 elementos y `meta` completo con `total: 12` y `totalPages: 3`), que las páginas **no repiten órdenes**, el filtro por estado, que un estado inventado se ignora en vez de romper, y que `?page=abc` cae a la paginación por defecto en vez de dar 500. Ya no queda ninguna lista sin techo en la API. Se replicó también el `parseStatusFilter` de las órdenes de venta, así que ambos módulos son ahora simétricos.

- [x] **[T2-04] Adaptar el frontend a la respuesta paginada de órdenes de compra** ✅ *(2026-08-07)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/purchase-orders/hooks/usePurchaseOrders.ts`, `components/PurchaseOrdersPage.tsx`
  - **Qué hacer:** Consumir la nueva forma `{ data, meta }` y añadir los controles de paginación, igual que en `ProductsPage:240-252`.
  - **Criterio de aceptación:** la página muestra la paginación y navega entre páginas correctamente.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-03
  - **Verificado localmente (2026-08-07):** `PurchaseOrdersPage.test.tsx` nuevo, 4 tests con 23 órdenes simuladas: la cabecera muestra el **total del servidor** y no el número de filas de la página, los controles indican «Página 1 de 3» con «Anterior» deshabilitado, pulsar «Siguiente» **pide `{ page: 2, limit: 10 }` al servidor** —no recorta en cliente, que es lo que el test vigila— y la última página deshabilita «Siguiente» y muestra solo las 3 restantes.
    La clave de React Query incluye los parámetros, así que cada página se cachea por separado y las invalidaciones por prefijo siguen funcionando. Borrar la última orden de una página retrocede a la anterior, resuelto en el propio manejador del evento para no añadir un `setState` en efecto (ver T1-10).
    **Encontrado por el camino:** el contador decía «ordenes», sin tilde, porque el plural se construía concatenando `"es"`. Corregido.

- [x] **[T2-05] Exportaciones por lotes y en streaming** ✅ *(2026-08-09)*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/shared/lib/exportacion.ts` (nuevo), `products/product.service.ts`, `sale-orders/sale-orders.service.ts`, `purchase-orders/purchase-orders.service.ts` y sus tres controladores
  - **Qué hacer:** Los tres `exportAll()` cargan la tabla completa y `buildCsv` concatena todo en una sola cadena antes de enviarla. Paginar con cursor y escribir el CSV en streaming sobre `res`, enviando primero la cabecera. Añadir un tope duro configurable como red de seguridad.
  - **Criterio de aceptación:** exportar 50 000 productos no dispara el uso de memoria del proceso por encima de un umbral razonable y el archivo resultante es idéntico al actual para conjuntos pequeños.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** con **50 000 productos**, el servidor real entrega **3.58 MB y 50 053 líneas en 4.0 s**. `verify` ✅ **308/308** (7 tests nuevos).
  - **La prueba de memoria buena no es el pico de heap, y el primer intento se quedó corto.** Medido sin restricción, el pico apenas bajaba (105.2 → 92.5 MB), porque `heapUsed` cuenta también la basura que V8 aún no ha recogido y no distingue lo vivo de lo suelto. **Con el heap limitado a 48 MB la diferencia es categórica:** la forma anterior muere con `FATAL ERROR: Reached heap limit`; la nueva **termina en 4.2 s con un pico de 42.5 MB**.
  - **El tamaño de lote es el parámetro que fija ese techo,** no un ajuste fino. Con el mismo límite de 48 MB: 500 → 4272 ms y 42.6 MB; 1000 → 3151 ms y 46.4 MB; **2000 y 5000 se quedan sin memoria**. Se elige **500** aunque 1000 sea un 25 % más rápido: la tarea va de acotar la memoria y 1000 deja el pico a 2 MB del límite. Una exportación es una descarga en segundo plano, y el segundo que se gana no compensa medio margen.
  - **Cuesta más tiempo, y eso se dice:** 832 ms → 4.0 s para 50 000 filas, porque son 100 consultas con sus *joins* en vez de una. Es el precio de no tener el archivo entero en memoria, y con el catálogo real (52 productos) la exportación tarda **63 ms**.
  - **El JSON también se transmite por partes.** La ficha hablaba del CSV, pero `res.json({ data: rows })` tenía exactamente el mismo problema, así que se construye el sobre a mano alrededor del array.
  - **Contrapresión, o el streaming no sirve de nada:** escribir en bucle sobre una respuesta más lenta que la base acumula en el búfer del socket justo lo que se quería evitar. Se espera a `drain` cuando `res.write` devuelve `false`.
  - **El tope se comprueba antes del primer byte** y responde 413. Después de enviar la cabecera ya no se puede responder un error: solo quedaría cortar el archivo por la mitad y que el usuario se llevara una exportación incompleta creyéndola buena. Hay un test que comprueba que **no se escribió nada** al rechazar. El tope es de **filas del archivo**, no de registros: una orden con veinte líneas son veinte filas, así que las dos exportaciones de órdenes cuentan ítems.
  - **La igualdad del archivo se comprueba contra `buildCsv`**, que es la función que lo generaba antes: si el escapado fila a fila cambiara una coma, una comilla o el orden de las columnas, el test lo caza. Incluye un producto cuyo nombre empieza por `=` para que la protección contra inyección de fórmulas siga aplicándose.
  - **Salvedad honesta sobre el desempate por `id` del cursor:** se añade para que el orden sea total y la paginación no dependa de que Postgres devuelva el mismo orden arbitrario en cada página. **No he conseguido falsificarlo**: quitándolo, los tests siguen pasando, incluido el de 600 filas con el mismo `createdAt`. Se queda como garantía por construcción, no como corrección de un fallo reproducido, y así está anotado en el código.
  - **Un fallo propio de la limpieza del test**, que conviene no repetir: `deleteMany({ name: { startsWith: "T205-" } })` no borraba el producto llamado `=T205-dos`, y contaminaba los tres tests siguientes. Se arregla con `contains`.
  - **Los 50 000 productos de banco se borraron** al terminar (52, como antes).

- [x] **[T2-06] Reducir el chunk `vendor` del frontend** ✅ *(2026-08-09)* — *criterio cumplido a medias, ver abajo*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-F/vite.config.ts:19-50`
  - **Qué hacer:** Medido: `vendor` pesa 549.93 kB (170.86 kB gzip) y se carga en todas las rutas, incluida la de login — ~680 kB sin comprimir de JavaScript para pintar un formulario. Separar `vendor-react` y `vendor-forms` (react-hook-form + @hookform + zod) del resto, y reducir `@fontsource/inter` a los pesos realmente usados.
  - **Criterio de aceptación:** ningún chunk supera los 250 kB sin comprimir y `vite build` no emite el aviso de tamaño.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** el JavaScript del arranque —lo que hay que descargar para pintar el login— pasa de **697.3 kB a 474.9 kB (−32 %)**, y `vite build` **ya no emite el aviso de tamaño** (el trozo mayor es 391 kB, por debajo del umbral de 500). `verify` ✅ **389/389**.
  - **El criterio de los 250 kB NO se cumple** y no se disimula: quedan `vendor` en 331 kB y `vendor-charts` en 391 kB. Lo que sigue explica por qué perseguirlo empeoraba la aplicación.
  - **Separar `vendor-react`, que es lo que pedía la ficha, es contraproducente aquí.** Medido con cuatro variantes construidas y comparadas por el JavaScript del arranque:

    | Variante | Arranque | ¿recharts diferido? |
    |---|---:|---|
    | Como estaba | 697.3 kB | sí |
    | **+ `vendor-forms`** | **599.2 kB** | sí |
    | + `vendor-react` | 956.0 kB | **no** |
    | + ambos | 857.9 kB | **no** |

    En cuanto React sale a su propio trozo, `vendor-charts` **entra en el arranque**: el grafo de trozos gana un ciclo entre React y quien lo importa, y rolldown resuelve metiendo las gráficas en la carga inicial. Lo mismo separando solo `react-dom` (856.9 kB). Se descartó con la medición delante, no por intuición.
  - **Lo que sí funciona es separar recharts *y todo lo que existe solo por él*:** `@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`, `es-toolkit`, `decimal.js-light`, `victory-vendor` y los `d3-*` no los usa esta aplicación — son dependencias de recharts, y estaban en `vendor`, que se descarga siempre. Sacarlas baja el arranque de 599.2 a **474.9 kB** manteniendo las gráficas diferidas, porque las rutas que las pintan son `lazy`.
  - **`victory-vendor` no se alcanza buscando `d3-`:** recharts no depende de esos paquetes directamente, sino de `victory-vendor`, que los reempaqueta dentro de sí mismo. La primera regla que escribí no casaba con nada y el build salía idéntico.
  - **Bajar `vendor-charts` de 250 kB exigiría partir recharts por rutas internas**, trozos arbitrarios que siempre se cargan juntos: no ahorraría ni un byte a nadie y dejaría una regla que se rompe en la siguiente actualización de la librería. **Y no hace falta:** ese trozo no se descarga hasta entrar en Dashboard o Reportes.
  - **La parte de `@fontsource/inter` ya estaba hecha** en T2-41, que dejó los archivos de fuente emitidos en **8** (de 56) recortando a los subconjuntos latinos.

- [x] **[T2-07] No bloquear la respuesta HTTP con el envío de alertas**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:182,370,404`, `sale-orders/sale-orders.service.ts:143-145`
  - **Qué hacer:** `checkLowStockAlert` está correctamente fuera de la transacción, pero se `await`-ea dentro del ciclo de la petición; en órdenes de venta se hace además en serie, una alerta por producto. Disparar sin esperar, registrando los fallos: `void checkLowStockAlert(...).catch((e) => logger.warn(e))`.
  - **Criterio de aceptación:** el tiempo de respuesta de `POST /products/:id/movements` no depende de la latencia del servidor SMTP; los tests de `low-stock-alert.test.ts` siguen verificando el envío (añadiendo un `await` explícito o un flush si hiciera falta).
  - **Esfuerzo:** bajo
  - **Depende de:** T2-10
  - **Verificado localmente (2026-08-08):** backend `verify` ✅ **275/275**, E2E ✅. El criterio se comprueba **haciendo lento el correo a propósito**: con un envío de 500 ms, la respuesta de `POST /products/:id/movements` tarda menos de 500 ms; con el `await` de antes tardaba **750 ms**. Falsificado devolviendo el `await`: el test falla con «Expected: < 500, Received: 750».
  - **Un `void promesa` no bastaba:** dejaba el envío sin poder testear y los fallos sin registrar. `dispararAlertaStock()` guarda las promesas vivas en un registro y expone `esperarAlertasEnVuelo()`, así que los tests **esperan de verdad** en vez de dormir un rato y cruzar los dedos. Los fallos de correo van a `logger.warn` (de aquí la dependencia con T2-10): antes se habrían perdido en silencio.
  - **Dos tests nuevos:** que la respuesta no espera al SMTP, y que un SMTP caído no impide que el movimiento de stock quede guardado.

- [x] **[T2-08] Ajustar el lote de importación masiva al tamaño del pool** ✅ *(2026-08-09)*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:240-325`
  - **Qué hacer:** `BATCH_SIZE = 50` con dos operaciones por elemento contra un pool de 10 conexiones y `connectionTimeoutMillis: 5000` puede producir errores por timeout en importaciones grandes. Reducir el lote a ~10 o usar `createMany` seguido de una inserción agrupada de movimientos.
  - **Criterio de aceptación:** importar 1000 productos (el máximo que permite el validador) termina sin errores de timeout en el resultado.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** contra el servidor real, con 1000 productos (185.1 kB): **806 ms → 271-414 ms** en tres pasadas, siempre `created: 1000, errors: []`. Y lo que de verdad importa, **consultas de inserción**: con 200 productos, **396 → 2**; con 1000, **10 en total**. `verify` ✅ **298/298** (2 tests nuevos).
  - **Se eligió `createMany`, no bajar el lote a 10.** Reducir el tamaño mantiene las 2000 consultas y solo las hace menos simultáneas: alivia el síntoma y empeora el tiempo. Agrupar quita el problema de raíz — el pool deja de ser un cuello de botella porque ya no hay 100 consultas peleándose por 10 conexiones.
  - **El tamaño de lote sigue existiendo, pero ya no gobierna la concurrencia:** ahora acota cuánto trabajo se repite si un lote falla. 200 filas × 7 columnas son 1400 parámetros, lejos del tope de Postgres.
  - **La atribución de errores por fila se conserva**, que era lo que más fácilmente se perdía al agrupar: si la inserción del lote falla, se reintenta fila a fila. Como `createMany` es **una sola sentencia atómica**, ese reintento no puede duplicar lo ya insertado, y hay un test que lo comprueba.
  - **El movimiento de stock se lee de la fila devuelta, no del índice**, así que no depende del orden en que Postgres devuelva lo insertado. Los productos con stock 0 siguen sin generar movimiento.
  - **Medido forzando la vía antigua** con una variable de entorno: la rama de reserva es literalmente el algoritmo anterior, así que el «antes» no es una estimación. Los **4400 productos** de banco se borraron al terminar (52, como antes).
  - **El caso de la fila mala costó un intento:** el primero usaba un nombre de 300 caracteres, que el validador rechaza antes de llegar a la base (422). Se cambió por un precio de 100 000 000, que pasa Zod —solo exige que sea positivo— y revienta contra `Decimal(10, 2)`, que es el fallo que solo aparece al insertar.

- [x] **[T2-09] Índice trigram para la búsqueda por nombre** ✅ *(2026-08-09)*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/prisma/schema.prisma`, migración `20260810011125_t2_09_indices_trigram`
  - **Qué hacer:** `{ contains, mode: "insensitive" }` genera `ILIKE '%término%'`, que ningún índice B-tree aprovecha. Migración manual con `CREATE EXTENSION pg_trgm` e índices GIN sobre `products.name` y `users.email`.
  - **Criterio de aceptación:** `EXPLAIN ANALYZE` de la búsqueda del catálogo usa el índice GIN en lugar de un recorrido secuencial.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-15
  - **Verificado localmente (2026-08-09):** `EXPLAIN (ANALYZE, BUFFERS)` sobre **40 000 productos**, el mismo banco que T2-43. El criterio se cumple de forma literal: el plan pasa de recorrido secuencial a **`Bitmap Index Scan on products_name_idx`**. `verify` ✅ **298/298**.

    | Consulta | Antes | Después |
    |---|---:|---:|
    | Término con pocas coincidencias (página 1) | 24.914 ms · 663 buffers | **0.346 ms · 33** |
    | Término inexistente (página 1) | 24.851 ms · 660 | **0.030 ms · 19** |
    | Recuento de un término común | 23.899 ms · 660 | **5.738 ms** |
    | Término común (página 1) | 0.130 ms | 0.133 ms *(sin cambio)* |

  - **El caso que parecía el principal ya era rápido, y no ha mejorado.** Buscar un término con muchas coincidencias resuelve la primera página recorriendo el índice de `createdAt` hasta juntar diez filas, así que nunca fue el problema. **Lo que dolía era lo contrario**: un término raro o inexistente obliga a mirar la tabla entera antes de poder decir «no hay nada» — y eso es justo lo que hace el usuario que no encuentra un producto y prueba otra palabra. De ahí la mejora de **72×** y **828×**.
  - **También el recuento**, que se paga en *cada* búsqueda porque la respuesta lleva `meta.total`: 4× más rápido. Ahí la ganancia es menor porque sigue habiendo que tocar 5000 filas.
  - **En usuarios se indexan nombre y correo, no solo el correo** como decía la ficha: el buscador mira los dos con el mismo `OR`, y con un solo índice la otra mitad seguiría recorriendo la tabla, con lo que el planificador descartaría el índice entero. **Medición honesta: ahí no se nota nada** (0.038 → 0.029 ms), porque la tabla tiene un puñado de filas; el índice está puesto para cuando deje de tenerlas.
  - **La extensión la crea la migración**, editada a mano sobre la que generó Prisma: `gin_trgm_ops` no existe sin `pg_trgm` y las tres creaciones de índice fallan. En el esquema sí se declaran los índices, con `@@index([name(ops: raw("gin_trgm_ops"))], type: Gin)`, así que no quedan como SQL suelto fuera del modelo.
  - **Trampa nueva, ya anotada en CONTEXTO.md:** `prisma db push` —que es como se sincroniza `Stockly_test`— **no ejecuta el SQL de las migraciones**, así que la extensión no llega ahí y el push muere con «no existe la clase de operadores gin_trgm_ops». Hay que crear `pg_trgm` a mano en esa base una vez.
  - **Los 40 000 productos de banco se borraron** al terminar (52, como antes).

### Observabilidad

- [x] **[T2-10] Logging estructurado con correlación de peticiones**
  - **Área:** Código / DevOps
  - **Ubicación:** `Stockly-B/src/app.ts:22-24`, `shared/middlewares/error.middleware.ts:15`
  - **Qué hacer:** `morgan("dev")` solo en desarrollo y un `console.error` de texto plano en producción, sin identificador de petición ni niveles. Adoptar `pino` + `pino-http`, generar un `requestId` por petición, propagarlo al `errorHandler` y devolverlo en la cabecera `x-request-id`.
  - **Criterio de aceptación:** los logs de producción salen en JSON con nivel y `requestId`; dado un `x-request-id` de una respuesta, se pueden recuperar todas sus líneas de log.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-08):** backend `verify` ✅ **275/275** (8 tests nuevos), E2E ✅ **9 pasados 1 omitido, tres pasadas seguidas**. `pino` + `pino-http` sustituyen a morgan y al `console.error`. Cada respuesta lleva `x-request-id`; si viene uno por cabecera se respeta, para no romper una traza que empezó en otro servicio.
  - **El criterio, comprobado de verdad:** los tests **capturan la salida real** de pino interceptando `process.stdout.write`, cogen el `x-request-id` de la respuesta y buscan sus líneas en el log. Un 4xx se registra como `warn` y un 5xx como `error`: un cliente equivocado no es una avería.
  - **La redacción no es decorativa:** `pino-http` registra **todas** las cabeceras de la petición, así que sin `redact` la cookie de sesión y el `Authorization` acababan en el log en cada llamada. Se comprobó mirando una línea real: salen como `[oculto]`.
  - **Dos defectos encontrados al mirar la salida:** el mensaje decía `GET /` en todas las peticiones, porque Express reescribe `req.url` al entrar en un router montado (se usa `originalUrl`); y en desarrollo cada línea vomitaba los objetos `req` y `res` enteros, que como sustituto de morgan habría sido un cambio a peor (se ocultan y lo útil va en el mensaje: `GET /api/v1/health → 200  33ms  [id]`).
  - **Regresión propia, medida y corregida:** `pino-pretty` es un *transport*, es decir un hilo de trabajo con un canal por línea. Con el E2E —cuatro navegadores, Vite compilando y `tsx`— la pasada **subió de 36 s a 66 s y dos pruebas empezaron a agotar su tiempo, de forma reproducible**. Se aisló comparando contra el estado anterior con `git stash` en la misma máquina. Arreglado condicionando el formato legible a que la salida sea una terminal (`process.stdout.isTTY`): cuando nadie mira —el `webServer` de Playwright, Docker, un recolector— se escribe JSON directo, sin hilo. Tras el cambio, **36 s y 9/9 en tres pasadas**, igual que antes de la tarea.

### Accesibilidad

- [x] **[T2-11] Enlace para saltar al contenido principal**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/App.tsx:184-236`
  - **Qué hacer:** La barra de navegación tiene entre 3 y 12 controles y se repite en todas las páginas, sin mecanismo para saltarla (WCAG 2.4.1, nivel A). Añadir un enlace visible al recibir foco que apunte a `<main id="contenido" tabIndex={-1}>`.
  - **Criterio de aceptación:** la primera pulsación de Tab desde el inicio de la página revela el enlace; activarlo mueve el foco al contenido principal.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-08):** frontend `verify` ✅ **282/282** (3 tests nuevos), E2E ✅. Medido en el navegador: sin foco ocupa **1×1 px**; al recibirlo, **218×44**. Los tests comprueban las dos cosas que lo hacen útil —que es el primero en recibir el foco al tabular y que activarlo deja el foco **dentro** de `<main>`—, no solo que exista.
  - **`tabIndex={-1}` en `<main>` no es un detalle:** sin él el navegador desplaza la página pero deja el foco donde estaba, y el siguiente Tab devuelve al usuario al principio de la navegación que quería saltarse. Es el fallo clásico que convierte el enlace en decoración.
  - **El foco se mueve por código, no confiando en el navegador:** el salto por fragmento depende de cada navegador y jsdom no lo implementa, así que un `onClick` lo hace explícito —y comprobable—. Se quitó el `scrollIntoView()` que había puesto detrás: `focus()` ya desplaza, y encima lanzaba una excepción no capturada en jsdom que ensuciaba la suite.

- [x] **[T2-12] Respetar `prefers-reduced-motion`** ✅ *(2026-08-09)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/index.css`
  - **Qué hacer:** Cero coincidencias de `prefers-reduced-motion` en todo `src/`, pese al uso generalizado de `transition-*`, `hover:scale-110` y `animate-spin`. Añadir el bloque `@media` estándar que reduce animaciones y transiciones a duración mínima.
  - **Criterio de aceptación:** con «Reducir movimiento» activado en el sistema operativo, la interfaz no anima transiciones ni escalados.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** **medido en el navegador con la preferencia emulada**, que es la única forma de comprobarlo —jsdom no evalúa consultas de medios—. Con «reducir movimiento» activo, la transición de un botón pasa de **0.15 s a 0.00001 s** y el giro del spinner de **1 s a 3 s**. 6 tests sobre la hoja de estilos (`movimiento.test.ts`), al modo de `theme.test.ts`.
  - **Reducir, no eliminar.** `0.01ms` deja el estado final donde toca —el menú abierto sigue abierto, el foco donde debe— y los `transitionend` que alguien escuche siguen disparándose; con `animation: none` se quedarían colgados, y hay un test que lo prohíbe.
  - **El spinner no se congela, se frena.** Girando comunica «esto sigue en marcha»; quieto no dice nada. Baja a una vuelta cada tres segundos en vez de desaparecer.
  - **`!important` es obligatorio aquí:** el bloque compite con utilidades de Tailwind, que ganan por especificidad. Sin él no haría absolutamente nada, así que el test exige que todas las declaraciones lo lleven.

- [x] **[T2-13] Nombres accesibles en la página de etiquetas** ✅ *(2026-08-09)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/tags/components/TagsPage.tsx:63-73,135-144`
  - **Qué hacer:** Los diez selectores de color son botones sin texto ni etiqueta, y su estado seleccionado se comunica solo con un `outline` CSS; los botones de editar y eliminar tampoco tienen `title` ni `aria-label` (a diferencia de `ProductTable` y `SuppliersPage`). Añadir `aria-label` descriptivos con el nombre de la etiqueta, `aria-pressed` en los colores, y envolverlos en `role="group"` con etiqueta.
  - **Criterio de aceptación:** un lector de pantalla anuncia el propósito de cada botón y el color actualmente seleccionado.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** 3 tests nuevos en `TagsPage.test.tsx`. Los diez selectores tienen nombre («Azul», «Rojo», «Ámbar»…), van dentro de un `role="group"` rotulado «Color» y `aria-pressed` marca **uno y solo uno**, tanto al abrir el formulario como tras elegir otro o al editar una etiqueta existente.
  - **El color deja de ser el único identificador.** Eran diez botones sin texto —diez «botón» idénticos para un lector de pantalla— y el elegido se distinguía solo por un contorno CSS. Los nombres viven junto al valor en `PRESET_COLORS`, así que añadir un color obliga a nombrarlo.
  - **De paso, mínimo táctil:** el círculo de 28 px se queda como dibujo (`aria-hidden`) dentro de un botón de 44×44 hasta `md`, el mismo patrón de T2-40 para lo que no puede crecer sin desentonar.
  - **Los botones de editar y eliminar ya se habían resuelto en T1-17**, al añadirles `aria-label` con el nombre de la etiqueta.

- [x] **[T2-14] Eliminar el anidamiento `<Link><Button>` de la tabla de productos** ✅ *(2026-08-09)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx:156-160`
  - **Qué hacer:** Un `<button>` dentro de un `<a>` es HTML inválido: produce dos paradas de tabulación por acción y confunde a las tecnologías de asistencia, multiplicado por cada fila de la tabla. Como es una navegación, dejar solo el `<Link>` con las clases del botón y un `aria-label` descriptivo.
  - **Criterio de aceptación:** el HTML validado no contiene contenido interactivo anidado; la acción tiene una única parada de tabulación y se activa con Enter.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** 2 tests nuevos y **comprobado en el navegador**: la primera fila de la tabla expone **6 paradas de tabulación, una por acción**, y el recuento de `a button, button a` en toda la página es **0**.
  - **Se queda el enlace, no el botón:** la acción navega, así que lo correcto es un `<a>`. Toma las clases de `clasesDeBoton()`, extraído de `Button.tsx` para no copiar la cadena —que es como se separan dos cosas que deberían cambiar juntas— y lleva `aria-label` con el nombre del producto, porque «Historial de movimientos» repetido diez veces no dice sobre cuál.
  - **`clasesDeBoton()` vive en `shared/lib/`, no en `Button.tsx`:** un archivo que exporta componentes no puede exportar además funciones sin romper el *fast refresh*, y `pnpm lint` lo señaló en cuanto se intentó.

- [x] **[T2-15] Nombre accesible en las casillas de selección de fila** ✅ *(2026-08-09)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx:71-76`
  - **Qué hacer:** Las casillas del flujo de ajuste masivo de stock —una operación destructiva— no tienen `<label>` ni `aria-label`. Añadir `aria-label={`Seleccionar ${product.name}`}` y una casilla de cabecera «Seleccionar todos» con estado indeterminado.
  - **Criterio de aceptación:** un lector de pantalla identifica a qué producto corresponde cada casilla; la casilla de cabecera selecciona y deselecciona toda la página.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** 6 tests nuevos en `ProductTable.test.tsx`. La casilla de cabecera **completa la selección sin desmarcar lo ya marcado** (con una fila de dos marcada, un clic llama al conmutador solo para la otra), desmarca la página entera cuando están todas, y una selección parcial queda **indeterminada**, no «sin marcar».
  - **El estado indeterminado solo existe como propiedad del DOM**, no como atributo: se pone por `ref`. Sin él, «una de dos seleccionadas» se anuncia como «no marcado», que es justo lo contrario de lo que hay.
  - **Sin cambiar la interfaz del componente:** `onToggleSelect` actualiza con función, así que llamarlo en bucle es seguro —cada llamada ve el conjunto que dejó la anterior— y no hizo falta añadir una prop nueva ni tocar `ProductsPage`.
  - **El nombre por fila ya estaba** desde T2-40 (`aria-label` con el nombre del producto), puesto al resolver una duplicación de texto en el árbol de accesibilidad; aquí se cubre con un test propio.

- [x] **[T2-16] Atributos ARIA y cierre con Escape en los menús de navegación** ✅ *(2026-08-09)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/shared/components/NavDropdown.tsx:36-46`, `Stockly-F/src/App.tsx:67-104`
  - **Qué hacer:** `NavDropdown` (Catálogo, Órdenes, Admin) carece de `aria-haspopup`, `aria-expanded`, `role="menu"` y `role="menuitem"`, que `UserMenu` sí tiene bien resueltos. Ninguno de los dos cierra con Escape ni devuelve el foco al botón disparador. Replicar el patrón del `UserMenu` y añadir el manejador de Escape en ambos.
  - **Criterio de aceptación:** el estado abierto/cerrado se anuncia; pulsar Escape cierra el menú y devuelve el foco a su botón.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** 5 tests nuevos para `NavDropdown` y 1 para `UserMenu`. El botón declara `aria-haspopup`, `aria-expanded` y `aria-controls` —que **desaparece al cerrar**, para no apuntar a un id inexistente—, y **Escape cierra y devuelve el foco al botón**. `verify` ✅ **336/336**, E2E ✅ 9 pasados 1 omitido.
  - **Desviación deliberada de la ficha, y el motivo:** pedía replicar el `role="menu"`/`role="menuitem"` de `UserMenu`. **No se aplica en `NavDropdown`, y es a propósito:** ese rol es para comandos de aplicación, y lo que hay dentro son enlaces de navegación. Con `menuitem` dejan de anunciarse como enlaces y **desaparecen de la lista de enlaces del lector de pantalla**, que es justo la herramienta con la que se recorre un sitio. Queda como desplegable (*disclosure*): botón que dice que abre algo, panel rotulado y salida con Escape.
  - **Lo cazó el E2E, no la revisión:** llegué a poner `role="menuitem"` y el smoke falló al buscar «Productos» por rol de enlace. El fallo de una prueba ajena señaló un problema real de accesibilidad, no un selector viejo.
  - **El comportamiento compartido vive en un hook** (`useMenuDesplegable`): el cierre al pulsar fuera estaba duplicado y el de Escape no estaba en ninguno. Ahora no pueden volver a separarse.
  - **Devolver el foco no es un adorno:** al cerrar, el elemento enfocado desaparece del DOM, el navegador manda el foco al `<body>` y el siguiente Tab reempieza por el principio de la página.

- [x] **[T2-17] Exponer el estado de los conmutadores de etiqueta del formulario de producto** ✅ *(2026-08-07)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductForm.tsx:221-252`
  - **Qué hacer:** La selección se comunica solo por color de fondo. Añadir `aria-pressed={isSelected}`, envolver en `role="group"` con `aria-label`, y calcular la luminancia de `tag.color` para elegir texto blanco o negro y no fallar el contraste con colores claros.
  - **Criterio de aceptación:** el lector de pantalla anuncia qué etiquetas están seleccionadas; el texto sobre cualquier color de etiqueta cumple un ratio de contraste ≥ 4.5.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-03
  - **Verificado localmente (2026-08-07):** 4 tests de componente (`aria-pressed` refleja la selección y cambia al pulsar, los conmutadores están en un `role="group"` rotulado «Etiquetas», y el texto usa el color que contrasta) más 7 del helper nuevo `shared/lib/color.ts`. El contraste no se comprueba con una muestra: **se recorren los 256 grises y se toma el peor caso**, que queda en **4.58 ≥ 4.5**.
    **Detalle que cambió la implementación:** con un gris oscuro como color de texto en vez de negro puro, el peor fondo posible se queda en **4.23** y no llega al mínimo. Por eso el helper elige entre blanco y negro puros. De paso destapó una suposición equivocada: `#ef4444` parece oscuro pero contrasta más con negro (5.7) que con blanco (3.7).
    `textoLegibleSobre()` queda disponible para T2-38, que tiene el mismo problema en `Badge`.
    **No verificado:** la locución real en un lector de pantalla; se comprueba la semántica que la hace posible.

- [x] **[T2-18] Gestión de foco y anuncio al cambiar de ruta** ✅ *(2026-08-09)*
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/App.tsx`, `Stockly-F/src/routes/index.tsx`
  - **Qué hacer:** En una SPA la navegación no recarga la página: el foco se queda donde estaba y el lector de pantalla no anuncia nada. Añadir un componente que, al cambiar `pathname`, mueva el foco a `<main tabIndex={-1}>` y actualice una región `aria-live="polite"` con el título de la página.
  - **Criterio de aceptación:** navegar entre secciones anuncia el nuevo título y coloca el foco al inicio del contenido.
  - **Esfuerzo:** medio
  - **Depende de:** T2-11
  - **Verificado localmente (2026-08-09):** `AnuncioDeRuta` en `Stockly-F/src/shared/components/`, con `TITULOS_DE_RUTA` en `shared/lib/titulos.ts`. `verify` ✅ **313/313** (12 tests nuevos), E2E ✅ 9 pasados 1 omitido. **Medido en el navegador**, que es donde vive el criterio: al ir del panel a Reportes, `document.title` pasa a «Reportes · Stockly», la región viva pasa a decir «Reportes» y `document.activeElement` es `#contenido`. **La prueba de fuego es el Tab siguiente:** cae en «Descargar PDF», **dentro de `<main>**`, en vez de volver al principio de la barra de navegación.
  - **El texto se deriva del `pathname`, no se guarda en un estado sincronizado por un efecto.** Además de evitar el `setState` en efecto que ya costó T1-08 y T1-10, encaja con cómo funciona una región viva: anuncia sus **cambios**, no su contenido inicial. Así, en la primera carga no dice nada —y tampoco roba el foco, que es lo que haría un `focus()` sin guardia— y en cada navegación posterior sí.
  - **Los títulos no se leen del `<h1>` de cada página**, que sería la fuente única evidente: con las rutas en `lazy()`, en el instante del cambio de ruta el contenido nuevo aún no está montado y no habría nada que leer. Viven en una lista, y `titulos.test.ts` **la compara con el router de verdad** en las dos direcciones: una ruta nueva sin título hace fallar la suite —que es mejor que anunciar «Página no encontrada» al llegar a ella— y un título huérfano también. Es el mismo patrón con el que T2-29 ató el esquema de Swagger al validador. Falsificado quitando `/reports` de la lista.
  - **De regalo, `document.title` deja de ser fijo.** Era «Stockly — Gestión de inventario» en las 21 rutas; ahora nombra la sección, que es lo que distingue una pestaña de otra y lo que lee el historial del navegador.
  - **Trampa al medir, anotada para no repetirla:** la primera medición en el navegador daba que **no pasaba nada** —título y región sin cambiar, foco en el enlace— y parecía un fallo del código. No lo era: React Router navega dentro de un `startTransition`, así que la URL cambia antes de que React confirme el render nuevo, y el efecto corre al confirmar, después de que cargue el *chunk* de la ruta. Esperando a que la página esté pintada, las tres cosas son correctas. Anunciar antes habría sido peor: diría «Reportes» con la pantalla todavía en el panel.

### Cobertura de tests

- [x] **[T2-19] Tests de las páginas de órdenes de venta y compra** ✅ *(2026-08-09)*
  - **Área:** QA
  - **Ubicación:** `Stockly-F/src/tests/` (nuevos), cubriendo `SaleOrdersPage.tsx` y `PurchaseOrdersPage.tsx`
  - **Qué hacer:** Son las páginas con más lógica de UI sin cobertura (formularios de array dinámico con `useFieldArray`, transiciones de estado con efectos sobre el inventario) y están al 0 %. Cubrir: alta con varios ítems, validación de cantidades y precios, cambio de estado y renderizado de la lista con sus badges.
  - **Criterio de aceptación:** ambas páginas superan el 60 % de cobertura de sentencias.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** las dos páginas superan el 60 % que pide el criterio — **`PurchaseOrdersPage` 49.25 % → 92.53 %** (12 tests nuevos) y `SaleOrdersPage` **65.67 %**, que ya lo cumplía con los 8 tests de T2-42. Cubre lo que más lógica tiene: el array dinámico de ítems (`useFieldArray`), la validación, y las transiciones de estado, que en compras **suman stock** al recibir y lo restan al cancelar una recibida (T0-04).
  - **Los tests miran el payload, no solo la pantalla:** que elegir un producto rellene nombre y precio, que la cantidad viaje como **número** y no como el texto del input, y que un proveedor sin elegir se envíe como `undefined` en vez de cadena vacía — las tres cosas que el backend distingue.

- [x] **[T2-20] Tests de la página de gestión de usuarios** ✅ *(2026-08-09)*
  - **Área:** QA
  - **Ubicación:** `Stockly-F/src/tests/` (nuevo), cubriendo `UsersPage.tsx`
  - **Qué hacer:** Página al 0 % con acciones destructivas (cambio de rol, activar/desactivar). Cubrir el renderizado de la lista, el cambio de rol, la desactivación y el caso de intentar actuar sobre uno mismo (que el backend rechaza con 400).
  - **Criterio de aceptación:** la página supera el 60 % de cobertura de sentencias.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** `UsersPage` **0 % → 86.66 %**, 9 tests nuevos. El criterio pedía 60 %.
  - **Lo que más importaba cubrir es lo que no debe poder hacerse:** actuar sobre la propia cuenta. El backend lo rechaza con 400, y aquí el selector de rol y el botón de desactivar están **deshabilitados**, así que ni se llega a pedir. También la traducción del filtro de estado, donde `""` significa «todos» y tiene que convertirse en `undefined`, no en `false`.

- [x] **[T2-21] Tests del dashboard y la página de reportes** ✅ *(2026-08-09)*
  - **Área:** QA
  - **Ubicación:** `Stockly-F/src/tests/` (nuevos), cubriendo `DashboardPage.tsx` y `ReportsPage.tsx`
  - **Qué hacer:** Ambas al 0 %. Cubrir estados de carga, renderizado de las tarjetas de KPI con datos mockeados, la sección de alertas de stock bajo y el formateo de moneda.
  - **Criterio de aceptación:** ambas páginas superan el 50 % de cobertura de sentencias.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** `DashboardPage` **0 % → 81.81 %** y `ReportsPage` **0 % → 84.37 %**, con 12 tests que comparten los mismos datos de prueba porque comparten endpoint: si el contrato de `/reports` cambia, fallan las dos a la vez.
  - **Recharts va mockeado:** mide su contenedor con `ResizeObserver`, que en jsdom no existe y da siempre 0×0, así que los gráficos no llegan a pintarse. Lo que se prueba son las cifras, el formato y los enlaces.
  - **Trampa que costó una suite colgada:** el primer mock era un `Proxy` que devolvía un componente para **cualquier** propiedad — también para `then`. Eso convierte al módulo en «thenable» y el `import()` que lo espera **no resuelve nunca**: vitest se queda parado sin dar un solo error. Y aun arreglado, un `Proxy` no pasa la comprobación de vitest de que el mock exporte lo que el módulo real exporta. La versión buena enumera los componentes uno a uno.

- [x] **[T2-22] Umbrales de cobertura en ambos repositorios** ✅ *(2026-08-09)*
  - **Área:** QA
  - **Ubicación:** `Stockly-B/jest.config.js`, `Stockly-F/vite.config.ts:40-53`
  - **Qué hacer:** Ninguna configuración define umbrales, así que nada impide que la cobertura baje. Fijar el suelo en el valor actual menos 2 puntos (backend 85 %, frontend al nivel que resulte tras T2-19/20/21) y subirlo con cada incorporación.
  - **Criterio de aceptación:** `pnpm test:coverage` falla en local si la cobertura baja del umbral.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-01, T1-02, T2-19, T2-20, T2-21
  - **Verificado localmente (2026-08-09):** umbrales puestos y **falsificados en los dos repositorios**, que es lo único que demuestra que un umbral existe: subiendo el de sentencias a 99 %, el backend falla con «Coverage for statements (88.62%) does not meet "global" threshold (99%)» y el frontend con su equivalente; restaurados, ambos `verify` vuelven a exit 0.
  - **Los valores, dos puntos por debajo de lo real** (2026-08-09) — backend **85 / 72 / 87 / 87** sobre 88.62 / 74.88 / 89.43 / 89.97; frontend **42 / 50 / 33 / 43** sobre 44.55 / 52.19 / 35.70 / 45.59. Es margen para un refactor honrado, no para el descuido.
  - **Sin CI, el umbral es la única barrera** contra la erosión: nada impedía que la cobertura bajara commit a commit. Al subirla hay que subir también estos números, o el suelo deja de significar nada.

- [x] **[T2-23] Cubrir las zonas de baja cobertura del backend** ✅ *(2026-08-09)*
  - **Área:** QA
  - **Ubicación:** `Stockly-B/src/tests/sale-orders.test.ts`, nuevos tests para `upload.middleware.ts`
  - **Qué hacer:** `nodemailer` (31.8 %) y `upload.middleware` (47 %) están siempre mockeados y sus rutas de error nunca se ejercitan; la exportación de órdenes de venta (`sale-orders.controller.ts:74-87`) no tiene tests. Añadir: exportación en CSV y JSON, y el `fileFilter` de multer rechazando un mimetype no permitido.
  - **Criterio de aceptación:** `sale-orders.controller.ts` supera el 75 % y `upload.middleware.ts` el 70 %.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** los dos umbrales, con margen. **`sale-orders.controller.ts` 69.44 % → 86.11 %** (pide > 75) y **`upload.middleware.ts` 75.67 %** (pide > 70). Cobertura global del backend **91.00 %**. `verify` ✅ **339/339** (6 tests nuevos).
  - **Lo que faltaba eran las tres rutas de solo lectura** —listado, lectura por id y exportación—, justo las que nadie mira hasta que dejan de funcionar. Se cubren el sobre paginado (`data.data` + `meta`), el filtro por estado, el 404 y las dos exportaciones.
  - **El test del CSV comprueba algo con consecuencias, no solo que responda 200:** una orden con dos líneas produce **dos filas**, no una. Es la diferencia entre contar órdenes y contar filas, que es exactamente lo que decide si el tope de la exportación (T2-05) se queda corto.
  - **`upload.middleware` llegó al umbral por otro camino, y se dice:** la ficha proponía un test del `fileFilter` de multer, pero **T2-32 ya lo dejó en 75.67 %** al añadir la comprobación de firma. Escribir además ese test no habría medido nada nuevo, así que no se hizo.
  - **`nodemailer` (39 %) se queda como está**, y no por descuido: está mockeado en toda la suite, y cubrir sus rutas de error exige un servidor SMTP falso. El criterio de aceptación no lo pedía y montarlo por un número no es una mejora.

- [x] **[T2-24] Tests de contrato entre frontend y backend** ✅ *(2026-08-09)*
  - **Área:** QA / Arquitectura
  - **Ubicación:** `Stockly-F/src/tests/` (nuevos)
  - **Qué hacer:** Segundo nivel de defensa contra la clase de fallo que produjo T0-03, T1-03 y T1-05: validar los datos mockeados de los tests del frontend contra esquemas Zod que reproduzcan las respuestas reales del backend, de modo que un mock desalineado con la API haga fallar los tests. Empezar por settings, products y orders. `SettingsPage.test.tsx:20-23` es el ejemplo canónico: mockea `value` como cadena cuando la API devuelve un boolean.
  - **Criterio de aceptación:** existe al menos un test que falla si el mock diverge de la forma real de la respuesta, verificado alterando deliberadamente un mock.
  - **Esfuerzo:** medio
  - **Depende de:** T1-05, T1-06
  - **Verificado localmente (2026-08-09):** `verify` frontend ✅ **395/395** (6 tests nuevos). **Falsificado como pedía el criterio:** cambiando `value: false` por `value: "false"` en el mock compartido, **dos archivos de test fallan al cargarse** con «El mock «ajusteBooleano» no coincide con la respuesta real del backend».
  - **La validación corre al importar el módulo, no dentro de un `it`.** Es la decisión que hace que esto sirva: cualquier test que use un mock desalineado falla, sin depender de que alguien se acuerde de invocar el test de contrato. Un guardián que hay que llamar a mano es un guardián que se olvida.
  - **El esquema de ajustes es una unión discriminada por `type`, y esto costó un intento.** La primera versión declaraba `value: boolean | number | string`, y con ella `{ type: "boolean", value: "false" }` **pasaba la validación** — que es justo el mock que ocultó T1-06. Un contrato que acepta el defecto que debe cazar no vale nada; los tests de falsificación lo detectaron antes de darlo por bueno.
  - **Se cubren las tres divergencias que ya costaron una tarea**, cada una con su test: el booleano como cadena (T1-05/T1-06), las etiquetas como cadenas en vez de objetos (T1-03) y el listado sin el sobre `{ data, meta }`. Más el `productId: null` explícito de los ítems de orden, del que depende el recuento de reposición de T2-42.
  - **`SettingsPage.test.tsx` ya consume el mock validado**, que era el ejemplo canónico de la ficha. Los demás módulos tienen su fixture listo en `tests/contratos/fixtures.ts`; engancharlos es sustituir la constante local por el import.

### Infraestructura

- [x] **[T2-25] Healthcheck de aplicación y sonda de readiness** ✅ *(2026-08-09)*
  - **Área:** DevOps
  - **Ubicación:** `Stockly-B/src/routes/index.ts:17-52`, `docker-compose.yml`
  - **Qué hacer:** `/health` devuelve 200 aunque la base de datos esté caída, y el servicio `backend` no tiene `healthcheck` en el compose (el de `db` sí lo tiene). Añadir un endpoint `/ready` que ejecute `SELECT 1` y devuelva 503 si falla, y registrar el healthcheck en el compose.
  - **Criterio de aceptación:** con la base de datos detenida, `/ready` devuelve 503 y `docker compose ps` marca el contenedor backend como `unhealthy`.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-02
  - **Verificado localmente (2026-08-09):** el criterio, literal. Con la pila en marcha, `backend: Up (healthy)` y `/ready` → 200. Tras `docker compose stop db`: **`/ready` → 503** y, pasados los reintentos, **`backend: Up (unhealthy)`**. `verify` ✅ **314/314** (3 tests nuevos).
  - **Son dos sondas porque responden a preguntas distintas, y confundirlas hace daño.** `/health` es vivacidad —¿responde el proceso?— y **sigue devolviendo 200 con la base caída a propósito**: reiniciar el contenedor no arregla una base que no está. `/ready` es disponibilidad, y es la que decide si mandarle tráfico. Hay un test de cada cosa, incluido el de que `/health` no cambia.
  - **503 y no 500:** «aún no disponible» frente a «avería». Es la distinción que usa un orquestador para elegir entre retirar del balanceo y reiniciar.
  - **`SELECT 1` y no una consulta a una tabla:** no depende del esquema, así que sigue significando lo mismo cuando cambien los modelos.
  - **El healthcheck del compose usa `node`, no `curl`:** la imagen es `node:alpine` y no lo trae; añadirlo solo para esto engorda la imagen y amplía su superficie. Lleva `start_period: 40s` porque `prisma migrate deploy` corre antes de que el servidor escuche.

- [x] **[T2-26] Verificar la reproducibilidad del build de la imagen** ✅ *(2026-08-09)*
  - **Área:** DevOps
  - **Ubicación:** `Stockly-B/Dockerfile:7,23`, `Stockly-B/package.json:22-28`
  - **Qué hacer:** El anclaje de la versión de pnpm lo resuelve **T0-02 (punto 1)**, porque `corepack prepare pnpm@latest --activate` no solo era irreproducible sino que además rompía el build. Lo que queda aquí es la verificación: comprobar que dos builds del mismo commit producen el mismo árbol de dependencias, y añadir el campo `"packageManager": "pnpm@11.2.2"` a `package.json` si T0-02 no lo hizo ya.
  - **Criterio de aceptación:** dos `docker build --no-cache` del mismo commit instalan idénticas versiones (comparar `pnpm list --depth=0` dentro de ambas imágenes).
  - **Esfuerzo:** bajo
  - **Depende de:** T0-02
  - **Verificado localmente (2026-08-09):** dos `docker build --no-cache` del mismo árbol, comparados por tres huellas: **310 paquetes instalados, lista idéntica**; **`node v22.23.2` y `pnpm 11.21.0`** en las dos; y el compilado —`dist`, `src/generated` y `prisma`, **108 archivos**— con el **mismo md5 agregado**: `dc10fd0099f0f6be403ff966624ee0a5`.
  - **El comando que pedía la ficha no sirve dentro de esta imagen, y por poco lo doy por bueno.** `pnpm list --depth=0` falla con `EACCES: permission denied, mkdir '/root/.local/share/pnpm/store/v11'`: insiste en el directorio de root aunque se le cambie `HOME`, porque desde T1-21 el contenedor corre como `node`. **Las dos imágenes devolvían exactamente lo mismo… que era el mismo error**, y un `diff` limpio parecía demostrar reproducibilidad sin demostrar nada.
  - **Se sustituye por huellas que sí significan algo:** el listado de `node_modules/.pnpm` —un directorio por `paquete@versión`, que es el árbol resuelto de verdad— y el md5 del compilado, que además comprueba algo que la ficha no pedía: que dos builds producen el **mismo artefacto**, no solo las mismas dependencias.
  - **El anclaje ya estaba:** `"packageManager": "pnpm@11.21.0"` en los dos repositorios y `corepack prepare pnpm@11.21.0` en los dos Dockerfile.

- [x] **[T2-27] Externalizar las credenciales de PostgreSQL del compose** ✅ *(2026-08-09)*
  - **Área:** DevOps / Seguridad
  - **Ubicación:** `docker-compose.yml:9-13`
  - **Qué hacer:** `postgres`/`postgres` incrustados y el puerto 5432 publicado en el host, en un archivo que el README raíz presenta como «Docker (producción)». Externalizar a variables con valor requerido (`${POSTGRES_PASSWORD:?requerida}`), no publicar el puerto en producción, y separar `docker-compose.yml` de `docker-compose.prod.yml`.
  - **Criterio de aceptación:** el compose de producción falla si no se define la contraseña; el de desarrollo sigue funcionando con valores por defecto documentados.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** las tres situaciones, con `docker compose config`:
    1. desarrollo sin variables → funciona, con `postgres`/`postgres` por defecto;
    2. producción sin credenciales → **aborta**: «required variable POSTGRES_DB is missing a value: define POSTGRES_DB para desplegar»;
    3. producción con credenciales → resuelve, y el servicio `db` **queda sin `ports`**.
  - **`ports: !reset []` en la superposición, no una lista vacía:** Compose **concatena** los `ports` de los archivos superpuestos, así que sin `!reset` el 5432 seguiría publicado en producción por venir del archivo base. Comprobado en el `config` resuelto.
  - **La `DATABASE_URL` del backend se compone de las mismas variables que la base**, para que no haya dos sitios donde cambiar la contraseña y uno se quede atrás.
  - **El puerto del host es configurable (`POSTGRES_HOST_PORT`)**, y no es un adorno: ver la trampa del PostgreSQL local en CONTEXTO.md.

- [x] **[T2-28] Contenedorizar el frontend y añadirlo al compose** ✅ *(2026-08-09)*
  - **Área:** DevOps
  - **Ubicación:** `Stockly-F/Dockerfile` (nuevo), `docker-compose.yml`
  - **Qué hacer:** No existe ruta de despliegue reproducible para la mitad del producto. Dockerfile multi-stage (build con Node, servido con `nginx:alpine`) con `try_files $uri /index.html` para el enrutado SPA, y su servicio en el compose. Documentar si frontend y backend comparten dominio, porque de ello depende si el `sameSite: "none"` de las cookies puede endurecerse a `lax`.
  - **Criterio de aceptación:** `docker compose up --build` levanta base de datos, backend y frontend, y el login funciona de extremo a extremo desde el navegador.
  - **Esfuerzo:** medio
  - **Depende de:** T0-02
  - **Verificado localmente (2026-08-09):** `docker compose up -d --build` deja `db (healthy)`, `backend (healthy)` y `frontend`, y **el login funciona en el navegador contra `http://localhost:8080`**: entra al Dashboard con sus KPIs. Recargando directamente en `/catalog/products`, la SPA responde 200 y pinta las 10 filas y «48 productos en total», así que `try_files` hace su trabajo.
  - **Respuesta a lo que la ficha mandaba documentar —si comparten dominio—: sí, y por decisión.** nginx sirve la SPA **y hace de proxy de `/api`**, así que el navegador habla siempre con su mismo origen. El frontend se compila con `VITE_API_URL=/api/v1`, una ruta relativa.
  - **De ahí sale la consecuencia sobre las cookies:** con dos orígenes hay que emitirlas `SameSite=None`, lo que **obliga a `Secure`** y por tanto a TLS, y las expone a viajar en peticiones de terceros. Detrás de este proxy basta `SameSite=Lax`.
  - **Y ahí apareció un defecto real, que solo se ve montando la pila:** `NODE_ENV=production` forzaba `secure: true`, y sobre HTTP el navegador **descarta la cookie de sesión sin decir nada** — el login parece fallar por credenciales. Se añaden `COOKIE_SECURE` y `COOKIE_SAMESITE`, **con los valores actuales por defecto**, para poder declarar la topología real; el compose las pone en `lax`/`false`. Un despliegue tras TLS no toca nada.
  - **`proxy_buffering off` en nginx:** con el búfer activado acumularía el archivo entero antes de mandarlo y desharía el streaming de las exportaciones de T2-05.
  - **El contexto de build apunta al repositorio hermano** (`../Stockly-F`), así que este compose no funciona sin él clonado al lado. Se añade un `.dockerignore` que excluye `node_modules`, `dist` y **el `.env`**: Vite incrusta las `VITE_*` al compilar, y un `.env` colado en el contexto acabaría dentro del JavaScript publicado.
  - **No se fuerza `USER nginx`** como en el backend: ahí no se ejecuta código de la aplicación, solo se sirven archivos estáticos, y `nginx:alpine` ya baja sus procesos de trabajo a `nginx`. Cambiarlo exige reasignar directorios de caché y el puerto, a cambio de poco.

### Documentación de API

- [x] **[T2-29] Corregir el esquema `Product` de Swagger** ✅ *(2026-08-07)*
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/src/swagger.ts:17-31,147-151,172-177`
  - **Qué hacer:** El esquema declara `category` como un enum de cadenas cuando en realidad es una relación (`{ id, name }`) y el campo de escritura es `categoryId` (UUID). El `requestBody` de `POST /products` exige un campo `category` que el validador no acepta, por lo que seguir la documentación produce un 422.
  - **Criterio de aceptación:** una petición construida siguiendo el «Try it out» de Swagger para crear un producto devuelve 201.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-03
  - **Verificado localmente (2026-08-07):** `swagger-contract.test.ts` nuevo, 5 tests. El cuerpo documentado (`name`, `price`, `stock`, `minStock`, `categoryId`) enviado a `POST /products` devuelve **201** y la respuesta trae `category` como objeto `{ id, name }`. El test no se limita a mirar la documentación: **compara la lista de campos escribibles del esquema con lo que acepta `createProductSchema`**, así que documentar un campo nuevo sin añadirlo al validador —o al revés— hace fallar la suite.
    Esquemas nuevos: `NamedRef` (categoría, marca y proveedor), `Tag`, `ProductWrite` (cuerpo real de creación y actualización) y `ProductImport`, que tiene otro contrato: categoría y marca por nombre. Corregidos de paso los filtros de `GET /products`, que documentaban un `category` por nombre inexistente en lugar de `categoryId`, `brandId`, `supplierId` y `tagId`.

- [x] **[T2-30] Documentar en Swagger los módulos ausentes** ✅ *(2026-08-09)*
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/src/swagger.ts:70-204`
  - **Qué hacer:** El spec cubre `auth` (parcial), `products` (parcial) y movimientos de stock. Faltan `categories`, `brands`, `suppliers`, `purchase-orders`, `sale-orders`, `reports`, `tags`, `users`, `settings`, `audit-logs`, y de products faltan `bulk-stock`, `price-history` y las exportaciones.
  - **Criterio de aceptación:** los doce módulos aparecen en `/api/v1/docs` con sus operaciones, parámetros y códigos de respuesta.
  - **Esfuerzo:** medio
  - **Depende de:** T2-29
  - **Verificado localmente (2026-08-09):** el spec pasa de 3 módulos a **14 etiquetas, 43 rutas y 67 operaciones** —las 67 que expone el router— y `/api/v1/docs` responde 200. `verify` ✅ **333/333** (14 tests nuevos).
  - **La garantía no es una lista escrita a mano, es el router.** `swagger-cobertura.test.ts` recorre el árbol de Express de los doce módulos, traduce `:id` a `{id}` y exige que **cada operación exista en el spec**. Una lista manual se queda vieja en cuanto alguien añade un endpoint; esto falla en el momento.
  - **Y en el sentido contrario:** también comprueba que el spec **no documente rutas que no existen**. Documentación que promete un endpoint inexistente es peor que no tenerla, porque el «Try it out» acaba en 404 sin explicación.
  - **Los cuatro catálogos se generan, no se copian.** Categorías, marcas, etiquetas y proveedores son el mismo CRUD con otro nombre: una función los produce. Copiados a mano, el cuarto se olvida de un código de respuesta y nadie lo nota.
  - **El test nuevo cazó un fallo que yo mismo acababa de introducir:** al mezclar las rutas nuevas con `...rutasAdicionales`, la clave `/products/{id}/movements` **sobrescribió** la que ya existía y borró su `GET` —el spread sustituye la clave, no fusiona—. Se documentaba menos que antes, y en silencio. El `POST` se extrae aparte y se inserta dentro del objeto existente, con la nota puesta donde tocaría repetirlo.
  - **Se documentan también `/health` y `/ready`** (T2-25), que no pertenecen a ningún módulo, y las tres exportaciones con su `?format=csv` y su 413.

### Endurecimiento adicional

- [x] **[T2-31] Detección de reuso de refresh tokens** ✅ *(2026-08-09)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/modules/auth/auth.service.ts:84-102`
  - **Qué hacer:** La rotación es correcta, pero el reuso de un token ya rotado se trata como una expiración normal, sin invalidar la familia ni registrar la anomalía. Persistir el hash del token anterior; si llega un refresh con un hash ya rotado, invalidar todas las sesiones del usuario y registrar el evento en `AuditLog`.
  - **Criterio de aceptación:** reutilizar un refresh token ya rotado invalida la sesión activa y genera una entrada de auditoría; hay un test que lo verifica.
  - **Esfuerzo:** medio
  - **Depende de:** T0-07
  - **Verificado localmente (2026-08-09):** `verify` ✅ **319/319** (5 tests nuevos). El escenario completo: se rota un token, se presenta el viejo → 401, **y el token legítimo recién emitido también deja de servir**; en la base quedan `refreshToken` y `previousRefreshToken` a `null`, y hay una entrada `REFRESH_REUSE` con el correo del usuario afectado.
  - **Lo que cambia no es el 401 —ya lo daba— sino lo que pasa después.** Un token gastado que reaparece no tiene explicación inocente: alguien se hizo con él. Y como la rotación ya entregó uno nuevo, callarse deja al atacante con sesión indefinida. Se cierra la familia entera porque **no hay forma de saber cuál de los dos está en manos del atacante**; el usuario legítimo pierde la sesión, que es mucho menos que perder la cuenta.
  - **Tres tests cubren los falsos positivos, que es donde esto se rompe de verdad:** tres rotaciones encadenadas siguen funcionando; un token inventado no dispara nada ni toca la sesión buena; y **tras un `logout` ordenado, presentar el token viejo no registra un reuso** — para eso hubo que limpiar también `previousRefreshToken` al cerrar sesión y al iniciar una nueva. Sin eso, la alarma saltaría sobre sesiones que el propio usuario cerró.
  - **Falsificado** quitando el guardado del hash gastado: cae el test del escenario y sobreviven los cuatro que describen lo que no debía cambiar.
  - **Alcance honesto:** se guarda **un solo** token anterior, no la familia completa. Detecta el caso real —un token robado que se reutiliza tras la rotación— pero no una cadena larga de tokens antiguos. Ampliarlo pide una tabla de sesiones, que es otra tarea.
  - **La migración se escribió a mano:** `prisma migrate dev --create-only` no puede ejecutarse aquí porque exige TTY. Solo añade la columna y su índice único.

- [x] **[T2-32] Validar las imágenes por sus magic bytes** ✅ *(2026-08-09)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/middlewares/upload.middleware.ts`, `Stockly-B/src/modules/products/product.routes.ts:44-45`
  - **Qué hacer:** `fileFilter` confía en `file.mimetype`, que lo fija el cliente. Verificar la firma real del buffer (p. ej. con `file-type`) antes de subir a Cloudinary.
  - **Criterio de aceptación:** un archivo no-imagen enviado con `Content-Type: image/jpeg` se rechaza con 422 antes de llegar a Cloudinary; hay un test que lo verifica.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** `verify` ✅ **296/296** (9 tests nuevos). Un ejecutable de Windows (`MZ…`) enviado como `image/jpeg` se rechaza con **422**; JPEG, PNG y WebP reales pasan.
  - **No va en `fileFilter`, y no puede ir:** multer lo llama con los metadatos del archivo **antes** de leer su contenido, así que ahí solo existe la cabecera que puso el cliente. La comprobación es un middleware aparte, después de `upload.single(...)`, que es cuando `req.file.buffer` existe. El `fileFilter` se conserva porque descarta lo evidente sin leer nada, pero deja de ser la defensa.
  - **Sin `file-type`, y a propósito:** son **tres formatos**, doce bytes de comparación, y la librería es ESM puro desde la v19 mientras este proyecto compila a CommonJS — habría entrado por un `import()` dinámico, asíncrono dentro de un middleware síncrono, a cambio de nada.
  - **WebP no tiene un prefijo continuo:** es un contenedor RIFF y la marca está partida, `RIFF` al principio y `WEBP` en el byte 8. Un WAV empieza igual, así que hay un test con uno para que comprobar solo `RIFF` no baste.
  - **Cabecera que miente sobre una imagen que sí lo es: manda el contenido.** Se corrige `mimetype` en vez de rechazar; un navegador que etiqueta mal un PNG no es un ataque, y lo que importaba ya está comprobado.
  - **Un test comprueba que está enchufada:** recorre `product.routes.ts` y exige que toda línea con `upload.single(` lleve también el middleware. El middleware más correcto no sirve de nada si una ruta nueva se olvida de él, y eso no lo caza ningún test de comportamiento.
  - **Falsificado** haciendo que el middleware confíe en la cabecera: caen 4 de los 9 tests.
  - **Volvió a morder la trampa del mock de `upload.middleware`:** cuatro suites dejaron de arrancar con «argument handler must be a function», porque el mock no exportaba el middleware nuevo y Express recibía `undefined`. Es el mismo motivo por el que estos tests son directos y no por HTTP, y ya estaba documentado en CONTEXTO.md.

- [x] **[T2-33] Limitar el tamaño del cuerpo por ruta** ✅ *(2026-08-09)*
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/app.ts:45-59`, `Stockly-B/src/shared/middlewares/error.middleware.ts`
  - **Qué hacer:** `express.json({ limit: "5mb" })` se aplica globalmente cuando solo la importación masiva lo justifica. Bajar el límite global a `100kb` y aplicar el de 5 MB específicamente en `POST /products/import`.
  - **Criterio de aceptación:** un cuerpo de 1 MB en cualquier endpoint que no sea el de importación devuelve 413; la importación de 1000 productos sigue funcionando.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** `verify` ✅ **287/287** (7 tests nuevos). **Los dos lados del criterio, medidos contra el servidor real:** 1000 productos son **185.1 kB** y se importan en **806 ms** con `created: 1000, errors: []`; un cuerpo de 1 MB en `/auth/login` responde **413**.
  - **El orden de los parsers es lo que decide cuál se aplica:** `body-parser` marca la petición al parsearla y el siguiente se abstiene, así que el específico de la importación va **antes** que el general. Al revés no tendría ningún efecto, porque el global ya habría rechazado el cuerpo.
  - **Falsificado comentando la excepción de ruta:** la misma importación pasa de 201 a **413 en 8 ms**. No era una precaución teórica: 185 kB están muy por encima de los 100 kB del límite general.
  - **Descubierto al comprobarlo: el 413 salía como 500.** `body-parser` lanza un error que no es `HttpError`, así que `errorHandler` lo tomaba por avería — en desarrollo con el mensaje real y en producción con «Error interno del servidor», que dice lo contrario de lo que pasa: la petición está mal, el servidor está bien. Se ensancha el manejador para respetar los errores de terceros marcados con `expose: true` (la convención de `http-errors`, que usan Express y `body-parser`).
  - **Ese ensanchamiento es deliberadamente estrecho**, con tres tests que lo fijan: se reenvía un 4xx **solo** si lleva `expose: true`; sin la marca vuelve a ser 500, y un 5xx ajeno tampoco se reenvía aunque venga expuesto. La regla cubre «el cliente se equivocó», no «algo se rompió».
  - **Los 1000 productos de banco se borraron** al terminar (52 productos, como antes).

- [x] **[T2-34] Descargar el CSV de movimientos vía axios y con codificación correcta** ✅ *(2026-08-09)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/api/product.api.ts`, `utils/importExport.ts`, `components/ProductsPage.tsx`, `components/StockMovementsPage.tsx`; `Stockly-B/src/shared/lib/exportacion.ts`, `modules/products/product.controller.ts:124-133`
  - **Qué hacer:** La descarga usa un `<a href>` a otro origen, por lo que el atributo `download` se ignora y la petición esquiva el interceptor de axios: con la sesión caducada el usuario descarga el JSON del error 401 en lugar de ser redirigido al login. Además el backend envía `text/csv` sin `charset=utf-8` ni BOM, por lo que los acentos se ven mal en Excel. Descargar como `blob` vía axios reutilizando `downloadBlob`, y corregir la cabecera y el BOM en el backend.
  - **Criterio de aceptación:** con la sesión caducada la acción redirige al login; el CSV descargado muestra correctamente los acentos al abrirlo en Excel en Windows.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** contra el servidor real, el CSV llega con `content-type: text/csv; charset=utf-8` y sus tres primeros bytes son **`EF BB BF`**. Con la marca, la línea acentuada se lee «corrección»; decodificada en ANSI —lo que hacía Excel antes— se lee «correcciÃ³n». `verify` backend ✅ **311/311** y frontend ✅ **389/389** (6 tests nuevos).
  - **El alcance real era mayor que el de la ficha:** `exportProductMovementsCsv` —el `<a href>` que describe— **no lo llamaba nadie**. Las dos descargas que sí usa la interfaz (catálogo y movimientos) construyen el CSV en el navegador y ya iban por axios, así que **el problema del 401 no era alcanzable**, pero **el de los acentos sí**, y en las dos. Se arregla el helper igualmente en vez de borrarlo, porque el día que se enchufe volvería a traer los tres defectos de golpe.
  - **La marca va en el CSV y no en el JSON**, donde un analizador estricto la trataría como error de sintaxis. Hay un test de cada cosa.
  - **No estorba al reimportar, y eso es una casualidad que conviene fijar:** `parseCsv` empieza con `text.trim()`, y `trim()` elimina `U+FEFF` porque el estándar lo cuenta como espacio en blanco. Si alguien cambia ese `trim()`, la primera columna pasa a llamarse ``U+FEFF`name` y todos los productos se importan sin nombre. Hay un test de ida y vuelta que lo comprueba.
  - **El primer test de la marca fallaba estando el código bien:** comprobaba `blob.text()`, que decodifica con `TextDecoder`, y **`TextDecoder` se come la marca** salvo que se le pida `ignoreBOM`. Se cambió a mirar los bytes de `arrayBuffer()`, que además es lo que de verdad importa: lo que Excel encuentra en el archivo.
  - **El lint cazó el carácter crudo** (`no-irregular-whitespace`) en los literales. Se usa el escape `"`U+FEFF`"`, que encima se lee: un `U+FEFF` incrustado en el código es invisible.

### Sistema de diseño

*Añadido el 2026-08-05 tras la consultoría de estilo UX/UI. El estilo elegido es **Flat Design + Minimalismo Suizo** con perfil **Data-Dense**, que es la recomendación para el tipo de producto «Inventory & Stock Management». Se descartaron glassmorphism y neumorphism por incompatibilidad declarada con interfaces densas en datos y con requisitos de contraste — habrían agravado las ocho tareas de accesibilidad de este mismo tier.*

**Principio rector:** en una aplicación de inventario el color es **dato**, no decoración. Stock bajo, orden cancelada, movimiento `IN`/`OUT`. Si el cromo de la interfaz compite por el color, el usuario pierde la señal. De ahí la separación: **cromo neutro (slate), color reservado para el estado.**

- [x] **[T2-35] Definir la capa de tokens semánticos en `@theme`** ✅ *(2026-08-07)*
  - **Área:** UI/UX / Arquitectura
  - **Ubicación:** `Stockly-F/src/index.css`
  - **Qué hacer:** Hoy `index.css` declara **un solo token** (`--font-sans`); todo lo demás son utilidades crudas de Tailwind repartidas por los componentes. Declarar la capa semántica completa en el bloque `@theme` de Tailwind 4, que ya está en uso. Paleta *Industrial slate + stock green*, con los contrastes verificados contra blanco:

    | Token | Valor | Contraste | Uso |
    |---|---|---:|---|
    | `--color-background` | `#F8FAFC` | — | Fondo de página |
    | `--color-surface` | `#FFFFFF` | — | Tarjetas, tablas, modales |
    | `--color-surface-muted` | `#F2F3F4` | — | Cabeceras de tabla, filas alternas |
    | `--color-foreground` | `#0F172A` | 18.1:1 ✓ AAA | Texto principal |
    | `--color-foreground-muted` | `#64748B` | 4.8:1 ✓ AA | Texto secundario |
    | `--color-border` | `#E6E8EA` | — | Separadores |
    | `--color-primary` | `#334155` | 10.4:1 ✓ AAA | Acción primaria, cromo |
    | `--color-accent` | `#059669` | 3.8:1 | **Solo** bordes e indicadores |
    | `--color-accent-strong` | `#047857` | 5.5:1 ✓ AA | Rellenos con texto blanco |
    | `--color-success` | `#047857` | 5.5:1 ✓ AA | Estado correcto, `IN` |
    | `--color-warning` | `#B45309` | 5.0:1 ✓ AA | Stock bajo, pendiente |
    | `--color-danger` | `#DC2626` | 4.8:1 ✓ AA | Agotado, cancelado, `OUT` |
    | `--color-info` | `#1D4ED8` | 6.7:1 ✓ AA | Informativo, neutro |

    Cada color de estado lleva su par de superficie (`--color-success-surface: #ECFDF5`, `--color-warning-surface: #FFFBEB`, `--color-danger-surface: #FEF2F2`, `--color-info-surface: #EFF6FF`) para los fondos de badge. Completar con elevación (`--shadow-raised: 0 1px 2px rgb(15 23 42 / 0.06)` y `--shadow-overlay: 0 8px 24px rgb(15 23 42 / 0.12)` — nombres nuevos, sin colisión) y movimiento (`--duration-fast: 150ms`, `--duration-base: 200ms`, `--ease-standard`).

    **Dos precisiones que evitan regresiones silenciosas:**

    1. **No redefinir los `--radius-*` de Tailwind.** Cambiar `--radius-lg` alteraría de golpe las 68 utilidades `rounded-lg`/`rounded-xl` ya escritas. Se fija la *convención de uso* (`rounded-xl` superficies, `rounded-lg` controles, `rounded-full` badges) y la aplica T3-14.
    2. **El acento tiene dos valores a propósito.** Blanco sobre `#059669` (emerald-600) da **3.77:1** y **falla AA** para texto normal; los rellenos usan `#047857`. El valor de la ficha de la skill es el primero — la corrección es deliberada.
  - **Criterio de aceptación:** `index.css` declara la capa semántica completa; cambiar `--color-accent` por un valor de prueba altera el acento en toda la aplicación sin tocar ningún componente; cada par de la tabla se verifica con una herramienta WCAG.
  - **Verificado localmente (2026-08-07):** los tres puntos del criterio, uno a uno.
    1. **Capa completa** — 17 colores, 2 sombras, `--ease-standard` y las 2 duraciones, con `theme.test.ts` (13 tests) comprobando que están todos declarados.
    2. **Propagación** — se cambió `--color-accent` a `#ff00ff`, se reconstruyó y el CSS de salida quedó con `--color-accent:#f0f`; las utilidades se emiten como `.text-accent{color:var(--color-accent)}`, así que todo consumidor sigue el token. Valor revertido después.
    3. **Contrastes** — no se dan por buenos los de la ficha: el test **los recalcula desde `index.css`** con la fórmula WCAG 2.1 y falla si un token baja del mínimo. Incluye el límite superior del acento suave (≥ 3:1 para bordes pero < 4.5:1), que es lo que evita que alguien lo «arregle» y deshaga el par accent/accent-strong.

    **Corrección sobre la paleta de la ficha:** `--color-danger: #dc2626` cumple contra blanco (4.83) pero sobre **su propia superficie de badge** (`#fef2f2`) se queda en **4.41 y falla AA** — los ratios estaban medidos solo contra blanco. Se cambió a **`#b91c1c`**: 6.47 sobre blanco y 5.91 sobre su superficie. Lo destapó el test, no la revisión a ojo.

    **Comprobado empíricamente contra Tailwind 4:** `bg-background`, `text-foreground-muted`, `border-border`, `bg-accent-strong`, `bg-success-surface`, `shadow-raised`, `shadow-overlay` y `ease-standard` se generan como utilidades; **`duration-fast` no**, porque Tailwind 4 no tiene espacio de nombres `--duration-*`. Por eso las dos duraciones viven en `:root` y no en `@theme`, con el comentario que lo explica.

    Sin tocar ningún `--radius-*`, como pedía la precisión 1 — hay un test que lo vigila.
  - **Nota de alcance:** los componentes siguen usando utilidades crudas; la capa está lista pero aún no la consume nadie. Eso es **T2-36** (`Button` y `Badge`) y **T2-37** (el resto).
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T2-36] Migrar `Button` y `Badge` a variantes semánticas** ✅ *(2026-08-07)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/shared/components/Button.tsx:9-14`, `Badge.tsx:10-18`
  - **Qué hacer:** Son los dos primitivos de los que cuelga el resto de la interfaz, así que la migración se propaga sola. En `Button`, sustituir los literales (`bg-blue-600`, `bg-gray-100`, `bg-red-600`) por los tokens, usando `--color-accent-strong` en los rellenos por lo dicho en T2-35. En `Badge`, las siete variantes actuales mezclan semántica (`success`, `danger`) con decoración (`blue`, `purple`, `orange`, `teal`): `purple` y `teal` se usan **una vez cada una** en toda la aplicación. Reducir a cinco variantes con significado — `neutral | success | warning | danger | info` — mapeadas a los pares `--color-<estado>-surface` / `--color-<estado>`, y reasignar los 12 usos existentes según lo que el badge realmente comunica.
  - **Criterio de aceptación:** ninguno de los dos archivos contiene utilidades `bg-<familia>-<n>`; `pnpm test:run` sigue en verde; los badges de estado de órdenes conservan su significado y ningún estado queda sin variante propia.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35
  - **Verificado localmente (2026-08-07):** cero coincidencias de `(bg|text|border)-<familia>-<n>` en `Button.tsx` y `Badge.tsx`, y cero usos de las variantes decorativas (`blue`, `purple`, `orange`, `teal`, `default`) en toda la aplicación. `pnpm verify` ✅ **231/231**. Los tests de ambos primitivos comprueban además, con una expresión regular sobre el `className` renderizado, que **ninguna variante emite una utilidad cruda** — no basta con que hoy no las haya. En el CSS construido se confirmó que las 11 utilidades nuevas (`bg-primary`, `bg-danger`, `bg-success-surface`, `text-warning`…) se generan de verdad.

    **Reasignación de los badges, por lo que comunican:** estados de orden `PENDING → warning` (hay algo por hacer), `RECEIVED`/`SHIPPED → success`, `CANCELLED → danger`. Categoría de producto `blue → neutral`: clasifica, no informa de un estado. Rol ADMIN `blue → info`. «Sin verificar» y avisos de stock `orange → warning`. Movimientos: `ADJUSTMENT → info` e `IMPORT → neutral`, que no mueven mercancía real y no compiten con `IN`/`OUT` por el color. Auditoría: `RESTORE` pasa a `success` porque deshace un borrado, y `purple`/`orange` a `info`. `BadgeVariant` se exporta, así que los cuatro mapas de variantes del proyecto quedan tipados contra las cinco válidas — el compilador cazó un `purple` superviviente en `USER_ROLE_CHANGE`.

    **Prueba intermitente corregida por el camino:** el E2E de configuración (T1-23) esperaba a que «Guardar cambios» se deshabilitara, pero ese botón también se deshabilita **mientras la petición está en vuelo**, así que la recarga podía adelantarse al guardado. Ahora espera a la respuesta del PATCH. Falló 1 de 2 veces antes del arreglo; **3 pasadas seguidas en verde** después.

- [x] **[T2-37] Erradicar las utilidades de color crudas del resto de la interfaz** ✅ *(2026-08-07)*
  - **Área:** UI/UX / Refactorización
  - **Ubicación:** transversal — **41 de los 57 archivos `.tsx`** de `Stockly-F/src/`
  - **Qué hacer:** Medido: **561 utilidades** de color literal (`bg|text|border|ring-<familia>-<n>`), repartidas en 386 `gray`, 66 `blue`, 35 `red`, 30 `orange`, 16 `green` y una cola de `purple`, `amber`, `emerald` y `teal` sueltas. Mientras existan, cualquier ajuste de paleta —y el modo oscuro de T4-03— es una edición de 561 puntos. La mayor parte es sustitución mecánica (`text-gray-900`→`text-foreground`, `text-gray-500`→`text-foreground-muted`, `border-gray-200`→`border-border`, `bg-white`→`bg-surface`). Reservar el juicio para los usos que ya codifican estado: `DashboardPage.tsx:36-40` define las tarjetas de KPI con pares `bg-*-50`/`text-*-600` que pasan a los pares de estado del token.
  - **Criterio de aceptación:** `grep -rE "\b(bg|text|border|ring)-(slate|gray|red|orange|amber|green|emerald|teal|blue|indigo|purple)-[0-9]{2,3}" --include="*.tsx" src/` devuelve cero resultados fuera de una lista de excepciones documentada; una comparación visual de las páginas principales no muestra regresiones.
  - **Esfuerzo:** medio
  - **Depende de:** T2-36
  - **Verificado localmente (2026-08-07):** **593 sustituciones en 39 archivos**, hechas con un codemod en Node (no con PowerShell: `Set-Content` destroza el UTF-8). El grep del criterio devuelve **cero resultados, sin excepciones**, y ya no depende de que alguien se acuerde de ejecutarlo: `src/tests/tokens.test.ts` recorre todos los `.ts`/`.tsx` en cada `pnpm verify` y falla nombrando archivo y clase. `verify` ✅ **232/232**; E2E ✅ 9 pasados, 1 omitido.
  - **Comparación visual (Chrome DevTools, capturas antes/después):** dashboard, productos y reportes. Maquetación idéntica; los únicos cambios son los buscados — la marca pasa al acento, «Categorías» deja de ser decorativa y los avisos de stock adoptan el ámbar del token `warning`.
  - **Regresión encontrada y corregida en esa comparación:** el fondo de página era `bg-gray-50` y el codemod lo mandó a `bg-surface-muted`, **el mismo valor que el botón secundario**, que quedó invisible sobre él (se vio en la captura de reportes: «Descargar PDF» sin fondo). Los 9 contenedores de página pasan a `bg-background`. Es exactamente el fallo que una sustitución mecánica no puede evitar: `gray-50` significaba dos cosas distintas según dónde estuviera.
  - **Dos decisiones de criterio, no mecánicas:** los enlaces van a `text-info` —mantienen la afordancia azul y cumplen AA— en vez de a `text-primary`, que los dejaría en gris pizarra; y los indicadores de foco pasan a `ring-accent`, el verde de la marca, en lugar de un azul suelto.
  - **Fuera del alcance de la tarea:** las paletas de los gráficos de Recharts siguen como hex en el componente. No son utilidades —`fill`/`stroke` son props, no clases—, así que el criterio no las cubre; llevarlas a los tokens exigiría leer las variables CSS desde JS. Anotado como candidato.

- [x] **[T2-38] Comunicar el estado con icono además de color**
  - **Área:** Accesibilidad / UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx`, `dashboard/components/DashboardPage.tsx`, `sale-orders/components/SaleOrdersPage.tsx`, `purchase-orders/components/PurchaseOrdersPage.tsx`
  - **Qué hacer:** Los tres conjuntos de estado del producto —nivel de stock (correcto / bajo / agotado), estado de orden (`PENDING`/`SHIPPED`/`RECEIVED`/`CANCELLED`) y tipo de movimiento (`IN`/`OUT`)— se distinguen hoy únicamente por color, lo que incumple WCAG 1.4.1 y deja fuera a los usuarios con deficiencia de visión cromática: precisamente la información crítica de una aplicación de inventario. Acompañar cada estado de un icono de Heroicons y de su texto. Es el mismo principio que T2-17 aplica a los colores de etiqueta elegidos por el usuario.
  - **Criterio de aceptación:** con el filtro de escala de grises del navegador activado, los tres conjuntos de estado siguen siendo distinguibles entre sí en tabla, dashboard y listados de órdenes.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-36
  - **Verificado localmente (2026-08-08):** `verify` ✅ **257/257** (25 tests nuevos), E2E ✅ 9 pasados 1 omitido. Etiqueta, color e icono de cada estado salen ahora de un único descriptor en `Stockly-F/src/shared/lib/estados.ts`, así que en la interfaz **no hay forma de poner el color sin el icono**; `Badge` acepta el icono como prop y `EstadoBadge` pinta el descriptor entero.
  - **Comprobado con el filtro de escala de grises del navegador** (capturas en gris de tabla de productos, órdenes de compra, órdenes de venta, historial de movimientos y dashboard), que es el criterio de aceptación: nivel de stock (triángulo / círculo con aspa), actividad (visto / prohibido), estado de orden (reloj, camión, visto, aspa) y tipo de movimiento (flecha hacia dentro / hacia fuera) se distinguen sin color. Para llegar a los estados que la base de desarrollo no tenía —agotado, pendiente y enviado— se creó un producto y dos ventas temporales; **se borraron después** y la base quedó como estaba.
  - **Defecto que la tarea destapó:** «bajo» y «agotado» eran el mismo triángulo ámbar en la tabla de productos, indistinguibles incluso **con** color. Ahora `nivelDeStock()` los separa y agotado tiene prioridad sobre bajo — cero no es el extremo de «bajo», es otro estado.
  - **El test comprueba la propiedad, no la escritura:** `src/tests/components/estados.test.tsx` renderiza cada estado, extrae del SVG los atributos `d` —la geometría del trazo, no el nombre del componente importado, que puede diferir dibujando lo mismo— y exige que dos estados del mismo conjunto no coincidan, con una comprobación aparte para los que comparten color. Falsificado a propósito: dando a «Cancelado» el reloj de «Pendiente», el test falla.
  - **Más allá de la ubicación listada:** el mismo patrón estaba en `UsersPage` (activo/inactivo, rol, sin verificar) y en `ProductDetailModal`; se migraron para no dejar la mitad de la aplicación con el criterio viejo. Un estado que la API añada y la interfaz no conozca cae en la variante neutra con su código en crudo, en vez de heredar el color del último conocido.

- [x] **[T2-39] Cifras tabulares en las columnas numéricas**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx`, `dashboard/components/DashboardPage.tsx:64-77`, `reports/components/ReportsPage.tsx`
  - **Qué hacer:** Stock, precios, totales e importes se renderizan con las cifras proporcionales de Inter: las columnas no alinean verticalmente entre filas y los KPI cambian de ancho al refrescarse. Inter incluye cifras tabulares; aplicar `tabular-nums` a las celdas numéricas de tabla y a los contadores del dashboard.
  - **Criterio de aceptación:** en una tabla con valores de uno a cinco dígitos las unidades quedan alineadas en vertical; el KPI de valor de inventario no cambia de ancho al actualizarse.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35
  - **Verificado localmente (2026-08-08):** `verify` ✅ **260/260**, E2E ✅ 9 pasados 1 omitido. **Medido en el navegador, que es donde se puede medir:** jsdom no tiene métricas de fuente, así que las cifras se midieron sobre la aplicación en marcha con `getBoundingClientRect`.
  - **Las cifras del KPI de valor de inventario, mismo formato y distintos dígitos:** sin cifras tabulares `$1,111,111.11` mide **126.39 px** y `$8,888,888.88` mide **176.81 px** — el bloque se movía **50 px** en cada refresco. Con ellas, ambos miden **174.7 px**: diferencia **0**. A escala de dígito suelto, Inter da «1» = 6.51 px y «8» = 9.90 px.
  - **Alineación vertical de las unidades:** los bordes derechos de la columna de stock de la tabla de productos, con valores de uno y dos dígitos, caen todos en la **misma coordenada** (966.28 px). Las cifras tabulares por sí solas no bastaban para eso: hizo falta además alinear a la derecha la columna de precio y meter el stock en una caja de ancho fijo (`min-w-10 text-right`), porque detrás vienen el icono de incidencia y el mínimo, cuyo ancho sí cambia de fila a fila.
  - **La regla vive en `index.css` (`table { font-variant-numeric: tabular-nums }`), no celda a celda:** una tabla de inventario existe para comparar cifras en vertical, así que la próxima que alguien escriba nace alineada en lugar de depender de que se acuerde. Fuera de tablas —KPI del dashboard y de reportes, totales de órdenes, stock de la ficha de movimientos— sí va la utilidad explícita.
  - **Trampa encontrada al montar la contraprueba:** medir con la clase `proportional-nums` daba el mismo ancho, porque Tailwind solo genera las utilidades que encuentra en el código fuente y esa no estaba escrita en ninguna parte. La contraprueba válida usa `style.fontVariantNumeric`.

- [x] **[T2-40] Densidad de tabla en escritorio y mínimo táctil en móvil** *(mínimo táctil ✅ · fila de 36 px ❌, ver abajo)*
  - **Área:** UI/UX / Accesibilidad
  - **Ubicación:** `Stockly-F/src/shared/components/Button.tsx:26`, `Input.tsx`, `Select.tsx`, `modules/products/components/ProductTable.tsx`
  - **Qué hacer:** El perfil *Data-Dense* pide fila de 36 px, padding de tarjeta de 12 px y escala 4/8/16/24/32 en escritorio — pero esa densidad choca de frente con el mínimo táctil de 44 px en móvil, y la resolución de ese conflicto es lo que hay que decidir aquí. Medido: el `Button` base mide **36 px** de alto (`py-2` + `text-sm`), por debajo del mínimo, y es el componente de las acciones por fila y de los controles de paginación. Resolver con padding responsivo sobre el mismo componente (denso a partir de `md`, cómodo por debajo), **no** duplicando componentes.
  - **Criterio de aceptación:** a 375 px de ancho ninguna acción interactiva mide menos de 44×44 px CSS, verificable con el inspector; a ≥1024 px la altura de fila de la tabla de productos es de 36 px.
  - **Esfuerzo:** medio
  - **Depende de:** T2-35
  - **Verificado localmente (2026-08-08):** `verify` ✅ **269/269** (9 tests nuevos), E2E ✅ 9 pasados 1 omitido. Medido en el navegador con emulación de dispositivo (375×812, táctil) y a 1280 px.
  - **Mínimo táctil — criterio cumplido:** de **71 dianas por debajo de 44×44 a 0**, barriendo productos, órdenes de compra y de venta, usuarios, configuración y el modal de nueva orden, con el menú de navegación y el de usuario desplegados. La medición cuenta el envoltorio pulsable, no solo el control: una casilla de 16 px cumple si su etiqueta ocupa 44×44.
  - **Fila de 36 px en escritorio — NO se cumple, y no por descuido.** La fila pasa de **64.8–80.8 px a 48.8–68.8** (−40 % en el caso común), pero 36 es inalcanzable con el contenido actual. La aritmética a ≥1024 px: relleno 6 + 6, nombre 20, SKU 16 → **48 px**; y la celda de imagen, 6 + 32 + 6 → **44 px**. Llegar a 36 exige **quitar la línea del SKU y bajar la miniatura a 24 px**, que es empeorar la tabla para cuadrar una cifra. Se deja en 48 y se documenta; la decisión de sacrificar el SKU o la miniatura es de producto, no de implementación.
  - **Un mismo componente en dos densidades, no dos componentes:** `min-h-11` (44 px) hasta `md` y `md:min-h-9` (36 px) a partir de ahí, en `Button`, `Input`, `Select`, `DropdownButton`, las pestañas y el botón de cerrar del modal. A 1280 px el `Button` mide exactamente **36 px**.
  - **Los controles que no pueden crecer reciben el toque en su envoltorio:** la casilla de selección (16 px) va dentro de una etiqueta de 44×44, y el interruptor de configuración (carril de 44×24) dentro de un botón de 44 px de alto. El dibujo no cambia; la diana, sí.
  - **Cambio de maquetación que el criterio obligaba:** los ítems de las órdenes se montaban en una rejilla de 12 columnas también a 375 px, y el campo «Cant.» quedaba en **38 px de ancho**. Ninguna altura mínima arregla eso: la rejilla ahora es de 2 columnas hasta `md`.
  - **Regresión propia, detectada por el E2E:** para nombrar la casilla usé un `<span class="sr-only">Seleccionar {nombre}</span>` dentro de la etiqueta, y ese texto se suma al árbol de texto de la fila: el nombre del producto pasó a aparecer **dos veces** y `getByText` falló por ambigüedad. Corregido con `aria-label` en el `input`, que da el mismo nombre accesible sin añadir texto.

- [x] **[T2-41] Escala tipográfica explícita y recorte de pesos de Inter**
  - **Área:** UI/UX / Rendimiento
  - **Ubicación:** `Stockly-F/src/index.css:2-5`, transversal
  - **Qué hacer:** Inter es la elección correcta y se mantiene —es el emparejamiento recomendado para paneles de administración—, pero su uso es hoy implícito. Medido: la escala real en uso es `text-sm` (104), `text-xs` (65), `text-2xl` (17), `text-base` (15), `text-xl` (8) y `text-lg` (**1 sola vez**, que es ruido); y los pesos son `font-medium` (57), `font-semibold` (33), `font-bold` (27) y `font-black` (1). **`font-black` (900) no está entre los pesos importados** (`index.css` carga 400/500/600/700), por lo que ese texto se renderiza con negrita sintética. Fijar la escala con roles declarados, eliminar el `text-lg` y el `font-black` huérfanos, y verificar que los cuatro pesos importados son los cuatro usados. Contribuye directamente a T2-06.
  - **Criterio de aceptación:** la escala está declarada en `@theme` con un rol por tamaño; no queda ningún peso usado sin importar ni importado sin usar; el CSS de fuentes baja de peso de forma medible.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35
  - **Verificado localmente (2026-08-08):** `verify` ✅ **279/279** (10 tests nuevos), E2E ✅ 9 pasados 1 omitido. La escala se declara en `@theme` **borrando antes los espacios de nombres** (`--text-*: initial`, `--font-weight-*: initial`): los tamaños y pesos no declarados dejan de existir, así que esto no es documentación sino una restricción real. Quedan cinco tamaños con un papel cada uno (xs metadatos, sm cuerpo, base título de tarjeta, xl título secundario, 2xl título de página y KPI) y cuatro pesos.
  - **Los dos huérfanos, fuera:** `text-lg` (1 uso) pasa a `text-xl`, y el `404` deja `text-6xl font-black` —un tamaño y un peso que no usaba nadie más, y el 900 **ni siquiera estaba cargado**: el navegador lo fingía— por `text-2xl font-bold`. La auditoría no había contado el `text-6xl`; salió al borrar el espacio de nombres.
  - **El CSS de fuentes baja de forma medible, y por una razón concreta:** `@fontsource/inter/400.css` declara **siete `@font-face` por peso** (cirílico, cirílico ext., griego, griego ext., latino, latino ext. y vietnamita); los `latin-*.css` declaran uno. Medido con dos compilaciones reales: **56 → 8 archivos de fuente emitidos** y el CSS de **78.40 kB → 68.40 kB** (gzip **13.55 → 12.14 kB**). De esos 10 kB, 8.1 son los subconjuntos y 1.9 los tamaños y pesos borrados.
  - **Comprobado en el navegador:** `document.fonts` carga los cuatro pesos (400/500/600/700) como Inter, y los acentos y signos del español están todos en el subconjunto latino. Las flechas (`→`, U+2192) se pintan con la fuente de respaldo, **igual que antes**: no están en el rango latino de Google, así que no es una regresión de este cambio.
  - **El test se acusaba a sí mismo:** el escaneo de clases prohibidas encontraba `text-6xl` y `font-black` en los comentarios que explican por qué se fueron. `tipografia.test.ts` mira el código sin comentarios. Falsificado a propósito: añadir `text-3xl font-black` a un componente hace fallar dos comprobaciones.

### Hallazgos del cierre del Tier 1 (2026-08-07/08)

> No proceden de la auditoría del 2026-08-04 ni de la consultoría de diseño: salieron al cerrar
> el Tier 1 y las primeras tareas del Tier 2, y estuvieron anotados como «candidato a tarea» en
> la tabla del final hasta el 2026-08-08. La tabla de [Hallazgos nuevos](#hallazgos-nuevos-del-2026-08-0708-no-estaban-en-la-auditoría) enlaza ahora a estas tres fichas.

- [x] **[T2-42] Permitir cancelar desde la interfaz una orden de venta ya enviada** ✅ *(2026-08-08)*
  - **Área:** UI/UX / integridad de datos
  - **Ubicación:** `Stockly-F/src/modules/sale-orders/components/SaleOrdersPage.tsx:168,222`, `Stockly-F/e2e/flows.spec.ts`
  - **Qué hacer:** Las acciones de fila se pintan bajo `isAdmin && order.status === "PENDING"`, así que **la reposición de stock que implementó T0-03 —el defecto más grave de toda la auditoría— es inalcanzable desde la aplicación**: solo se puede provocar por API. El backend acepta `SHIPPED → CANCELLED` y devuelve el stock con su `StockMovement`; lo que falta es el botón. Mostrar «Cancelar» también en `SHIPPED` (no «Eliminar», que sigue siendo solo para `PENDING`) y dejar `PENDING` como está.
    Dos detalles que el código de hoy obliga a decidir:
    1. **No hay confirmación de ningún tipo en esta página.** `handleCancel` y `deleteMutation.mutate` disparan al primer clic, sin `window.confirm` ni componente de diálogo —no existe uno en `shared/components/`—. Cancelar una orden enviada **mueve inventario**, así que aquí sí hace falta: un `Modal` de confirmación que diga cuántas unidades se van a reponer. Es la diferencia entre esta acción y las otras dos.
    2. **El E2E ya cubre el flujo, pero por API.** El tercer escenario de `flows.spec.ts` (T1-23) cancela con `request` usando la sesión del navegador precisamente porque la interfaz no ofrecía el camino. Con esta tarea ese paso debe pasar por la UI, que es lo que convierte el escenario en una prueba de extremo a extremo de verdad.
  - **Criterio de aceptación:** con una orden en `SHIPPED`, un ADMIN ve la acción de cancelar, la confirma y el stock del producto vuelve a su valor previo al envío; un usuario `USER` no ve la acción; el escenario de `flows.spec.ts` hace la cancelación por la interfaz y sigue en verde.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-03 ✅, T1-23 ✅
  - **Verificado localmente (2026-08-08):** `pnpm verify` del frontend ✅ **290/290** (8 tests nuevos en `src/tests/sale-orders/SaleOrdersPage.test.tsx`, el primer archivo de pruebas de este módulo), `check` y `lint` en 0. E2E: el escenario de la venta cancelada **pasa por la interfaz de principio a fin en `chromium`**, incluida la confirmación, y el stock vuelve a 20.
  - **Falsificado:** desactivando la condición `order.status === "SHIPPED"` de la fila —el estado exacto anterior a esta tarea— caen **5 de los 8 tests**. Los tres que sobreviven son los que describen lo que no debía cambiar: la orden pendiente, el usuario `USER` y la orden cancelada.
  - **Lo que se confirma no es el cambio de estado, es el movimiento de stock.** Cancelar una orden pendiente no toca inventario y sigue siendo un clic directo, como antes; cancelar una enviada abre un diálogo que dice cuántas unidades vuelven y de qué productos. Esa asimetría es deliberada y hay un test por cada lado.
  - **El recuento del diálogo solo incluye los ítems con `productId`,** porque el backend repone con `where: { productId: { not: null } }`: un ítem escrito a mano no mueve inventario, y prometer sus unidades sería mentirle al usuario en el momento en que más caso le va a hacer. Con solo ítems manuales, el diálogo lo dice en vez de mostrar un total falso.
  - **Sin «Eliminar» en las órdenes enviadas:** el backend no permite borrarlas, así que ofrecer el botón sería preparar un 400.
  - **`Mobile Chrome`, verificado después:** al cerrarse, el escenario no llegaba a la cancelación en ese proyecto porque fallaba antes, al crear el producto —y fallaba igual con estos cambios revertidos (`git stash`)—. La causa resultó ser un defecto propio de móvil, ajeno a esta tarea: **T2-45**. Con él corregido, el escenario pasa entero también en `Mobile Chrome`.

- [x] **[T2-43] Índice por `createdAt` en `products` y revisión de `products_isActive_idx`** ✅ *(2026-08-09)*
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/prisma/schema.prisma` (modelo `Product`), nueva migración
  - **Qué hacer:** Dos cabos sueltos que dejó T1-15, ninguno de los dos contemplado en la lista de la auditoría:
    1. **Falta `Product([createdAt])`.** **Todos** los listados del catálogo ordenan por ese campo y ninguno tiene índice que lo respalde; con filtro por categoría el planificador ya usa `products_categoryId_idx`, pero el listado sin filtro —que es el caso común— sigue ordenando con un `Seq Scan` más `top-N heapsort`. Es el mismo patrón que en `audit_logs` dio **71×** al indexarse.
    2. **`products_isActive_idx` no se usa.** La consulta dominante filtra `isActive = true`, que es la mayoría de las filas, así que el planificador lo descarta —correctamente— y solo queda su coste de escritura. Convertirlo en índice parcial `WHERE "isActive" = false`, que es el filtro selectivo de verdad, o retirarlo.
  - **Criterio de aceptación:** `EXPLAIN (ANALYZE, BUFFERS)` sobre `SELECT * FROM products ORDER BY "createdAt" DESC LIMIT 10` pasa de `Seq Scan` + ordenación a `Index Scan Backward`, medido sobre el mismo volumen sintético de T1-15 (40 000 productos); la decisión sobre `products_isActive_idx` queda tomada y justificada con su plan; la migración aplica limpiamente y `pnpm verify` sigue en verde.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-15 ✅
  - **Verificado localmente (2026-08-09):** migración `20260809024157_t2_43_indices_createdat_products`. 40 000 productos sintéticos (5 % inactivos), `ANALYZE` y dos pasadas por consulta —la primera calienta la caché—:

    | Consulta | Antes | Después | |
    |---|---|---|---|
    | `ORDER BY "createdAt" DESC LIMIT 10` | `Seq Scan` + `Sort`, **10.309 ms**, 773 buffers | `Index Scan Backward`, **0.016 ms**, 7 buffers | **644×** |
    | `WHERE "isActive" = true` + mismo orden | `Seq Scan` + `Sort`, **10.170 ms**, 773 buffers | `Index Scan Backward`, **0.015 ms**, 3 buffers | **678×** |
    | `WHERE "isActive" = false` + mismo orden | `Index Scan` + `Sort`, **0.701 ms**, 775 buffers | `Index Scan Backward`, **0.022 ms**, 12 buffers | **32×** |

    `pnpm verify` completo ✅ **275/275**, cobertura 88.62 %, smoke ✅. Los productos de banco se borraron al terminar (quedan los 52 del seed).
  - **`products_isActive_idx` no se retira: se amplía.** Se comparó por SQL, sobre los mismos datos, contra las dos alternativas que planteaba la ficha. El índice **compuesto `(isActive, createdAt)`** gana a las dos: cubre el listado filtrado en los dos sentidos con un solo índice (activos 3 buffers, inactivos 12) y, como `isActive` es su prefijo, el filtro por estado a secas sigue cubierto. El **índice parcial** `WHERE "isActive" = false` iguala en el caso inactivo (12 buffers) pero no sirve para nada más y no es expresable en el esquema de Prisma, así que habría vivido en SQL suelto y en riesgo de deriva.
  - **Hacen falta los dos índices, no uno.** El filtro `isActive` es **opcional** en `getProducts` (`product.service.ts:39-42`): cuando el cliente no lo envía —el caso normal al abrir el catálogo— la consulta ordena por `createdAt` sin filtro, y el compuesto no la sirve porque su primera columna no es `createdAt`.

- [x] **[T2-44] Un único formato de importe en toda la interfaz** ✅ *(2026-08-09)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/shared/lib/` (helper nuevo), `Stockly-F/src/modules/reports/components/ReportsPage.tsx:182`, transversal
  - **Qué hacer:** En la tabla «Top por valor» conviven dos formatos en la misma fila: «Precio unit.» sale de `Number(p.price).toFixed(2)` y se ve como `$14999.00`, sin separador de miles, mientras «Valor total» usa `toLocaleString("es-MX", { minimumFractionDigits: 2 })` y sí lo lleva. Visto al alinear las columnas en T2-39, donde quedó fuera de alcance por ser formato y no alineación.
    No es un caso aislado: hay **12 usos de `toLocaleString("es-MX", …)` y 10 de `toFixed(2)`** repartidos por los `.tsx`, sin ningún helper que los unifique — la misma clase de repetición que T1-13 resolvió en el backend con `getActorEmail`. Extraer `formatearImporte()` a `shared/lib/` y sustituir los usos; distinguir los importes de las cifras que no son dinero (`dailyVelocity.toFixed(2)`, en `ReportsPage.tsx:270`, es una velocidad y no lleva `$`).
  - **Criterio de aceptación:** no queda ningún importe formateado con `toFixed` en `src/**/*.tsx`; dos importes de la misma tabla con magnitudes distintas se pintan con el mismo formato; hay un test del helper con separador de miles, dos decimales siempre y el caso del cero.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** `formatearImporte()` en `shared/lib/moneda.ts` y **18 sustituciones en 7 archivos**. `verify` ✅ **301/301** (9 tests nuevos), E2E ✅ 9 pasados 1 omitido. **Comprobado en la página real**, que es donde estaba el defecto: la fila de «Top por valor» pinta ahora `$14,999.00` junto a `$179,988.00` —antes el primero salía `$14999.00`— y el KPI conserva sus cero decimales (`$2,211,974`).
  - **`Intl.NumberFormat` con `style: "currency"`, no un `toLocaleString` con decimales:** el símbolo deja de escribirse a mano en cada llamada —eran 20 `$` sueltos— y los negativos salen bien colocados (`-$1,234.50`, no `$-1,234.50`). `signDisplay: "exceptZero"` da el `+` de la columna de variación de precio sin el `{diff >= 0 ? "+" : ""}` que había antes.
  - **Un valor no numérico da `—`, no `$NaN`.** El precio llega como cadena desde la API (`Decimal` de Prisma) y el helper la acepta, así que ya no depende de que alguien recuerde envolverlo en `Number()`.
  - **Dos exclusiones deliberadas, que el test respeta:** las etiquetas compactas de los ejes (`$${(v / 1000).toFixed(0)}k`) —un eje que dijera «$1,200,000.00» sería ilegible— y `dailyVelocity.toFixed(2)`, que es una velocidad y no lleva símbolo. El primer escáner que escribí, «un `toFixed` en la misma línea que un `$`», marcaba las tres cosas; el que queda busca los **dos patrones concretos** que había antes y se falsificó devolviendo un `toFixed(2)` a `ReportsPage`.

- [x] **[T2-45] Contener los scrollers horizontales para que no ensanchen el viewport en móvil** ✅ *(2026-08-08)*
  - **Área:** UI/UX / Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx:63`, `catalog/components/CatalogItemSection.tsx:139`, `suppliers/components/SuppliersPage.tsx:140`, `products/components/StockMovementsPage.tsx:243`
  - **Qué hacer:** En Chrome de Android, un contenedor con `overflow-x-auto` **ensancha el viewport de diseño con el ancho de su contenido aunque lo recorte visualmente**. Todo lo que sea `position: fixed` se dimensiona contra ese viewport ensanchado: en la página de productos, un `fixed inset-0` medía **663 px sobre una pantalla de 393**, así que el modal se centraba en 663 y su mitad derecha —donde está el botón primario— quedaba fuera del borde. Añadir `contain: paint` a los cuatro scrollers.
  - **Criterio de aceptación:** con la tabla de productos en pantalla a 393 px, un elemento `position: fixed; inset: 0` mide lo mismo que la pantalla; `pnpm test:e2e:full` pasa en `Mobile Chrome`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Cómo se encontró:** verificando T2-42. Los dos escenarios de `flows.spec.ts` que pasan por el formulario de producto fallaban en `Mobile Chrome` con un mensaje que apuntaba a otra parte —«el `<label>` de *Stock mínimo* intercepta el clic»—, porque Playwright pulsa en coordenadas de un botón que ya no está donde el navegador dice.
  - **Verificado localmente (2026-08-08):** medido con una sonda `position: fixed; inset: 0` en Pixel 5 (393 px): **663 px → 393 px**. `pnpm test:e2e:full` → **9 pasados, 1 omitido, 0 fallos** en `chromium` **y** `Mobile Chrome`, que venían de 2 fallos. `verify` ✅ **292/292**.
  - **Tres candidatos descartados por medición, no por intuición:** `body { overflow: hidden }` —que es lo que pone el modal— **no influye**: el viewport ya estaba ensanchado sin ningún modal abierto. `html { overflow-x: hidden }` **no cambia nada**. Quitar el `min-w-160` de la tabla **tampoco**: el ancho mínimo intrínseco de las celdas ya supera la pantalla. El único que funciona es `contain: paint`.
  - **`desbordes.test.ts` lo vigila:** recorre los `.tsx` y falla si aparece un `overflow-x-auto` sin `contain-paint`. Sin él, el próximo scroller reabre el agujero y el síntoma vuelve a aparecer a tres pantallas de distancia de la causa.
  - **Comprobado que no recorta nada:** ninguno de los cuatro contenedores tiene descendientes `absolute`, `fixed` ni `sticky`, así que la contención de pintura no puede ocultar un menú desplegable.

### Hallazgos del repaso de interfaz (2026-08-09)

> Los tres salieron de mirar la aplicación en marcha, no de la auditoría ni de un test. Se anotan
> aquí ya cerrados, porque la convención del proyecto es que ninguna tarea se dé por hecha sin
> ficha: lo que no queda escrito no sobrevive a la siguiente sesión.

- [x] **[T2-46] Delimitar los ítems de los menús desplegables y separarlos entre sí** ✅ *(2026-08-09)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/shared/lib/clasesDeItemDeMenu.ts` (nuevo), `Stockly-F/src/App.tsx`, `shared/components/NavDropdown.tsx`, `shared/components/DropdownButton.tsx`
  - **Qué hacer:** Los ítems de los tres desplegables (menú de usuario, Catálogo/Órdenes/Admin y Exportar) no mostraban dónde empieza y dónde acaba cada opción: solo cambiaban de fondo al señalarlos. Darles un borde que nazca transparente y aparezca en `hover` y `focus-visible`, unificado en un helper compartido. Lo mismo para el estado activo de Dashboard y Reportes, que debía distinguirse tanto al señalar como al estar en esa ruta.
  - **Criterio de aceptación:** los tres desplegables comparten las mismas clases de ítem y de panel; el borde ocupa sitio en reposo, así que el texto no se desplaza al señalar; hay tests que fijan el patrón.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-16
  - **Verificado localmente (2026-08-09):** medido en el navegador — altura de ítem **42 px** y hueco entre ítems **4 px**, donde antes era **0**. `verify` ✅ **380/380**, E2E ✅ 9 pasados 1 omitido.
  - **El borde nace transparente, no se añade en `hover`:** si apareciera solo al señalar, el texto bailaría un píxel al pasar por encima. Y es `focus-visible` y no `focus`, para que quien navega con teclado vea el recuadro y quien pulsa con el ratón no se lo encuentre pegado tras el clic.
  - **Separación entre ítems, descubierta al delimitarlos:** apilados sin holgura, dos recuadros contiguos comparten línea y se leen como uno solapado con el siguiente. El defecto no existía antes porque sin borde no había nada que solapar. Se probó con 2 px, se midió, y se subió a **4**; los separadores del menú de usuario perdieron sus márgenes propios, que sumaban de más.
  - **El panel también cambia:** relleno por los cuatro lados en vez de solo arriba y abajo, porque con los ítems delimitados un borde pegado al del panel se lee como un fallo de dibujo.

- [x] **[T2-47] La cabecera de la tabla de productos no debe partirse** ✅ *(2026-08-09)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx:82`
  - **Qué hacer:** Con `table-layout: auto`, un nombre de producto largo se lleva ancho de las demás columnas y la primera en romperse es «Stock / Mín», la única etiqueta de la cabecera con un espacio dentro. Prohibir el salto en la cabecera entera.
  - **Criterio de aceptación:** la cabecera se pinta en una línea con nombres de producto largos en pantalla; el nombre del producto se sigue mostrando completo.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-09):** a 1308 px, cabecera en **una línea** (40 px = 16 de texto + 24 de relleno) y «Nombre / SKU» pasa a **335 px**. De diez filas, solo envuelve la del nombre más largo, y lo hace a dos líneas con el nombre íntegro. `verify` ✅ **382/382** (2 tests nuevos).
  - **`whitespace-nowrap` en el `<thead>`, no columna a columna:** `white-space` se hereda, así que alcanza a las nueve columnas de una vez y ninguna futura nace pudiendo partirse.
  - **Descartado truncar el nombre**, que era la otra salida evidente: es el identificador con el que se escanea la tabla, y dos productos que compartan prefijo se volverían indistinguibles sin abrir el detalle. **Descartado también ensanchar en general:** con reparto automático no arregla la causa, porque un nombre más largo vuelve a quitarle sitio a otra columna.

- [x] **[T2-48] Volver al principio de la página al cambiar de ruta** ✅ *(2026-08-09)*
  - **Área:** UI/UX / Accesibilidad
  - **Ubicación:** `Stockly-F/src/shared/components/AnuncioDeRuta.tsx`, `Stockly-F/src/App.tsx:238` (enlace de salto)
  - **Qué hacer:** React Router no restablece el desplazamiento al cambiar de ruta: se conserva el del documento anterior y se aterriza a media página, con el `<h1>` por encima del borde superior. Había que subir a mano para ver en qué sección se estaba. Desplazar al principio en cada navegación nueva y enfocar `<main>` con `preventScroll`.
  - **Criterio de aceptación:** llegando desde una página desplazada, el `<h1>` de la nueva ruta queda visible por debajo de la barra fija; al retroceder se conserva la posición guardada; hay tests de las cuatro condiciones.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-18
  - **Verificado localmente (2026-08-09):** antes, desde 800 px en Reportes, ir a Dashboard dejaba la página en **202 px** con el `<h1>` en **−113 px**. Después, `scrollY: 0` y título visible, comprobado sobre **15 rutas** (las cinco de Catálogo, las dos de Órdenes, Movimientos, Reportes, Dashboard, Usuarios, Auditoría, Configuración). Retroceso: Reportes a 600 px → Dashboard → atrás → **vuelve a 600**. `verify` ✅ **386/386** (4 tests nuevos).
  - **Lo enmascaraba el `focus()` de T2-18, y por eso no parecía un desplazamiento ausente sino uno caprichoso:** al enfocar un elemento más alto que la ventana, el navegador desplaza *lo mínimo*, y desde abajo eso alinea el **final** de `<main>` con el borde inferior, nunca su principio. Los 202 px no eran arbitrarios: `scrollHeight 1091 − ventana 889`. De ahí que el foco pase a pedirse con `preventScroll`: quien decide dónde queda la página es el `scrollTo`, y no dos mecanismos peleándose.
  - **En `POP` no se toca nada.** Atrás y adelante restauran la posición de esa entrada del historial, y forzar el principio borraría justo lo que se espera recuperar al volver.
  - **El enlace «Saltar al contenido» tenía el mismo defecto** —dependía de que `focus()` desplazara, con la misma alineación por el final— y se corrige igual.
  - **`window.scrollTo` de relevo en `src/tests/setup.ts`:** jsdom no lo implementa y cada llamada real escupía «Not implemented» por la salida de los tests, tapando los avisos que sí importan.

---

## Tier 3 — Pulido y mantenimiento

- [x] **[T3-01] Traducir los comentarios y el mensaje de error en inglés** ✅ *(2026-08-10)*
  - **Área:** Ortografía y redacción
  - **Ubicación:** `Stockly-B/src/modules/users/users.service.ts:63`, `settings/settings.service.ts:3`, `audit-logs/audit-logs.service.ts:38`, `shared/middlewares/upload.middleware.ts:28`
  - **Qué hacer:** Cuatro puntos en inglés en una base de código con comentarios íntegramente en español. El cuarto es un mensaje que llega al usuario: `new Error("Upload failed")` → `"No se pudo subir la imagen"`.
  - **Criterio de aceptación:** no quedan comentarios ni mensajes de usuario en inglés en `src/`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** `verify` backend ✅ **357/357**. Un barrido sobre `src/` completo —no solo sobre las cuatro ubicaciones de la ficha— no devuelve ningún comentario ni mensaje en inglés fuera de `src/generated/`, que es código emitido por Prisma y no se toca.
  - **Una de las cuatro ubicaciones estaba caducada.** La ficha señalaba `upload.middleware.ts:28`, pero ese archivo cambió con T2-32 y en la línea 28 ya no hay nada en inglés: el mensaje vive ahora en la 105. Buscar por contenido en vez de por número encontró exactamente los mismos cuatro puntos, ni uno más.
  - **El cuarto no era un comentario, era un mensaje que llega al usuario.** `new Error("Upload failed")` sale del manejador de errores hacia el cliente cuando Cloudinary devuelve la llamada sin error y sin resultado. Ahora es «No se pudo subir la imagen», con una nota al lado explicando por qué va en español y no en inglés como el resto de errores de librería.

- [x] **[T3-02] Convertir `User.role` y los campos de `AuditLog` a enums de Prisma** ✅ *(2026-08-10)*
  - **Área:** Código
  - **Ubicación:** `Stockly-B/prisma/schema.prisma:154,181-182`
  - **Qué hacer:** La migración `20260601200000` convirtió los estados de órdenes y movimientos a enums nativos, pero `role String @default("USER")` y `AuditLog.action`/`entity` quedaron fuera, pese a tener tipos unión bien definidos en TypeScript. Añadir `enum Role { ADMIN USER }` y los enums de auditoría con su migración.
  - **Criterio de aceptación:** la base de datos rechaza un rol inexistente; `requireRole` y la suite siguen pasando.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** `verify` backend ✅ **357/357**, cobertura **91.33 %** (9 tests nuevos). Criterio literal cumplido: un `INSERT` con `role = 'SUPERADMIN'` **por SQL crudo** —saltándose el `z.enum` de la ruta y los tipos de Prisma— es rechazado por la base con `invalid input value for enum`. `requireRole` sigue dando 200 a un ADMIN y 403 a un USER.
  - **La migración se escribió a mano**, como la de 2026-06-01 que convirtió los estados: el diff automático de Prisma para pasar de `text` a enum es borrar la columna y crearla vacía. Con `USING` los datos se conservan y una fila fuera del enum haría fallar la migración en vez de perderse. Comprobados antes los valores presentes: ADMIN/USER en `users`, y CREATE, DELETE, SALE_SHIP, SALE_CANCEL sobre Product y SaleOrder en `audit_logs`.
  - **Las uniones de TypeScript dejan de existir por duplicado.** `AuditAction` y `AuditEntity` se importan ahora del cliente generado, así que añadir una acción es tocar el enum y migrar; olvidar uno de los dos pasos lo detecta `tsc`.
  - **El cambio destapó que los filtros aceptaban cualquier cadena.** Al tipar las columnas, `where: { role: query.role }` dejó de compilar, lo que obligó a decidir qué hacer con `?role=basura` —hasta ahora devolvía lista vacía por accidente—. Se responde **400**: ignorar el filtro sería peor, porque `?role=admin` en minúscula devolvería **todos** los usuarios en vez de ninguno.
  - **Y destapó un 500 alcanzable desde la URL, que no estaba en la ficha.** La guarda de `sale-orders` era `status in $Enums.SaleOrderStatus`; los enums generados son objetos literales, así que heredan de `Object.prototype` y `"toString" in …` devuelve **verdadero**. `?status=toString` pasaba la guarda, se casteaba a enum y reventaba dentro de Prisma. Reproducido como 500 antes de arreglarlo; el ayudante compartido usa `Object.hasOwn` y responde 400.

- [x] **[T3-03] Unificar el estilo de exportación del módulo de productos** ✅ *(2026-08-10)*
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/src/modules/products/product.controller.ts`, `product.service.ts`
  - **Qué hacer:** `products` exporta funciones sueltas mientras los otros once módulos exportan objetos (`usersController`, `settingsService`, …). Alinear con el estilo mayoritario al tocar el módulo; no justifica un cambio masivo aislado.
  - **Criterio de aceptación:** los doce módulos siguen la misma convención de exportación.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-13
  - **Verificado localmente (2026-08-10):** los **doce** controladores y los **doce** servicios exportan un objeto con nombre. `verify` backend ✅ **362/362**, cobertura **91.23 %** (5 tests nuevos).
  - **No era solo `products`, eran cinco.** La ficha decía que los otros once módulos ya exportaban objetos; medido, exportaban funciones sueltas **`audit-logs`, `products`, `purchase-orders`, `reports` y `sale-orders`**, frente a siete que sí. Los doce servicios, en cambio, ya eran objeto: la convención existía y lo que fallaba era el lado del controlador.
  - **Aquí hay una tensión con la propia ficha, y se resuelve a favor del criterio.** «No justifica un cambio masivo aislado» se escribió suponiendo que divergía un módulo; con cinco, el criterio —«los doce siguen la misma convención»— solo se cumple tocándolos todos. Se hizo, pero con una transformación mecánica y comprobada: se verificó antes que esos archivos no tienen nada en el nivel superior salvo imports y funciones exportadas, y que ninguna función llama a otra del mismo archivo, que es lo que rompería al pasar a métodos de objeto.
  - **Lo que gana no es estética:** con dos estilos conviviendo, `product.routes.ts` importaba **trece nombres sueltos** y renombrar un manejador obligaba a tocar la lista entera. Ahora cada archivo de rutas nombra su módulo una vez.
  - **La guarda recorre el directorio**, no una lista: un módulo nuevo entra solo. Comprueba las dos mitades —que exista el objeto y que **no** queden funciones sueltas exportadas—, porque tener ambas cosas a la vez es justo el estado de un refactor a medias. **Falsificada** añadiendo un `export function` a `tags`: el test lo señala por nombre.

- [x] **[T3-04] Simplificar el intercalado de enlaces de la navegación** ✅ *(2026-08-10)*
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-F/src/App.tsx:195-208`
  - **Qué hacer:** Señalado ya en la revisión de 2026-07-15 y aún presente: `navLinks.slice(0, 1)` y `navLinks.slice(1)` para colocar los desplegables entre «Dashboard» y «Reportes». Sustituir por un único array de elementos discriminados por `kind: "link" | "dropdown"`.
  - **Criterio de aceptación:** añadir un enlace a la barra no requiere entender aritmética de índices; la navegación renderiza en el mismo orden.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** `verify` frontend ✅ **419/419** (5 tests nuevos). El orden de escritorio sigue siendo Dashboard · Catálogo · Órdenes · Reportes · Admin, y el de móvil —los dos enlaces sueltos arriba, las secciones debajo— también.
  - **El orden no estaba en ningún sitio, y ese era el problema de fondo.** Los dos enlaces vivían juntos en `navLinks` y se separaban al pintarlos con `slice(0, 1)` y `slice(1)`: para saber dónde caía «Reportes» había que leer las dos expresiones a la vez y reconstruirlo mentalmente. Ahora el array **es** el orden, con `kind: "link" | "dropdown"` en cada elemento.
  - **Se movieron al array dos cosas que estaban sueltas en el cuerpo del componente:** `catalogActive` y `ordersActive`, que ahora son la función `activoEn` de cada desplegable, y la condición de administrador, que es una propiedad `soloAdmin` en vez de un `&&` en medio del JSX.
  - **El móvil sigue agrupando por tipo a propósito**, no por el orden de la barra. Es una decisión de diseño previa —enlaces planos arriba, secciones con subtítulo debajo— y unificarla habría sido un cambio de comportamiento que la ficha no pedía. Lo que antes era un `slice` es ahora un `filter` que dice qué agrupa.
  - **Nada comprobaba el orden hasta ahora**, que es lo que hacía arriesgado el refactor: la única verificación posible era abrir la aplicación y mirar. Los cinco tests nuevos lo fijan, incluido el resaltado del desplegable de la sección activa.

- [x] **[T3-05] Unificar las cabeceras de exportación CSV entre repos** ✅ *(2026-08-10)*
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/src/shared/lib/csv.ts:1-11`, `Stockly-F/src/modules/products/utils/importExport.ts:5-26`
  - **Qué hacer:** El escapado está duplicado literalmente (incluido el comentario) y las cabeceras difieren: el backend incluye `sku`, `minStock` y `tags`; el frontend no. El mismo botón «Exportar CSV» produce columnas distintas según la ruta. Unificar las cabeceras y, como mínimo, documentar la duplicación en ambos archivos.
  - **Criterio de aceptación:** ambas exportaciones producen las mismas columnas en el mismo orden; los tests de `importExport.test.ts` y `csv.test.ts` lo verifican.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** `verify` frontend ✅ **409/409**, `verify` backend ✅ **357/357**. Las dos exportaciones producen las **mismas once columnas en el mismo orden**, fijado en ambos repositorios como la misma cadena literal: `name,description,sku,price,stock,minStock,isActive,categoryName,brandName,supplierName,tags`.
  - **El enunciado de la ficha no era exacto y conviene dejarlo dicho:** el botón «Exportar CSV» de la interfaz **no** tiene dos rutas. Siempre arma el archivo en el navegador a partir del JSON. Quien producía las once columnas era `GET /products/export?format=csv`, que la interfaz no usa pero está documentado en Swagger y es el que optimizó T2-05. La divergencia real era entre exportar por la aplicación y exportar por la API.
  - **Los tres campos ya venían en la respuesta.** `filaDeExportacion` enviaba `sku`, `minStock` y `tags` desde el backend, y el frontend los descartaba porque `ExportedProduct` no los declaraba. No había que añadir datos, había que dejar de tirarlos.
  - **`price` estaba mal tipado, y se comprobó sobre la respuesta real.** El frontend lo declaraba `number`; el backend lo serializa como cadena porque es `Decimal` en Prisma. Medido ejecutando la exportación: `{"price":"10.5", …}`. Es la misma clase de divergencia que T2-24 puso a vigilar.
  - **La duplicación se queda, declarada en los dos archivos.** No hay paquete compartido entre repositorios, así que el escapado sigue repetido palabra por palabra. Lo que impide que se separen no es el comentario: es que cada repositorio fija la misma cabecera en un test suyo, y cambiar un lado pone en rojo ese lado.
  - **De once columnas, la reimportación entiende siete.** `sku`, `minStock`, `supplierName` y `tags` se exportan pero el importador los ignora, aquí y en el `importProductsSchema` del backend. Un test lo fija: sobran sin descolocar el resto. Ampliar el importador es otra tarea y no se ha hecho.

- [x] **[T3-06] Decidir explícitamente sobre `.agents/skills/` en el control de versiones** ✅ *(2026-08-10)*
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/.agents/skills/**`, `Stockly-F/.agents/skills/**`
  - **Qué hacer:** Cientos de archivos markdown de tooling de IA (zod, vitest, prisma, react-best-practices…) están rastreados por git en ambos repos, generando ruido en clones, diffs y búsquedas por texto. Si es tooling personal, añadir `.agents/` al `.gitignore` y sacarlo del índice; si se comparte deliberadamente, documentarlo en el README para que no parezca un descuido.
  - **Criterio de aceptación:** hay una decisión aplicada y documentada; `git grep` sobre el código de aplicación no devuelve resultados de estos archivos.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Decisión del propietario del proyecto (2026-08-10): se comparten a propósito.** Stockly se trabaja desde varias máquinas y el tooling debe viajar con el repositorio. Queda documentado en el README y en el `CLAUDE.md` de **ambos** repositorios, para que no se lea como un `.gitignore` que falta.
  - **La ficha se quedaba corta en el alcance:** hablaba de `.agents/skills/`, pero `.claude/` también está rastreado y en el frontend pesa más. Medido: **294 archivos bajo `.agents/` y 164 bajo `.claude/` de 657 rastreados** en `Stockly-F` —el 70 %—, y **104 + 9 de 289** en `Stockly-B`.
  - **El ruido de búsqueda estaba medido antes de atacarlo:** de los 59 archivos de `Stockly-F` que mencionan `z.object`, **53 son documentación de tooling**; con `useForm`, 48 de 62.
  - **Criterio cumplido con un alias versionado**, `git buscar`, que vive en `.gitconfig-stockly` y se activa una vez por clon con `git config --local include.path ../.gitconfig-stockly`. Comprobado: `git grep -il z.object` devuelve **61** archivos y `git buscar-archivos` devuelve **8**, todos en `src/`. En el backend, 57 → 14.
  - **Se probó antes `.gitattributes` con `-diff` y no sirve**, así que se descartó con la razón escrita en el propio archivo: git pasa a tratarlos como binarios, `git grep` los sigue listando —«Binary file … matches», los mismos 53 de 59— y encima deja de poder verse el diff de un cambio legítimo en una skill.
  - **Lo que sí aporta `.gitattributes` es `linguist-vendored`**, que ataca el otro ruido: sin él, GitHub cuenta esos cientos de markdown como el lenguaje del proyecto y la barra de lenguajes dice que Stockly-F es mayormente Markdown.

- [x] **[T3-07] Limpiar los artefactos de build antes de compilar**
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/package.json:8`, `Stockly-F/package.json:8`
  - **Qué hacer:** `dist/` y `coverage/` persisten en el árbol de trabajo (correctamente ignorados por git). Un `dist/` obsoleto es precisamente cómo se manifiesta T0-01. Añadir un paso de limpieza previo al build.
  - **Criterio de aceptación:** `pnpm build` parte siempre de un `dist/` vacío.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-01

- [x] **[T3-08] Marcar los iconos decorativos con `aria-hidden`** ✅ *(2026-08-10)*
  - **Área:** Accesibilidad
  - **Ubicación:** transversal — Heroicons en `ProductTable.tsx`, `App.tsx`, `DashboardPage.tsx` y demás
  - **Qué hacer:** Solo `Select.tsx:43` marca su chevron como decorativo. Añadir `aria-hidden="true"` a los iconos que acompañan a texto para reducir el ruido en lectores de pantalla.
  - **Criterio de aceptación:** los iconos que duplican información textual no se anuncian.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** `verify` frontend ✅ **409/409** (8 tests nuevos), sobre el **DOM renderizado** y no sobre el JSX.
  - **La premisa de la ficha era falsa y este es el hallazgo principal.** Decía que solo `Select.tsx` marcaba su icono como decorativo. Eso describe el código, no lo que lee un lector de pantalla: **Heroicons v2 emite `aria-hidden="true"` en todos sus iconos**, así que el atributo estaba en los 24 sitios aunque no se escribiera en ninguno. Comprobado en la fuente de la librería y sobre el DOM. El proyecto no usa ninguna otra fuente de iconos: cero `<svg>` escritos a mano, cero `role="img"`.
  - **Los tests no añaden el atributo: fijan la garantía.** Hoy la da una dependencia externa, y una garantía así se pierde en silencio el día que se cambie de juego de iconos o se actualice a una versión que no lo haga.
  - **El fallo real de esta familia es el contrario, y sí estaba presente.** Con los iconos ocultos, lo que se rompe es un botón sin nombre accesible. Los tres botones de acción de `ProductTable` **no estaban mudos** —`title` es el último recurso que contempla la especificación de accname, y así lo calcula Testing Library; comprobado antes de tocar nada—, pero el nombre era el mismo en todas las filas: en una tabla de cincuenta productos, cincuenta botones «Editar» no dicen cuál. Ahora llevan `aria-label` con el producto, como el enlace de historial de al lado desde T2-14, y un test comprueba que dos filas no comparten nombre.
  - **Corregido durante la tarea:** la primera versión de la comprobación no contaba `title` como nombre accesible y acusaba a esos tres botones de estar mudos. Era un falso positivo; se midió el nombre calculado de verdad antes de escribir el arreglo.

- [x] **[T3-09] Evitar que el botón flotante tape la paginación en móvil** ✅ *(2026-08-10)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductsPage.tsx:224-238`
  - **Qué hacer:** El botón «Movimiento manual» es `fixed bottom-6 right-6 z-50` y los controles de paginación son estáticos al final del contenido; en pantallas estrechas con un producto seleccionado es probable que lo solape. **Verificar primero en navegador a 375 px** — este hallazgo está marcado como pendiente de verificación en el informe. Si se confirma, añadir `pb-24` al contenedor cuando el botón esté visible, o anclar la acción a la barra de acciones masivas que ya existe arriba.
  - **Criterio de aceptación:** a 375 px de ancho con un producto seleccionado, los botones «Anterior» y «Siguiente» son visibles y pulsables.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10) en navegador**, que es lo que la ficha dejaba pendiente. `verify` frontend ✅ **419/419** (3 tests nuevos).
  - **Confirmado, y peor que «es probable que lo solape»: los botones no se podían pulsar.** Con la página al final del scroll y un producto seleccionado, `document.elementFromPoint` en el centro de «Anterior» y de «Siguiente» devolvía **«Movimiento manual»**. No era un problema estético: la pulsación no llegaba a la paginación. Medido a 375 px —flotante en 588-632, paginación en 604-648— y capturado en pantalla.
  - **La ficha lo daba por un problema de móvil y no lo es.** A 1280×800 ocurre igual con «Siguiente»: lo que junta a los dos elementos no es el ancho sino que ambos viven abajo a la derecha —la paginación alineada a la derecha, el flotante en `bottom-6 right-6`—. Por eso el arreglo no lleva punto de ruptura.
  - **El hueco se reserva solo cuando el botón existe.** Un `pb` fijo en el contenedor dejaría espacio muerto al final de la página el resto del tiempo, que es la mayor parte.
  - **Tras el cambio, medido otra vez en los dos anchos:** `elementFromPoint` devuelve «Anterior» y «Siguiente». A 375 px la paginación queda en 524-568 y el flotante en 588-632.
  - **Lo que los tests no cubren, y se dice:** la geometría. jsdom no calcula diseño —`getBoundingClientRect` devuelve ceros—, así que el solape no se puede reproducir en la suite. Los tests fijan la decisión que lo evita: que el hueco aparezca y desaparezca exactamente con el botón.

- [x] **[T3-10] Añadir CHANGELOG y guía de contribución** ✅ *(2026-08-10)*
  - **Área:** Documentación
  - **Ubicación:** `CHANGELOG.md`, `CONTRIBUTING.md` (nuevos, raíz)
  - **Qué hacer:** No existe ninguno de los dos. CHANGELOG con formato *Keep a Changelog*; guía de contribución con la convención de commits, el flujo de ramas y los comandos de verificación previos a un PR (`pnpm check`, `pnpm lint`, `pnpm test`).
  - **Criterio de aceptación:** ambos archivos existen y la guía referencia los comandos reales del proyecto.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-09
  - **Verificado localmente (2026-08-10):** existen [`CHANGELOG.md`](../CHANGELOG.md) y [`CONTRIBUTING.md`](../CONTRIBUTING.md) en la raíz de `Stockly-B`, más un `CONTRIBUTING.md` corto en `Stockly-F` que apunta al canónico —GitHub lo enseña por repositorio, y duplicar la guía entera la haría divergir—. Todos los enlaces relativos comprobados uno a uno.
  - **La ficha pedía referenciar `pnpm check`, `pnpm lint` y `pnpm test`, y eso habría sido incorrecto: el backend no tiene `lint`.** Su comprobación estática es `pnpm check`; ESLint solo existe en el frontend. La guía documenta `pnpm verify` —la puerta real— y deja escritas las dos asimetrías, incluida que `smoke` solo existe en el backend.
  - **El CHANGELOG no inventa versiones.** Ningún repositorio tiene etiquetas y sus `package.json` ni coinciden (`1.0.0` en el backend, `0.0.0` en el frontend); todo va bajo **Sin publicar**, con esa discrepancia anotada como algo que reconciliar al cortar la primera versión. El histórico por fases se reconstruye de la tabla de progreso, con fechas reales.
  - **La convención de commits se documenta como objetivo, no como descripción.** Medido: de 52 commits del backend solo 41 llevan prefijo convencional, y **35 de esos 41 son `feat`**, incluidos los que solo tocan documentación o tests. Decirlo evita que la guía parezca describir algo que no existe.
  - **El flujo de ramas se describe como es**, no como debería ser en un equipo grande: historial lineal sobre `main`, con la condición que sí es innegociable —`verify` en verde en la máquina desde la que se hace push, porque no hay CI que lo repita— y la receta de rama por tarea para cuando deje de ser una persona.

- [x] **[T3-11] Registrar las decisiones de arquitectura como ADRs** ✅ *(2026-08-10)*
  - **Área:** Documentación
  - **Ubicación:** `docs/adr/` (nuevo)
  - **Qué hacer:** El proyecto ha tomado decisiones no obvias y bien fundadas que hoy solo viven en comentarios dispersos y se perderían si cambia de manos: decremento condicional para cerrar la carrera de stock, tokens de verificación y reset hasheados con SHA-256 en base de datos, `path` restringido de la cookie de refresh, y envío de correos fuera de la transacción. Una entrada corta por decisión (contexto, decisión, consecuencias).
  - **Criterio de aceptación:** existen al menos cuatro ADRs, una por cada decisión citada.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** existen **cinco** ADRs en [`docs/adr/`](adr/), con índice propio. Las cuatro que pedía la ficha, una por decisión citada, más una quinta.
  - **Cada entrada se escribió leyendo el código, no de memoria**, y cita el archivo: el `updateMany` con la condición en el `WHERE` de `product.service.ts`, el SHA-256 de `shared/lib/tokens.ts`, el `path: "/api/v1/auth/refresh"` de `auth.controller.ts` y el registro de promesas en vuelo de `shared/lib/stockAlerts.ts`.
  - **El apartado de consecuencias es el que justifica el formato.** Recoge lo que muerde al mantener: que `updateMany` para una sola fila parece un error y no lo es; que `clearCookie` sin repetir el `path` **no borra nada**; que un token perdido no se puede recuperar, solo regenerar; que los tests tienen que llamar a `esperarAlertasEnVuelo()` porque el correo ya no se espera.
  - **La quinta ADR no estaba en la ficha y es la que más falta hacía: «sin integración continua».** Es la decisión que más probablemente se deshaga por reflejo, porque una ausencia no deja archivo que la explique y cualquiera que vea dos repositorios con 781 tests y sin CI lo leerá como un descuido. Ahora hay dónde apuntar antes de crear un `.github/workflows/`.
  - **Corregido de paso:** `CLAUDE.md` de ambos repositorios y `docs/README-proyecto.md` seguían diciendo «104 tareas» cuando son 107 desde el 2026-08-09.

- [x] **[T3-12] Declarar explícitamente que la aplicación no debe indexarse** ✅ *(2026-08-10)*
  - **Área:** SEO
  - **Ubicación:** `Stockly-F/public/robots.txt` (nuevo)
  - **Qué hacer:** La aplicación está íntegramente detrás de autenticación y no tiene contenido público indexable —por lo que la ausencia de SSR, sitemap y datos estructurados es la decisión correcta—, pero conviene declararlo: `User-agent: *` / `Disallow: /`.
  - **Criterio de aceptación:** `GET /robots.txt` devuelve el archivo en el build de producción.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** criterio literal, sirviendo `dist/` como lo hace nginx. `GET /robots.txt` → **200 `text/plain`** con el archivo; `GET /catalog/products` → **200 `text/html`**, que cae al `index.html` de la SPA. `verify` frontend ✅ **419/419** (2 tests nuevos).
  - **Se añade además `noindex` en el `index.html`, y no es redundante.** `Disallow: /` prohíbe **rastrear**, no **indexar**: un buscador que reciba un enlace a esta URL puede listarla igualmente, sin descripción, porque no puede entrar a comprobar que no debe. La etiqueta sí lo prohíbe, y se lee en el caso en que el `robots.txt` de la raíz no sea de esta aplicación —por ejemplo montada bajo un subdirectorio ajeno—. Cada uno cubre el hueco del otro.
  - Los dos archivos llevan escrita esa interacción, porque es contraintuitiva y la reacción natural al verlos juntos es borrar uno.

- [x] **[T3-13] Asegurar `NODE_ENV=production` en entornos desplegados** ✅ *(2026-08-10)*
  - **Área:** Seguridad / DevOps
  - **Ubicación:** `Stockly-B/src/shared/middlewares/error.middleware.ts:18-21`, `docker-compose.yml:33-35`
  - **Qué hacer:** Fuera de producción el `errorHandler` devuelve `err.message` íntegro, que en un error de Prisma incluye la consulta completa y la ruta absoluta del archivo fuente. El compose ya fija `NODE_ENV: production` correctamente; documentar que cualquier entorno de staging debe hacer lo mismo y añadir la comprobación al arranque.
  - **Criterio de aceptación:** ningún entorno desplegado devuelve rutas del sistema de archivos en las respuestas de error.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna
  - **Verificado localmente (2026-08-10):** `verify` backend ✅ **357/357**, cobertura **91.33 %** (9 tests nuevos). **La fuga se reprodujo antes de arreglarla**, y no con un ejemplo inventado: durante T3-02, `?status=toString` provocaba un 500 cuyo cuerpo incluía `C:\Users\…\src\modules\sale-orders\sale-orders.service.ts:32:30`. Ese mensaje literal es el que usan los tests. Tres de los seis fallaban antes del cambio, uno de ellos a través de una petición completa.
  - **Se sanea siempre, no solo cuando `NODE_ENV` está bien puesto.** El compose fija `production`, pero una garantía que depende de que alguien recuerde una variable en staging no es una garantía. El patrón exige que la ruta **termine en extensión de código** para no morder texto corriente, y admite espacios dentro de los segmentos: la ruta de este proyecto tiene dos, y un patrón que cortara en el primer espacio habría dejado pasar justo la parte que identifica la máquina.
  - **La información no se pierde, cambia de canal.** El log sigue recibiendo el error entero, ruta incluida, y la respuesta conserva el `requestId` de T2-10, que es lo que permite ir de un cuerpo saneado a la línea completa. Un test lo comprueba, y otro que un mensaje normal pasa intacto.
  - **La comprobación al arranque avisa, no aborta.** `NODE_ENV=staging` ya lo rechaza el validador, así que el error típico no es escribirlo mal sino **no ponerlo** y caer a `development` en un servidor sin enterarse. La señal es `FRONTEND_URL`: si no apunta a localhost, esto no es la máquina de nadie. Es una heurística y puede equivocarse —alguien depurando en local contra un frontend desplegado—, así que tumbar el arranque por una sospecha sería peor que avisar.

- [x] **[T3-14] Unificar la escala de radios y sombras** ✅ *(2026-08-10)*
  - **Área:** UI/UX / Refactorización
  - **Ubicación:** transversal, `Stockly-F/src/**/*.tsx`
  - **Qué hacer:** Medido: 81 utilidades de radio (40 `rounded-xl`, 28 `rounded-lg`, 12 `rounded-full`, **1 `rounded-md` huérfano**) y 11 de sombra repartidas entre `shadow-sm`, `shadow-lg` y `shadow-xl` sin criterio. Aplicar la convención fijada en T2-35 — `rounded-xl` para superficies (tarjetas, modales), `rounded-lg` para controles (botones, inputs), `rounded-full` para badges y avatares — y reducir las sombras a los dos tokens de elevación (`shadow-raised` para superficie elevada, `shadow-overlay` para modales y desplegables). La jerarquía la da el borde, no la sombra.
  - **Criterio de aceptación:** no queda ningún `rounded-md`; cada `shadow-*` del código es uno de los dos tokens de elevación.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35
  - **Verificado localmente (2026-08-10):** `verify` frontend ✅ **409/409** (3 tests nuevos). Criterio literal cumplido y medido por `grep` sobre `src/`: **cero radios fuera de los tres de la convención** (39 superficies, 32 controles, 13 píldoras) y **las once sombras son los dos tokens de elevación** (7 `raised`, 4 `overlay`).
  - **Los tokens existían desde T2-35 y no los usaba nadie.** Estaban definidos en el `@theme` y su única aparición en el código era el test que comprueba que están definidos. Las once sombras seguían siendo utilidades de Tailwind repartidas entre tres tamaños: cinco tarjetas de autenticación, la tarjeta del panel, el botón flotante, el modal y el menú desplegable.
  - **El reparto lo decide el papel, no el tamaño.** `raised` para lo que se despega del fondo —tarjetas—, `overlay` para lo que se pone por encima: modal, desplegable y el botón flotante, que flota sobre el contenido aunque no sea una capa.
  - **La guarda es un test que recorre `src/`**, en el mismo estilo que el de colores crudos de T2-37 y por la misma razón: la convención solo dura lo que dure la memoria de quien la escribió. **Falsificado** introduciendo un archivo con un radio y una sombra prohibidos — los dos tests los señalan por nombre y archivo.
  - **Detalle que costó una vuelta:** los comentarios que escribí explicando el cambio contenían los nombres de las clases prohibidas y contaminaban el recuento por `grep`, que es la forma de comprobar el criterio. Están reescritos para no nombrarlas literalmente, y el test se excluye a sí mismo por lo mismo.

- [x] **[T3-15] Documentar el sistema de diseño** ✅ *(2026-08-10)*
  - **Área:** Documentación / UI/UX
  - **Ubicación:** `Stockly-F/docs/design-system.md` (nuevo)
  - **Qué hacer:** Sin un documento de referencia, el sistema se erosiona en el siguiente PR y se vuelve a las 561 utilidades crudas. Recoger: la tabla de tokens con sus contrastes, la convención de radios y elevación, el semáforo de estado con sus iconos, el perfil de densidad con la excepción táctil de móvil, la escala tipográfica con sus roles, y la regla que lo gobierna todo — **el color comunica estado, nunca decora**. Enlazarlo desde el README del frontend.
  - **Criterio de aceptación:** un colaborador puede añadir una página nueva coherente con el resto sin elegir un solo valor hexadecimal.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35, T2-36, T2-37, T2-38, T2-39, T2-40, T2-41, T3-14
  - **Verificado localmente (2026-08-10):** existe [`Stockly-F/docs/design-system.md`](../../Stockly-F/docs/design-system.md), enlazado desde el README del frontend con una sección propia. `verify` frontend ✅ **419/419**.
  - **Recoge lo que pedía la ficha, con los valores reales**: los tokens de color con su contraste medido y el fondo contra el que se midió, las cinco medidas tipográficas con su papel, la convención de radios y las dos elevaciones, el perfil de densidad con la excepción táctil de móvil, los cinco conjuntos del semáforo de estado con sus iconos, y la regla que gobierna el resto — **el color comunica estado, nunca decora**.
  - **Cada sección dice qué test la vigila.** Es lo que separa este documento de una guía de estilo: la mitad de sus reglas no dependen de que alguien las lea, porque una utilidad cruda de la paleta, un radio fuera de los tres o una sombra que no sea uno de los dos tokens hacen fallar `pnpm verify`. Lo que el documento aporta sobre los tests es el **porqué**, que es justo lo que no cabe en una aserción.
  - **Termina con una receta de página nueva**, que es la forma de comprobar el criterio de aceptación: contenedor, título, tarjeta, controles, estados y la regla de reservar hueco para lo que flota. Ninguno de esos pasos obliga a elegir un valor.
  - **Corregido de paso un error del README:** la fila de `Badge` seguía listando las variantes decorativas —`orange`, `blue`, `purple`, `teal`, `gray`— que T2-36 retiró hace días. La documentación que describe algo que ya no existe es peor que la que falta.

---

## Tier 4 — Futuro / opcional

*Explícitamente fuera del alcance inmediato. Se listan para que la decisión de no hacerlos sea consciente.*

- [x] **[T4-01] Paquete compartido de contratos entre repositorios** ✅ *(2026-08-10)*
  - **Área:** Arquitectura
  - **Ubicación:** `shared/` (nuevo paquete del workspace pnpm)
  - **Qué hacer:** Los tipos de request/response se declaran a mano y por duplicado en cada repo, sin nada que obligue a que coincidan. Es la causa raíz común de T0-03, T1-03 y T1-05. Extraer los esquemas Zod y los tipos inferidos a un paquete consumido por ambos lados.
  - **Criterio de aceptación:** una divergencia de contrato produce un error de compilación en lugar de un fallo silencioso en tiempo de ejecución.
  - **Esfuerzo:** alto
  - **Depende de:** T2-24
  - **Verificado localmente (2026-08-10):** `verify` backend ✅ **392/392** (30 nuevos), cobertura **91.38 %**; frontend ✅ **421/421 + 1 omitido**, **50.84 %**. El criterio se cumple de forma medible: al conectar el contrato, `pnpm check` del frontend pasó de 0 a **12 errores de compilación** —4 en código de producción y 8 en mocks—, todos ellos divergencias reales que antes no señalaba nada.
  - **La ubicación de la ficha no puede existir.** Pedía un paquete del workspace pnpm, y Stockly son **dos repositorios git independientes** (`xfiberex/Stockly-B` y `-F`) con la carpeta que los contiene sin versionar; el `pnpm-workspace.yaml` del backend ni siquiera declara `packages:`, solo `allowBuilds`. Ningún workspace puede abarcarlos: quien clone uno se quedaría sin la mitad. Se resuelve **copiando** —fuente única en `Stockly-B/src/contratos/api.ts`, copia generada y versionada en el frontend— con las tres alternativas descartadas por su coste real y no por gusto. Razonado en [ADR 0006](adr/0006-contrato-copiado-entre-repositorios.md).
  - **Los tipos ya mentían, y se midió antes de tocar nada.** `Product.price` y los tres `unitPrice` se declaraban `number` y llegan como **cadena** (`Decimal` de Prisma). No reventaba porque el código lo parcheaba en los bordes: `Number(...)` en `SaleOrdersPage` y `PurchaseOrdersPage`, `z.coerce.number()` en el formulario y un `formatearImporte` que acepta las dos cosas **y lo documenta**. El código sabía la verdad y el tipo no.
  - **`SettingEntry.value` seguía siendo la unión laxa que T2-24 rechazó por escrito.** Su propia ficha decía que `boolean | number | string` acepta `{ type: "boolean", value: "false" }`, «el mock exacto que ocultó T1-06». T2-24 endureció el espejo de los tests y **no el tipo de producción**, que arrastraba un `esVerdadero(v) => v === true || v === "true"` como parche. Ahora es la unión discriminada del contrato, en un solo sitio para los dos lados.
  - **El espejo de T2-24 desaparece.** `Stockly-F/src/tests/contratos/esquemas.ts` describía la API de memoria y nada lo ataba a ella. Ahora reexporta del contrato, que el backend comprueba **contra respuestas reales con una base viva**. Los `as unknown as …` de los fixtures se retiraron: eran el agujero del mecanismo, porque Zod ignora las claves de más pero no las de menos, así que a los mocks les faltaban `imagePublicId`, los `*Id` sueltos y el `product` de cada ítem sin que nadie lo viera.
  - **Falsificados los tres guardianes**, uno a uno: declarar `price` como `z.number()` tumba **8** tests; quitar `REFRESH_REUSE` del enum tumba **1**, el que lo compara con `$Enums`; cambiar la fuente sin regenerar tumba **1**, el de frescura, con el comando a ejecutar en el mensaje de error.
  - **Destapó que `REFRESH_REUSE` no tenía color desde T2-31.** `ACTION_VARIANTS` era `Record<string, …>` y la acción caía en el neutro por omisión, leyéndose como un evento rutinario cuando es una anomalía de seguridad. Al pasar a `Record<AuditAction, …>` el compilador lo exigió; ahora va en rojo y tiene entrada en el filtro.
  - **Alcance:** cubre la forma de **todo lo que llega** en los doce módulos. Los DTO de lo que **se envía** siguen en cada repositorio: los valida el backend con sus `*.validator.ts`, que ya son fuente de verdad de la petición, y unificarlos es otra tarea.
  - **Trampa nueva, que costó un `verify` en rojo:** un `return` en el nivel superior de un `.js` es legal en Node —envuelve cada módulo CommonJS en una función— pero babel lo parsea como módulo ES al instrumentar para cobertura y falla con «'return' outside of function». Síntoma despistante: `pnpm test` en verde y `pnpm test:coverage` en rojo, señalando el `require` del test en vez del archivo requerido.

- [x] **[T4-02] Generar el OpenAPI desde los esquemas Zod** ✅ *(2026-08-10)*
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/src/swagger.ts`
  - **Qué hacer:** Sustituir el objeto literal mantenido a mano por generación con `zod-to-openapi` desde los validadores, que ya son la fuente de verdad. Habilita además la generación de un cliente tipado para el frontend.
  - **Criterio de aceptación:** la documentación no puede desincronizarse de la validación, porque se deriva de ella.
  - **Esfuerzo:** alto
  - **Depende de:** T2-30, T4-01
  - **Verificado localmente (2026-08-10):** `verify` backend ✅ **402/402** (10 nuevos), cobertura **91.95 %**; frontend ✅ **421/421 + 1 omitido**. Comprobado además **contra el servidor en marcha**: `GET /api/v1/docs` responde 200 y el spec que sirve Swagger UI trae los **23 esquemas** generados, las 43 rutas y las 67 operaciones de T2-30 intactas.
  - **La dependencia que pedía la ficha no hace falta.** `zod-to-openapi` es de cuando Zod no sabía hacerlo solo: **Zod 4.4 trae `z.toJSONSchema()` con `target: "openapi-3.0"` nativo**, justo el dialecto del spec — emite `nullable: true` en vez de `type: [..., "null"]` y resuelve una referencia anulable con el idioma `nullable` + `allOf` que exige 3.0. Comprobado antes de escribir nada convirtiendo los 9 validadores y los 36 esquemas del contrato: **todos convierten**. Añadirla habría sido una dependencia por costumbre.
  - **`io: "input"` en las peticiones, y no es un detalle.** Los validadores usan `z.coerce.number()` y `z.preprocess`: lo que **aceptan** no es lo que **producen**. Generado con la salida, el spec diría que `price` ha de ser un número, cuando el endpoint admite también la cadena que manda un formulario, y el «Try it out» mentiría por defecto.
  - **Destapó que `/settings` estaba mal documentado en las dos direcciones:** decía `additionalProperties: { type: "string" }`, o sea un mapa de cadenas, y la API devuelve un **array de ajustes** cuyo `value` ya viene tipado. Es la misma clase de defecto que originó T2-29 y precisamente en el módulo cuya confusión de contrato costó T1-05 y T1-06 — documentar el valor como cadena invitaba a repetir que `"false"` se lea como verdadero.
  - **Y que `/reports` documentaba cuatro de sus seis listas como `items: {}`**, «un array de algo»: quien leyera el spec no sabía qué campos trae una métrica de rotación. `/products/export` directamente no declaraba esquema, solo una frase.
  - **Lo derivado y lo que sigue a mano.** Los 23 esquemas salen del contrato (respuestas) y de los validadores (peticiones); **las rutas siguen escritas a mano** y así se quedan: qué endpoints hay, con qué resumen, qué rol piden y qué códigos devuelven no se deduce de Zod. Una sola propiedad de todo el spec se escribe a mano —`ProductWrite.image`, que consume multer antes de llegar a Zod— y está declarada aparte para que se vea.
  - **Falsificados los tres guardianes:** teclear mal un `$ref` tumba 2 tests; **hacer obligatorio el SKU en el validador cambia solo el `required` del spec** —de `["name","price"]` a `["name","sku","price"]`— y tumba 2, que es el criterio de aceptación demostrado; y volver a escribir un esquema a mano en el spec tumba el que compara con lo generado.
  - **Un defecto propio, encontrado y corregido:** el primer test de frescura del contrato llamaba a `generar()` para ganar cobertura, **y con eso reescribía el archivo**. Con la copia desfasada fallaba una vez y se autorreparaba, así que la pasada siguiente salía verde y el aviso desaparecía. Lo vi al añadir `errorSchema`: dos tests en rojo una vez y nunca más. Se retiró el test. De paso, `scripts/` sale del informe de cobertura: es utillaje con su propio comando, y solo entraba cuando algún test lo importaba.

- [x] **[T4-03] Modo oscuro** ✅ *(2026-08-10)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/index.css`, transversal
  - **Qué hacer:** Cero clases `dark:` y ningún soporte de `prefers-color-scheme` (curiosamente, las plantillas de correo sí declaran `color-scheme: light dark`). Si se aborda, hacerlo con tokens semánticos en `@theme` de Tailwind 4 antes que con clases `dark:` dispersas por 20 páginas. **Ese prerrequisito es exactamente lo que construyen T2-35 a T2-37:** una vez la interfaz consume tokens en lugar de 561 literales, el modo oscuro se reduce a redefinir la capa semántica bajo `prefers-color-scheme`, no a editar 20 páginas — de ahí que el esfuerzo baje de alto a medio. El estilo elegido soporta modo oscuro completo (`✓ Full`) según su propia ficha. Recordar que el modo oscuro no se construye invirtiendo colores, sino con variantes tonales desaturadas y contraste verificado por separado.
  - **Criterio de aceptación:** la aplicación respeta la preferencia del sistema y mantiene el contraste AA en ambos temas.
  - **Esfuerzo:** medio *(alto si se aborda antes que T2-37)*
  - **Depende de:** T2-35, T2-37
  - **Verificado localmente (2026-08-10):** `verify` frontend ✅ **448/448 + 1 omitido** (27 nuevos), cobertura **50.96 %**; E2E **9 pasados, 1 omitido**. Comprobado **en el navegador** con la preferencia del sistema emulada en las dos direcciones: dashboard, reportes, catálogo y un modal, más los tokens resueltos en vivo (`--color-surface` → `#151d2c`, texto `rgb(230, 236, 245)`, `color-scheme: light dark`).
  - **La ficha acertaba en lo esencial:** con la capa de tokens de T2-35–T2-37 ya montada, el modo oscuro es redefinir la capa semántica bajo `prefers-color-scheme` y nada más. **Cero clases `dark:`** y ninguna pantalla tocada — las utilidades de color compilan a `var(--color-…)`, así que cambiar la variable cambia la aplicación entera.
  - **La inversión de los rellenos salió gratis por una decisión vieja.** Los botones se pintan `bg-primary text-surface`, nunca `text-white` —que no aparece **ni una vez** en `src/`—: al oscurecer `surface` y aclarar `primary`, el botón primario pasa solo a claro con texto oscuro. Sin ese trabajo de T2-36, habría hecho falta un token nuevo para «texto sobre relleno».
  - **No es la paleta invertida**, como avisaba la ficha: los estados se aclaran y desaturan (un `#b91c1c` sobre fondo oscuro es casi negro) y las superficies suben en escalones cortos, porque en oscuro la jerarquía la da la luminancia y no la sombra. Diseñada y **medida antes de escribirla**: de veinte pares comprobados, diecinueve pasaron a la primera.
  - **El borde se calibró contra el tema claro, no contra un número inventado.** Mi primer mínimo de 1.5:1 era más estricto que el propio proyecto, que en claro da **1.23:1**. El valor oscuro (1.47:1) contrasta más que el claro, y el test usa 1.2 como listón porque es el que el proyecto ya aceptaba.
  - **Los gráficos eran el bloqueo real, y ningún test los veía.** Recharts recibe los colores por props (`fill`, `stroke`), no por clases, así que `tokens.test.ts` nunca detectó los ~40 hexadecimales de tres componentes; con el modo oscuro dejaban de ser deuda estética y se quedaban en tonos claros sobre fondo oscuro. Se comprobó en el navegador que **`var()` funciona en un atributo de presentación de SVG y reacciona al cambio de tema sin volver a renderizar** —`rgb(59, 130, 246)` en claro, `rgb(96, 165, 250)` en oscuro—, lo que evitó tener que montar un hook con `matchMedia`. De paso, lo que era estado pasó a token de estado: entradas en `success`, salidas en `danger`, ajustes en `info`, stock mínimo en `warning`.
  - **Dos defectos propios, encontrados midiendo y no leyendo.** (1) **Las sombras no se podían redefinir por token**: Tailwind incrusta el color literal en la utilidad (`--tw-shadow: … var(--tw-shadow-color, #0f172a1f)`) en vez de referenciar `var(--shadow-overlay)`, al revés que los colores. El token quedaba escrito, mi test lo daba por bueno y el modal seguía con sombra azul translúcida —medido: `rgba(15, 23, 42, 0.12)`—. Se arregla sobrescribiendo `--tw-shadow-color`, que además conserva la composición con `ring-*`, y el test pasó a afirmar el mecanismo que sí funciona. (2) **El `body` no pintaba fondo**: solo lo hacía un envoltorio repetido en nueve pantallas, así que al rebotar el desplazamiento asomaba el lienzo blanco del navegador.
  - **Salvedad:** los colores de etiqueta **no cambian con el tema**, y es correcto: los elige el usuario y se guardan en la base, así que son datos. Su legibilidad la sigue resolviendo `textoLegibleSobre()` contra el color real.
  - **No hay conmutador manual.** El criterio pide seguir la preferencia del sistema y eso es lo que hace; un selector en la interfaz exigiría persistencia y un tercer estado («auto»), que es otra tarea. → Esa tarea es **T4-11**, cerrada el mismo día: al añadir el selector, la media query de esta ficha desaparece y el apaño de `--tw-shadow-color` deja de hacer falta, porque cada token pasa a declarar sus dos valores con `light-dark()`.

- [x] **[T4-04] Internacionalización** ✅ *(2026-08-11)*
  - **Área:** UI/UX
  - **Ubicación:** transversal, ambos repos
  - **Qué hacer:** Todos los textos están incrustados en los componentes y el backend devuelve mensajes de error en español. Requeriría extraer cadenas en ambos repos y que la API devuelva códigos de error en lugar de mensajes. Configurable desde la sección configuración del proyecto. El usuario podra elegir idioma o dejarlo en automático.
  - **Criterio de aceptación:** cambiar el idioma traduce toda la interfaz, incluidos los mensajes de error procedentes de la API.
  - **Esfuerzo:** alto
  - **Depende de:** T4-01
  - **Verificado localmente (2026-08-11):** `verify` backend ✅ **402/402**, cobertura **91.96 %**; frontend ✅ **493/493 + 1 omitido** (22 nuevos), cobertura **53.14 %** *(desde 52.17)*. Medido con la misma regla a los dos lados del cambio —la guardia aplicada al árbol en `HEAD` y al de ahora—: **289 textos escritos a mano en 47 archivos → 0**.
  - **Se hizo en dos tandas y desde dos equipos.** La primera —el 2026-08-10— montó el mecanismo: los códigos de error en el backend, el catálogo, el motor, el selector de idioma y cinco componentes de muestra. Esta segunda hace el trabajo de verdad: **extraer los textos de las 25 pantallas restantes**, los hooks, los esquemas Zod y los formatos de fecha, y cerrar los dos huecos que quedaban en la API.
  - **Sin `i18next`, y no por gusto.** El motor propio son ~30 líneas porque lo que la librería resuelve —respaldo entre variantes regionales, espacios de nombres, carga diferida, seis formas de plural, detección por cabecera— este proyecto no lo tiene: dos idiomas, un catálogo de dos archivos y `Intl.PluralRules` en el navegador. Lo que se renuncia (`Trans`, extracción automática, contexto gramatical) está escrito con su contrapartida en [ADR 0007](adr/0007-i18n-propio.md).
  - **El compilador vigila el catálogo y un test vigila las pantallas.** `en.ts` es un `Record<keyof typeof es, string>`, así que una clave sin traducir **no compila**; eso ya estaba. Lo que faltaba —y era el agujero real— es que nada impedía escribir `<h1>Productos</h1>` en una pantalla nueva: compila, se ve bien en español y está roto en inglés. Ahora `literales.test.ts` recorre `src/`, mira el contenido de los nodos JSX, seis props visibles y los `toast`, y falla si encuentra una cadena a mano. **Está falsificado** con cuatro casos, y comprueba además que la lista de archivos no se quede vacía —el defecto que T4-02 encontró en su propio guardián—.
  - **Lo destapó dos textos que llevaban meses sin traducir y nadie veía:** el aviso de límite de peticiones de `axios.ts` y los dos de `useSettings`. Ninguno está en una pantalla, así que ninguna revisión visual los habría encontrado.
  - **Componer frases con el nombre de la entidad no sobrevive a un idioma más.** `CatalogItemSection` armaba `Nueva ${entityLabel.toLowerCase()}` y `No hay ${...}s registradas`: ya cojeaba en español —el artículo concuerda en género, el plural no siempre es «+s»— y en inglés el adjetivo va delante. Cada pantalla pasa a traer sus frases enteras. Lo mismo con los cuatro plurales resueltos con `${n !== 1 ? "s" : ""}`, que ahora piden `tn()`.
  - **Lo que **no** se traduce, y por qué.** Las **exportaciones** salen siempre en el idioma de referencia: un CSV es formato de intercambio y sus columnas están emparejadas con las del backend por el test de T3-05. Los **motivos de un movimiento de stock** se guardan en la base, así que el valor es dato y solo se traduce la etiqueta de la lista. Y los **importes** no cambian de formato: `es-MX` y `en-US` agrupan igual y solo cambiaría el símbolo a «MX$», que en un sistema de una sola moneda es ruido. Las **fechas** sí, y por eso existe `shared/lib/fechas.ts`: un `toLocaleDateString("es-MX")` deja «15 ago 2026» en una interfaz en inglés, y eso ninguna guardia de literales lo ve, porque el idioma está en el argumento.
  - **Los dos huecos de la API.** El **422** de `validate.middleware` no llevaba código —era el único sitio que respondía sin él—, así que su «Error de validación» salía en español pasara lo que pasara; ahora lleva `VALIDATION_ERROR`. Y los **rótulos de `/settings`**, que vienen del servidor en español: la interfaz prefiere el suyo del catálogo y cae al del servidor solo si el ajuste es tan nuevo que aquí no tiene traducción, comprobado con `existeClave` para no pintar la clave en crudo.
  - **Salvedades, las dos anotadas en el ADR.** Los mensajes **por campo** de un 422 siguen en español: son de regla, no de caso, y traducirlos exige un código por regla de Zod. Y los **correos** salen en español, porque la preferencia es de dispositivo y el servidor no la conoce; llevarla allí pide una columna por usuario. → Queda como **T4-12**.

- [x] **[T4-05] Documentar la estrategia de backup y rollback** ✅ *(2026-08-11)*
  - **Área:** DevOps
  - **Ubicación:** [`docs/operaciones.md`](operaciones.md), `scripts/backup.js`, `scripts/restaurar.js`, `scripts/postgres.js`
  - **Qué hacer:** No hay procedimiento de copia de seguridad ni de reversión. Documentar un `pg_dump` programado con retención definida, un procedimiento de restauración **probado**, y la política de migraciones hacia adelante (Prisma no genera *down migrations*). Especialmente relevante en un sistema cuyo valor es la integridad de un histórico de inventario.
  - **Criterio de aceptación:** existe un procedimiento escrito y se ha ejecutado con éxito una restauración de prueba.
  - **Esfuerzo:** medio
  - **Depende de:** T2-28
  - **La restauración se ejecutó, no se describió.** El criterio pedía una prueba y el registro con sus cifras está en [operaciones.md §5](operaciones.md#5-ensayo-de-restauración--registro): 31 MB de base → volcado de 76.7 KB en 0.2 s, restaurada en 0.3 s en una base nueva. Comparadas las siete tablas de negocio, las 12 migraciones, un `md5` de las 52 filas de inventario, y el esquema entero con `pg_dump --schema-only` línea a línea —idéntico salvo el testigo aleatorio que 17.10 escribe en cada volcado—. Encima, `prisma migrate status` da «up to date» y **la aplicación real arranca contra la copia**: `GET /api/v1/ready`, que sondea la base, responde 200.
  - **Se escribieron dos guiones porque un procedimiento que se copia y pega a mano no se ejecuta.** `pnpm db:backup` y `pnpm db:restaurar`, en Node y no en `.sh`: el proyecto se trabaja desde Windows y la copia tiene que poder programarse en el Programador de tareas igual que en `cron`, y un guion de shell obligaría a mantener dos.
  - **El ensayo por defecto no puede ser el comando del desastre.** `db:restaurar` sin `--a` restaura en `Stockly_restauracion`; apuntar a la base de la aplicación exige `--forzar` escrito a mano. Una copia que no se ha restaurado nunca no es una copia, es un archivo, así que el ensayo tiene que salir barato y sin riesgo.
  - **Cuatro trampas encontradas montándolo**, las cuatro silenciosas: el `DATABASE_URL` del `.env` **no le vale a `pg_dump`** —la `@` sin codificar de la contraseña hace que libpq parta por la primera y busque un socket `@localhost`, con un error que no menciona la contraseña—; **`pg_restore` termina con código 0 aunque falle** salvo `--exit-on-error`, así que una restauración a medias se anuncia como buena; un cliente **más nuevo** que el servidor vuelca sin protestar y el problema sale al restaurar; y `dropdb` se queda esperando con un Prisma Studio olvidado abierto.
  - **La retención lleva una guardia contra sí misma.** 14 días, pero **nunca menos de 3 copias**, y la poda solo corre si el volcado nuevo pasa `pg_restore --list`. Si los volcados llevan un mes fallando y nadie mira el registro, una poda por antigüedad a secas borra la última copia buena el día en que es lo único que queda.
  - **Un paso clásico que aquí no hace falta:** las claves primarias son `text` (cuid), no `serial`. La base no tiene ni una secuencia, así que no hay `setval` de reajuste que olvidar tras restaurar.
  - **Destapó una discrepancia de versión que no se puede arreglar desde aquí:** el servidor de desarrollo es PostgreSQL **17.10** y el compose levanta **`postgres:16-alpine`**. Un volcado de 17 no se restaura en un 16. → **T4-13**.
  - **`backups/` y `*.dump` van al `.gitignore`.** Un volcado es la base entera, incluidos los hashes de `users`: versionarlo publica en el historial lo mismo que el `.env`, y con la misma dificultad para retirarlo después (T0-06).

- [x] **[T4-06] Monitorización y alertas** ✅ *(2026-08-11)*
  - **Área:** DevOps
  - **Ubicación:** `src/shared/lib/metricas.ts`, `src/shared/lib/alertas5xx.ts`, `src/shared/middlewares/metricas.middleware.ts`, `observabilidad/`, [`docs/operaciones.md §8`](operaciones.md#8-monitorización-y-alertas-t4-06)
  - **Qué hacer:** No hay recogida de métricas, agregación de logs ni alertas: un incidente en producción se detectaría por el reporte de un usuario. Añadir un endpoint `/metrics` y un agregador de logs cuando el proyecto entre en producción real.
  - **Criterio de aceptación:** un pico de errores 5xx genera una alerta antes de que lo reporte un usuario.
  - **Esfuerzo:** medio
  - **Depende de:** T2-10, T2-25
  - **Dos capas, y ninguna sobra.** La ficha pedía «un endpoint `/metrics` y un agregador de logs», que es la respuesta estándar y **no cumple el criterio por sí sola**: exige desplegar Prometheus para que el sistema deje de estar mudo. Así que hay también una alerta **dentro del proceso** —ventana deslizante de 5xx, umbral, enfriamiento— que avisa por correo sin depender de nada externo. Lo que esa no puede hacer es avisar de que el proceso ha muerto: un proceso muerto no manda correos. Eso lo cubre `up == 0` en Prometheus. Las dos, o queda un hueco.
  - **Las reglas de alerta están probadas, no solo escritas.** Una regla es código que solo se ejecuta el día del incidente, y ese día el fallo se manifiesta como silencio, que es indistinguible de que todo va bien. `observabilidad/pruebas-alertas.yml` las ejecuta con `promtool test rules` sobre series sintéticas y comprueba las dos mitades: que dispara con un 20 % de errores y **que no dispara con tráfico sano**. `promtool check config` y `amtool check-config` validan los dos archivos.
  - **De ahí salió el dato que justifica la capa doble:** entre el primer 5xx y la alerta de Prometheus pasan **~8 min y medio**, y el `for: 2m` solo explica dos —el resto lo pone la ventana de `rate(...[5m])`, que arrastra los minutos sanos anteriores—. A ojo se habría dado por bueno «2 minutos». La alerta en proceso cubre justo ese hueco porque cuenta sucesos, no tasas.
  - **La cardinalidad es el fallo que convierte una métrica en una fuga de memoria.** Con la URL pedida en la etiqueta, cada `GET /products/<cuid>` crea una serie temporal nueva y **cualquiera desde fuera** puede hacer crecer la memoria del proceso pidiendo URLs inventadas —los escáneres piden `/wp-login.php` todo el día—. Se etiqueta con la plantilla (`/api/v1/products/:id`) y lo que no casa con ninguna ruta va a una etiqueta fija. Hay test de las dos cosas.
  - **Defecto encontrado con un test en rojo:** `req.baseUrl + req.route.path` —lo que se escribe primero— da `/:id` en Express 5, que restaura `baseUrl` al desapilar el router; con un 5xx es peor, porque responde `errorHandler`, que vive fuera. Los doce módulos habrían caído en la misma serie. La plantilla se reconstruye desde `originalUrl`, que no depende de cuándo se lea.
  - **Segundo defecto, este del despliegue:** ni Prometheus ni Alertmanager **expanden variables de entorno** en su configuración. El `${METRICS_TOKEN}` que escribí primero viajaba tal cual como token y el síntoma era un objetivo caído con 401, sin ninguna pista del porqué. Se resuelve con `credentials_file`/`smtp_auth_password_file` y una plantilla `.example` para lo que no es secreto pero sí propio de cada despliegue.
  - **`/metrics` va cerrado por defecto en producción:** sin `METRICS_TOKEN` responde **404**, no 401 —confirmar que la ruta existe ya es media pista—. Lo que expone no son secretos, pero sí el mapa de rutas y el volumen de tráfico. El despliegue que olvide el token se queda sin métricas, y eso se nota; el descuido contrario no se notaría nunca.
  - **El agregador de logs no necesitó código.** Desde T2-10 la salida ya es JSON por línea con nivel, `requestId` y credenciales censuradas: basta apuntar el recolector a la salida estándar. El campo `alerta: "pico_5xx"` permite alertar desde ahí sin Prometheus, que es la tercera vía por si las otras dos fallan.
  - **`prom-client` sí se gana el sitio**, al revés que `i18next` (ADR 0007) o `zod-to-openapi` (T4-02). No por los contadores —eso es un `Map`— sino por `collectDefaultMetrics`: el retraso del bucle de eventos es la métrica que distingue «la API va lenta» de «la base va lenta», y no se escribe a mano.

- [ ] **[T4-07] Auditoría de dependencias y licencias**
  - **Área:** Seguridad
  - **Ubicación:** ambos repos
  - **Qué hacer:** No se ejecutó análisis de composición en esta auditoría (zona no cubierta del informe). Ejecutar `pnpm audit --prod` e incorporarlo al guion de verificación local (T1-01 / T1-02), y generar un informe de licencias. Verificar de paso la coherencia entre la licencia `ISC` declarada en `Stockly-B/package.json:21` y el archivo `LICENSE` del repositorio.
  - **Criterio de aceptación:** el guion de verificación local falla ante vulnerabilidades de severidad alta o superior en dependencias de producción; la licencia declarada coincide con el archivo.
  - **Esfuerzo:** medio
  - **Depende de:** T1-01, T1-02

- [ ] **[T4-08] Pruebas de carga sobre los flujos de inventario**
  - **Área:** Rendimiento
  - **Ubicación:** nuevo directorio `load/`
  - **Qué hacer:** No se midió el rendimiento en esta auditoría; los hallazgos de base de datos derivan del análisis de esquema. Con un conjunto de datos representativo (10–100k productos, 1M movimientos), ejecutar `EXPLAIN ANALYZE` sobre las consultas listadas en el hallazgo P-01 y una prueba de carga con k6 sobre los endpoints de movimientos de stock, para validar T1-15 y T2-08 con datos reales.
  - **Criterio de aceptación:** existen mediciones antes/después de los índices y un informe de latencias bajo carga sostenida.
  - **Esfuerzo:** alto
  - **Depende de:** T1-15, T2-02

- [ ] **[T4-09] Auditoría de navegador y de lector de pantalla**
  - **Área:** Accesibilidad / Rendimiento
  - **Ubicación:** aplicación desplegada
  - **Qué hacer:** Los hallazgos de accesibilidad de esta auditoría son estáticos; no se ejecutó Lighthouse ni un recorrido con lector de pantalla. La única medición sobre la aplicación en marcha es la del 2026-07-15, recogida en [Línea base de navegador](#línea-base-de-navegador-2026-07-15) al final de este documento: 96 en accesibilidad, y las correcciones de contraste, modal y menú móvil que motivaron esa nota se confirman aplicadas en el código actual. Tras completar el Tier 2 de accesibilidad, ejecutar Lighthouse sobre el build de producción, medir Core Web Vitals reales contra esa línea base y recorrer los flujos principales con NVDA o VoiceOver.
  - **Criterio de aceptación:** Lighthouse ≥ 95 en accesibilidad sobre el build de producción y los flujos de alta de producto y movimiento de stock son completables solo con teclado y lector de pantalla.
  - **Esfuerzo:** alto
  - **Depende de:** T2-11, T2-12, T2-13, T2-14, T2-15, T2-16, T2-17, T2-18, T2-28

- [ ] **[T4-10] Navegación lateral en pantallas anchas**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/App.tsx:184-236`, `Stockly-F/src/routes/index.tsx`
  - **Qué hacer:** Con doce módulos, la barra superior con tres desplegables (Catálogo, Órdenes, Admin) obliga a dos interacciones para alcanzar la mayoría de destinos y no comunica bien la ubicación actual. La regla de navegación adaptativa recomienda barra lateral a partir de 1024 px, conservando la barra superior por debajo. **Se deja explícitamente fuera del alcance inmediato:** es un cambio de layout que toca T2-16 (ARIA de los desplegables), T2-18 (gestión de foco al cambiar de ruta), T3-04 (intercalado de enlaces) y los tests de `App`, y ninguna de esas tareas debería rehacerse dos veces. Reevaluar cuando el Tier 2 de accesibilidad esté cerrado.
  - **Criterio de aceptación:** si se aborda, todas las secciones son alcanzables en un clic a ≥1024 px, la sección actual queda destacada y la navegación por teclado y lector de pantalla sigue cumpliendo lo verificado en T2-16 y T2-18.
  - **Esfuerzo:** medio
  - **Depende de:** T2-16, T2-18, T3-04

- [x] **[T4-11] Selector de tema en Configuración: claro, oscuro o automático** ✅ *(2026-08-10)*
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/index.css`, `Stockly-F/index.html`, `Stockly-F/src/shared/lib/tema.ts`, `Stockly-F/src/modules/settings/`
  - **Origen:** no viene de la auditoría. Sale del cierre de T4-03, que dejó por escrito que no había conmutador manual porque «exigiría persistencia y un tercer estado (auto), que es otra tarea». Esta es esa tarea.
  - **Qué hacer:** T4-03 seguía `prefers-color-scheme` y no ofrecía forma de contradecirlo. Añadir una sección en Configuración con los tres estados —el importante es **auto**, que es lo que ve quien nunca entra ahí— y persistir la elección.
  - **Criterio de aceptación:** la elección sobrevive a una recarga, se aplica **antes del primer pintado** —sin fogonazo del otro tema— y los dos temas siguen cumpliendo AA.
  - **Esfuerzo:** bajo
  - **Depende de:** T4-03
  - **Verificado localmente (2026-08-10):** `verify` frontend ✅ **471/471 + 1 omitido** (23 nuevos), cobertura **52.17 %** *(desde 50.96)*; E2E **9 pasados, 1 omitido** en `chromium` y `Mobile Chrome`. En el navegador, con la preferencia del sistema emulada en oscuro: elegir «Claro» deja `color-scheme: light` y el fondo en `rgb(248, 250, 252)`, sobrevive a la recarga y el radio vuelve marcado.
  - **Todo el conmutador es `color-scheme`, y eso obligó a rehacer la capa de tokens — a mejor.** Una media query no se puede anular desde la aplicación, así que hacía falta un camino por selector. La salida obvia —duplicar la paleta oscura bajo `:root[data-tema="oscuro"]`— dejaba **cada color escrito en tres sitios**, y olvidarse en uno no rompe nada visible. En vez de eso, cada token pasa a declararse una sola vez con `light-dark(claro, oscuro)` y el navegador resuelve el par según el `color-scheme` efectivo. El bloque `@media (prefers-color-scheme: dark)` de 40 líneas **desaparece** y el conmutador entero son tres reglas de una línea. Comprobado antes de escribirlo: `light-dark()` sobrevive a la compilación de Tailwind 4, incluidos los modificadores de opacidad (`bg-accent/10` → `color-mix`).
  - **De paso arregla el apaño de las sombras de T4-03.** Aquel hallazgo —que Tailwind incrusta el color literal en la utilidad en vez de referenciar `var(--shadow-overlay)`, así que redefinir el token no hace nada— sigue siendo cierto, y por eso T4-03 tuvo que sobrescribir `--tw-shadow-color` bajo la media query. Con el par **dentro** del token, el literal incrustado ya lleva los dos valores: medido, `rgba(15, 23, 42, 0.06)` en claro y `rgba(0, 0, 0, 0.5)` en oscuro. Las dos reglas del apaño se borran.
  - **El parpadeo se mide, no se supone.** `main.tsx` es un módulo y por tanto diferido: para cuando corre, el navegador ya pintó. Quien elija un tema distinto al de su sistema vería el otro en cada carga — justo lo que el selector existe para evitar. Lo resuelve un script en línea y bloqueante en `<head>`. **Verificado sobre el build de producción**, con CPU a 1/20 y red «Slow 3G», leyendo el fondo en el primer `requestAnimationFrame`: con preferencia guardada «claro» y sistema en oscuro, el primer frame ya es `rgb(248, 250, 252)` **con React sin montar**. Falsificado quitando el script del `dist/index.html`: el mismo primer frame pasa a `rgb(11, 18, 32)`.
  - **La preferencia va en `localStorage`, no en la API.** Los ajustes de `/settings` son globales —los comparten todos los usuarios—, así que el tema de uno cambiaría la pantalla de los demás. Y aunque fueran por usuario, el tema es una preferencia de **dispositivo**. Por eso también cambia la página: «Apariencia» va en su propia tarjeta y el botón «Guardar cambios» **baja** del encabezado a la sección de ajustes, donde ahora se ve a qué gobierna; el tema se aplica al instante y no pasa por él.
  - **Defecto encontrado midiendo: el anillo de foco se pintaba blanco en oscuro.** `ring-offset-2` no deja un hueco transparente — lo rellena con `--tw-ring-offset-color`, que Tailwind fija en `#fff` de fábrica. Medido sobre el interruptor de Configuración: `rgb(255, 255, 255)` sin el token, `rgb(21, 29, 44)` con él. Dos usos en `src/`, los dos corregidos con `ring-offset-surface` / `ring-offset-background`. No lo veía ninguna guardia: no es una utilidad cruda de la paleta ni un hexadecimal en el código.
  - **Radios nativos y no botones con `aria-pressed`:** un grupo de radio se recorre con las flechas, entra con un solo tabulador y se anuncia como «2 de 3». Van `sr-only` y pinta la etiqueta que los envuelve, con `has-[:checked]`.
  - **Nueve mutaciones, nueve guardias caídas:** un color sin `light-dark()`, un bloque de tema por media query, la regla de «oscuro» borrada, una sombra con un solo color, un `ring-offset` sin token, la clave del script en línea cambiada, ese script convertido en módulo, y las dos mitades de `elegirTema` —aplicar y avisar— por separado.
  - **Salvedad:** el E2E no cubre el selector. Sus radios son `sr-only`, así que habría que pulsar la etiqueta, y lo que aporta sobre los tests de unidad —que el atributo sobreviva a una recarga real— ya se comprobó a mano en el navegador.

- [ ] **[T4-12] Los correos siguen saliendo solo en español**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-B/src/shared/templates/`, `schema.prisma`, registro y perfil
  - **Origen:** no viene de la auditoría. Sale del cierre de T4-04, que dejó traducida toda la interfaz y **no los correos**.
  - **Qué hacer:** la preferencia de idioma es de **dispositivo** y vive en el `localStorage` del navegador, así que el servidor no la conoce: verificación de cuenta, recuperación de contraseña y aviso de bajo stock salen siempre en español. Llevarla al servidor pide una columna `idioma` por usuario, enviarla en el registro y al cambiarla, y duplicar las plantillas —que hoy son HTML con el texto dentro—.
  - **Criterio de aceptación:** un usuario con la interfaz en inglés recibe en inglés los tres correos que la aplicación envía.
  - **Esfuerzo:** medio
  - **Depende de:** T4-04

- [ ] **[T4-13] La versión de PostgreSQL no coincide entre el desarrollo y el compose**
  - **Área:** DevOps
  - **Ubicación:** `docker-compose.yml`, `docs/README-proyecto.md`, `docs/operaciones.md`
  - **Origen:** no viene de la auditoría. La destapó el ensayo de restauración de T4-05.
  - **Qué hacer:** el servidor de desarrollo de este equipo es **PostgreSQL 17.10** y el compose levanta **`postgres:16-alpine`** (el README dice «PostgreSQL 16»). Un volcado tomado de un servidor 17 **no se restaura** en uno 16: es un fallo duro, y aparece el día de la recuperación, que es cuando peor viene. Decidir una versión y alinear las tres cosas. No se hizo dentro de T4-05 porque cambiar la imagen invalida el directorio de datos del volumen existente: exige `pg_upgrade` o un ciclo de volcado y restauración, con su propio ensayo.
  - **Criterio de aceptación:** un volcado tomado en cualquier equipo del proyecto se restaura en la pila del compose sin error de versión.
  - **Esfuerzo:** bajo
  - **Depende de:** T4-05

---

## Trazabilidad hallazgo → tarea

| Hallazgo | Severidad | Tareas |
|---|---|---|
| AR-01 Build no arranca | Crítico | T0-01 |
| AR-02 Imagen Docker rota (5 causas) | Crítico | T0-02 |
| AR-03 Cancelación no revierte stock | Crítico | T0-03, T0-04, T0-05 |
| AR-04 Configuración no se guarda | Alto | T1-05, T1-06, T1-07 |
| AR-05 Etiquetas no se asignan | Alto | T1-03, T1-04 |
| AR-06 Sin contratos compartidos | Medio | T2-24, T4-01 |
| AR-07 Estilo de módulos inconsistente | Bajo | T3-03 |
| S-01 Reset no revoca sesiones | Alto | T0-07, T0-08 |
| S-02 Credencial versionada | Alto | T0-06 |
| S-03 `requireAuth` sin `isActive` | Medio | T1-11, T1-12 |
| S-04 CSRF exento en `/auth/*` | Medio | T1-19 |
| S-05 SMTP sin TLS obligatorio | Medio | T1-20 |
| S-06 Contenedor como root | Medio | T1-21 |
| S-07 Primer usuario ADMIN | Medio | T1-22 |
| S-08 Sin detección de reuso de refresh | Bajo | T2-31 |
| S-09 Mimetype no verificado | Bajo | T2-32 |
| S-10 Límite de cuerpo global de 5 MB | Bajo | T2-33 |
| S-11 Fuga de rutas en errores | Bajo | T3-13 |
| C-01 Paginación no validada → 500 | Medio | T1-16 |
| C-02 `getActorEmail` triplicado | Medio | T1-13 |
| C-03 404 en HTML | Bajo | T2-01 |
| C-04 Sin logging estructurado | Bajo | T2-10 |
| C-05 Settings sin validación | Bajo | T1-07 |
| C-06 `User.role` sin enum | Bajo | T3-02 |
| C-07 Comentarios en inglés | Bajo | T3-01 |
| P-01 Sin índices en BD | Alto | T1-15 |
| P-02 Reportes agregan en memoria | Medio | T2-02 |
| P-03 Órdenes de compra sin paginar | Medio | T2-03, T2-04 |
| P-04 Exportaciones sin límite | Medio | T2-05 |
| P-05 Chunk vendor > 500 kB | Medio | T2-06 |
| P-06 SMTP bloquea la respuesta | Bajo | T2-07 |
| P-07 Lote de importación vs pool | Bajo | T2-08 |
| P-08 Búsqueda sin índice trigram | Bajo | T2-09 |
| A-01 Errores de formulario no anunciados | Alto | T1-14 |
| A-02 Botones sin nombre en etiquetas | Medio | T2-13 |
| A-03 `<Link><Button>` anidado | Medio | T2-14 |
| A-04 Checkbox sin nombre | Medio | T2-15 |
| A-05 Sin skip link | Medio | T2-11 |
| A-06 Sin `prefers-reduced-motion` | Medio | T2-12 |
| A-07 NavDropdown sin ARIA | Medio | T2-16 |
| A-08 Etiquetas sin `aria-pressed` | Medio | T2-17 |
| A-09 Sin gestión de foco en rutas | Bajo | T2-18 |
| A-10 Iconos sin `aria-hidden` | Bajo | T3-08 |
| U-01 Rutas admin sin guardia de rol | Medio | T1-18 |
| U-02 `setState` en efectos | Medio | T1-08, T1-10 |
| U-03 Edición de etiqueta sin datos | Medio | T1-17 |
| U-04 Sin modo oscuro | Bajo | T4-03 |
| U-05 Sin i18n | Bajo | T4-04 |
| U-06 Botón flotante solapa paginación | Bajo | T3-09 |
| U-07 Exportación esquiva el interceptor | Bajo | T2-34 |
| Q-01 Sin tests de contrato | Alto | T1-23, T2-24 |
| Q-02 Cobertura frontend 19.88 % | Alto | T2-19, T2-20, T2-21 |
| Q-03 `pnpm lint` falla | Medio | T1-09 |
| Q-04 E2E no reproducible | Medio | T1-24 |
| Q-05 Sin umbrales de cobertura | Bajo | T2-22 |
| Q-06 Zonas de baja cobertura | Bajo | T2-23 |
| R-01 CSV duplicado entre repos | Bajo | T3-05 |
| R-02 `.agents/` versionado | Bajo | T3-06 |
| R-03 `navLinks.slice` enrevesado | Bajo | T3-04 |
| R-04 Artefactos de build en el árbol | Bajo | T3-07 |
| D-01 READMEs desactualizados | Medio | T1-25, T1-26 |
| D-02 Swagger incompleto y obsoleto | Medio | T2-29, T2-30, T4-02 |
| D-03 Sin CHANGELOG ni ADRs | Bajo | T3-10, T3-11 |
| V-01 Sin verificación automatizada | Crítico | T1-01, T1-02 |
| V-02 Build no reproducible | Medio | T0-02 (punto 1), T2-26 |
| V-03 Sin healthcheck de aplicación | Medio | T2-25 |
| V-04 Credenciales por defecto en compose | Medio | T2-27 |
| V-05 Frontend sin despliegue | Medio | T2-28 |
| V-06 Sin backup ni monitorización | Bajo | T4-05 ✅, T4-06 ✅ |
| SEO — sin `robots.txt` | Bajo | T3-12 |
| Zonas no cubiertas — SCA y licencias | — | T4-07 |
| Zonas no cubiertas — pruebas de carga | — | T4-08 |
| Zonas no cubiertas — auditoría de navegador | — | T4-09 |

### Consultoría de diseño (2026-08-05)

*Hallazgos ajenos a la auditoría del 2026-08-04. Estilo adoptado: Flat Design + Minimalismo Suizo, perfil Data-Dense.*

| Hallazgo | Severidad | Tareas |
|---|---|---|
| DS-01 Sin capa de tokens semánticos (1 solo token en `@theme`) | Medio | T2-35 ✅, T2-37 ✅ |
| DS-02 561 utilidades de color crudas en 41 de 57 archivos | Medio | T2-36 ✅, T2-37 ✅ |
| DS-03 El estado se comunica solo por color (WCAG 1.4.1) | Medio | T2-38 ✅ |
| DS-04 Cifras proporcionales en columnas numéricas | Bajo | T2-39 ✅ |
| DS-05 Densidad sin sistema y `Button` de 36 px bajo el mínimo táctil | Medio | T2-40 ✅ *(densidad de fila, parcial)* |
| DS-06 Escala tipográfica implícita; `font-black` sin peso importado | Bajo | T2-41 ✅ |
| DS-07 Radios y sombras sin convención | Bajo | T3-14 ✅ |
| DS-08 Sistema de diseño sin documentar | Bajo | T3-15 ✅ |
| DS-09 Navegación superior con doce módulos | Bajo | T4-10 — *Tier 4, fuera de alcance* |

---

## Progreso

Registrar aquí cada tarea completada con su fecha y una nota breve de verificación.

| Fecha | Tarea | Verificación | Notas |
|---|---|---|---|
| 2026-08-11 | **T4-06** Monitorización y alertas — **completada** | **El criterio, ejecutado por HTTP contra la aplicación entera:** provocados 5xx reales hasta cruzar el umbral, sale el aviso por correo con las rutas y un `requestId`, y no sale por debajo del umbral ni durante el enfriamiento. Las reglas de Prometheus pasan `promtool test rules` ✅ —disparan con un 20 % de errores y **no** con tráfico sano—, y los dos archivos de configuración, `promtool check config` y `amtool check-config` ✅. `verify` ✅ **414/414**, cobertura 91.83 % | **Dos capas, y ninguna sobra:** la alerta en proceso avisa sin desplegar nada, pero no puede avisar de que el proceso ha muerto —un proceso muerto no manda correos—; eso es `up == 0` en Prometheus. **La prueba de las reglas destapó el número que justifica esa duplicidad:** de la primera 5xx a la alerta de Prometheus pasan **~8 min y medio**, y el `for: 2m` solo explica dos; el resto lo pone la ventana del `rate[5m]`. A ojo se habría dado por bueno «dos minutos». **Dos defectos propios encontrados midiendo:** `req.baseUrl + req.route.path` da `/:id` en Express 5 —restaura `baseUrl` al desapilar el router, y con un 5xx responde `errorHandler`, que vive fuera—, así que los doce módulos habrían caído en una sola serie; y ni Prometheus ni Alertmanager **expanden `${VARIABLES}`** en su configuración, cosa que se manifiesta como un objetivo caído con 401 y ninguna pista. **La cardinalidad se trata como lo que es**, un agujero de memoria explotable desde fuera: se etiqueta con la plantilla de ruta y lo no casado va a una etiqueta fija. `/metrics` responde **404** en producción sin token. El agregador de logs no necesitó código: T2-10 ya dejó JSON por línea con `requestId`. |
| 2026-08-11 | **T4-05** Backup, restauración y reversión — **completada** | **Restauración ejecutada, no descrita** ([registro](operaciones.md#5-ensayo-de-restauración--registro)): 31 MB → volcado de 76.7 KB en 0.2 s, restaurado en 0.3 s. Siete tablas de negocio, 12 migraciones y un `md5` de las 52 filas de inventario **idénticos**; `pg_dump --schema-only` comparado línea a línea sin diferencias reales; `prisma migrate status` «up to date»; y la aplicación arrancada contra la copia responde **200** en `/api/v1/ready`, que sondea la base | **Dos guiones, porque un procedimiento que se copia y pega a mano no se ejecuta**: `pnpm db:backup` y `pnpm db:restaurar`, en Node y no en `.sh` —el proyecto se trabaja desde Windows y la copia debe programarse igual en el Programador de tareas que en `cron`—. **El ensayo por defecto no es el comando del desastre:** restaura en `Stockly_restauracion` y apuntar a la base real exige `--forzar`. **Cuatro trampas silenciosas encontradas montándolo:** el `DATABASE_URL` del `.env` **no le vale a `pg_dump`** (la `@` sin codificar hace que libpq busque un socket `@localhost`, con un error que no la menciona); **`pg_restore` sale con código 0 aunque falle** salvo `--exit-on-error`; un cliente más nuevo que el servidor vuelca sin protestar y rompe al restaurar; `dropdb` se cuelga con un Prisma Studio abierto. **La retención lleva guardia contra sí misma** —mínimo 3 copias y podar solo tras verificar el volcado—, porque una poda por antigüedad a secas borra la última copia buena el día en que es lo único que queda. **Destapó que el servidor de desarrollo es 17.10 y el compose levanta `postgres:16-alpine`**: un volcado de 17 no entra en un 16 → **T4-13**. |
| 2026-08-10 | **T4-11** Selector de tema en Configuración — **completada** | Sobre el build de producción, con CPU a 1/20 y red «Slow 3G»: con preferencia «claro» y sistema en oscuro, el **primer `requestAnimationFrame`** ya pinta `rgb(248, 250, 252)` **con React sin montar**. Falsificado quitando el script del `dist/index.html`: el mismo frame pasa a `rgb(11, 18, 32)`. `verify` ✅ **471/471**, E2E ✅ | **El conmutador obligó a rehacer la capa de tokens, a mejor:** una media query no se anula desde la aplicación, y duplicar la paleta bajo `[data-tema]` dejaba cada color en tres sitios. Cada token pasa a `light-dark(claro, oscuro)`, el bloque de 40 líneas de T4-03 **desaparece** y el conmutador entero son tres reglas de `color-scheme`. **Deja obsoleto el apaño de las sombras** de T4-03: con el par dentro del token, el literal que Tailwind incrusta ya lleva los dos valores. **Defecto encontrado midiendo:** `ring-offset-2` rellena el hueco con `#fff` de fábrica, así que el anillo de foco dibujaba un halo blanco en oscuro —`rgb(255,255,255)` medido, `rgb(21,29,44)` tras el arreglo—. La preferencia va en `localStorage` y no en `/settings`, que es global a todos los usuarios. Nueve mutaciones, nueve guardias caídas. |
| 2026-08-04 | **T0-01** Alias `@/` en el build | `pnpm build && node dist/server.js` arranca y conecta con la BD | `tsc-alias@1.9.1` como devDependency; `build` pasa a `tsc && tsc-alias`. Se añadió también un `prebuild` que limpia `dist/` sin dependencias nuevas — **absorbe T3-07**. |
| 2026-08-04 | **T0-02** Imagen Docker (5 fallos) | `docker compose up --build` → migraciones aplicadas + `GET /api/v1/health` **200** | Dentro de la imagen: `pnpm 11.2.2`, `prisma.config.ts` presente, CLI de Prisma disponible. `prisma` movida a `dependencies`; `packageManager` fijado; `pnpm-workspace.yaml` copiado; `ARG DATABASE_URL` para `prisma generate`. **Absorbe el anclaje de versión de T2-26.** |
| 2026-08-04 | **T0-03** Reposición de stock al cancelar venta enviada | Test: stock 100 → `SHIPPED` 70 → `CANCELLED` **100** + movimiento `IN` de `+30` | Rama `beingCancelled` transaccional, simétrica al envío. |
| 2026-08-04 | **T0-04** Descuento de stock al cancelar compra recibida | Test: stock 100 → `RECEIVED` 140 → `CANCELLED` **100** + movimiento `OUT` de `-40` | Decremento condicional: si las unidades ya se consumieron, 400 y la transacción se revierte entera. |
| 2026-08-04 | **T0-05** Tests de cancelación | 6 tests nuevos en `sale-orders.test.ts` y `purchase-orders.test.ts`, todos en verde | Cubren reposición, descuento, stock ya consumido (400), cancelar `PENDING` (sin efecto) y no reponer dos veces. |
| 2026-08-04 | **T0-06** Credencial del E2E | Cero coincidencias en todos los blobs del historial reescrito; `origin/main` actualizado | Valor por defecto ahora el del seed (`Admin1234!`). Historial purgado con `git-filter-repo --replace-text` y publicado con `push --force`: los 24 SHA cambiaron (`main` pasó de `af1d8d3` a `7290e33`). **Rotada por el propietario el 2026-08-10**, así que el valor que sobrevive en el historial está muerto; ese día se retiró además del árbol actual, donde seguía en claro en `docs/CONTEXTO.md` y aquí mismo. Queda solo una gestión externa, ya sin urgencia: abrir ticket a GitHub Support para recolectar el commit huérfano `55efe3b`. |
| 2026-08-04 | **T0-07** Reset revoca sesiones | Test: `POST /auth/refresh` con la cookie previa devuelve **401** tras el reset | `resetPassword` anula `refreshToken`/`refreshExpires`, igual que `updatePassword`. |
| 2026-08-04 | **T0-08** Test de regresión del reset | En verde; falla si se revierte T0-07 | Login → refresh OK → forgot → reset → refresh 401 + campos nulos en BD. |
| 2026-08-05 | **T1-01** Cadena de verificación del backend — *verificada, sin marcar* | Los 6 pasos ejecutados localmente: `check` ✅, `test:coverage` ✅ 205/205, `build` ✅, arranque del artefacto ✅ (`/api/v1/health` → 200) | Hallazgos que la secuencia exige: `prisma generate` como paso propio y previo (el cliente está en `.gitignore`) y base de tests `Stockly_test` para alinearse con la reescritura de `jest.setup.js:11`. Sin verificar: `migrate deploy` en base nueva — Docker no disponible. **Pendiente:** empaquetarlo como script `verify`. |
| 2026-08-05 | **T1-02** Cadena de verificación del frontend — *verificada, bloqueada* | `install --frozen-lockfile` ✅, `check` ✅, `test:coverage` ✅ 181/181, `build` ✅. **`lint` ❌ 26 errores** | Se añadieron a `package.json` el script `check` (`tsc -b`) y el campo `packageManager: pnpm@11.2.2`, que no existían. El rojo del lint **es T1-09**. **Pendiente:** empaquetarlo como script `verify`. |
| 2026-08-06 | **Decisión: sin CI** | `Stockly-B/.github/` y `Stockly-F/.github/` eliminados | Se descarta GitHub Actions y cualquier pipeline. Toda la verificación (tipos, lint, tests, cobertura, build, E2E) se ejecuta en local. T1-01 y T1-02 se reformulan como guiones de verificación local. También se quitó la dependencia de `process.env.CI` en `playwright.config.ts:11-12`. |
| 2026-08-07 | **T1-01** Script `verify` del backend — **completada** | `pnpm verify` entero en verde contra el PostgreSQL local (5433): `generate` ✅, `migrate deploy` ✅, `check` ✅, `test:coverage` ✅ 205/205, `build` ✅, smoke ✅ `/api/v1/health` → 200, salida **0**. Camino de fallo comprobado: con `dist/server.js` renombrado sale **1** | Nuevo `scripts/smoke.js`. Usa `SMOKE_PORT` (3100) para no chocar con el `dev`, y `process.exitCode` en vez de `process.exit()`: en Windows, salir con el hijo aún cerrándose aborta libuv (`UV_HANDLE_CLOSING`) y devuelve un código basura pese a haber pasado la comprobación. |
| 2026-08-07 | **T1-05** Payload de `PATCH /settings` — **completada** | Contra el backend real: el payload antiguo `{updates:{…}}` responde **200 con `data` vacío y no persiste**; el objeto plano persiste `true`. Ajuste restaurado a `false` | El 200 mudo es lo que hizo invisible el fallo. Convertirlo en 422 es T1-07. |
| 2026-08-07 | **T1-14** Errores de formulario atados a su campo — **completada** | 6 tests nuevos en `Input` y `Select`: `aria-invalid`, `aria-describedby`, `toHaveAccessibleDescription`, `role="alert"` y el caso negativo sin atributos residuales | El `id` del mensaje se deriva del `id` del campo, así que la corrección se propaga a **todos** los formularios. Sin verificar: la locución real en un lector de pantalla. |
| 2026-08-07 | **T1-22** Sin promoción automática a ADMIN — **completada** | Test sobre el primer registro de una base limpia: `count() === 1` y `role === "USER"`. Backend **223/223** | Se fija `role: "USER"` y desaparece el `count()`: sin consulta previa no hay carrera, así que no hizo falta la transacción `Serializable`. **Consecuencia operativa:** en un despliegue nuevo nadie es admin hasta ejecutar el seed — documentado en el README, donde además el recuento de usuarios del seed estaba mal (2 en vez de 3). |
| 2026-08-07 | **T1-03 + T1-04** Etiquetas de producto — **completadas** | 10 tests nuevos: crear con etiquetas, `set` al actualizar, 422 con UUID inválido, filtro `?tagId=`, vaciado, y 5 de normalización del esquema | El servicio ya sabía manejarlas; solo el validador las descartaba. **Hueco extra encontrado:** con `FormData` una lista vacía no viaja, así que quitar todas las etiquetas era imposible — ahora el cliente manda `tagIds: ""` y el validador lo traduce a `[]`. El formato multipart no es ejercitable por HTTP en la suite (multer está mockeado), así que esa parte se valida contra el esquema. |
| 2026-08-07 | **T1-17** Formulario de etiquetas al editar — **completada** | `TagsPage.test.tsx` nuevo, 3 tests: precarga, cambio entre etiquetas y modal vacío al crear | `key={editingTag?.id ?? "new"}`. De paso, `aria-label` en los botones de editar y eliminar, que eran solo icono y no tenían nombre accesible. |
| 2026-08-07 | **T1-11 + T1-12 + T1-13** `isActive` y actor de auditoría — **completadas** | Tests nuevos: la misma cookie pasa de 200 a **403** al desactivar la cuenta; refresh de cuenta desactivada → **401**; el `AuditLog` conserva el email del actor. Backend **222/222** | Un solo cambio en el `select` de `requireAuth` resuelve las tres: `isActive` cierra la ventana de 15 min de una cuenta desactivada y `email` elimina **12 consultas redundantes**, una por mutación. Las tres copias de `getActorEmail` borradas. |
| 2026-08-07 | **T1-18** Guardia de rol en el frontend — **completada** | 3 tests: `USER` en `/admin/users` → dashboard, `ADMIN` accede, y sin `requireRole` basta la sesión | Redirige al dashboard, no al login: la sesión es válida, falta el permiso. Aplicado a `/audit-logs`, `/settings` y `/admin/users`. |
| 2026-08-07 | **T1-07** Validación Zod en `PATCH /settings` — **completada** | 5 tests de integración nuevos: clave desconocida, payload `{updates:{…}}`, tipo equivocado, cuerpo no-objeto y cuerpo vacío → **422** en los cinco. `verify` backend ✅ **209/209** | Esquema generado desde `SETTINGS_CATALOG`: un ajuste nuevo se valida solo. Cierra el 200 mudo que dejó vivir a T1-05. **Cambio de contrato:** el endpoint deja de tolerar claves desconocidas. |
| 2026-08-07 | **T1-06** Tipo de `SettingEntry.value` — **completada** | `GET /settings` real devuelve `"value":false` (boolean) y **sin** `defaultValue`: los dos desajustes confirmados | Nuevo `SettingValue = boolean \| string \| number` y `esVerdadero()`. Se eliminó `defaultValue` del tipo, que el backend nunca envía. El mock del test se corrigió: era el ejemplo canónico del informe. |
| 2026-08-07 | **T1-08** Efecto de sincronización de `SettingsPage` — **completada** | `eslint` limpio en el archivo ✅ · 7/7 tests (4 existentes + 3 nuevos) | Estado `cambios` solo con lo tocado y valores derivados en render. De paso, el guardado envía únicamente los ajustes modificados. Sin verificar: el recuento de renders con el Profiler. |
| 2026-08-07 | **T1-09** `pnpm lint` en verde — **completada** | `pnpm lint` → **0 errores, 0 avisos, exit 0** ✅ (venía de 26 y 4) | `coverage` a `globalIgnores`, `react-refresh/only-export-components` desactivada solo en `src/routes/**`, y `watch()` → `useWatch()` en `TagsPage`, que además deja de ser descartado por el React Compiler. |
| 2026-08-07 | **T1-02** Script `verify` del frontend — **desbloqueada y completada** | `pnpm verify` entero **exit 0**: `check` ✅, `lint` ✅, **190/190** ✅, `build` ✅ | Estuvo en rojo por el lint desde que se escribió, hasta cerrar T1-09. |
| 2026-08-07 | **T1-10** `setState` en efecto de `App.tsx` y `ProductForm.tsx` — **completada** | `eslint` limpio en ambos archivos ✅ · `check` ✅ · **187/187** tests ✅. Lint global **26 → 24** errores; cobertura de sentencias **19.88 % → 23.83 %** | Ambos resueltos derivando en render, sin efecto: `App.tsx` guarda la ruta de apertura (`openedAt === pathname`) en vez de un booleano; `ProductForm.tsx` pasa los valores a `defaultValues` y las etiquetas al inicializador de `useState`, apoyándose en el remonte por `key` de `ProductsPage:255`. Se añadieron 6 tests, entre ellos el primer `App.test.tsx`, porque ninguno de los dos comportamientos estaba cubierto. |
| 2026-08-07 | **T1-02** Script `verify` del frontend — *implementado, bloqueado por T1-09* | `check` ✅, `test:coverage` ✅ 181/181, `build` ✅. **`lint` ❌ 26 errores + 4 avisos**, así que `verify` se detiene ahí | El primer `verify` real destapó **un conflicto de merge sin resolver commiteado** en `e2e/smoke.spec.ts:3-12` (merge `4254582`, 2026-08-05) que reintroducía la credencial filtrada purgada por T0-06 — resuelto a favor del lado del seed, con lo que el lint vuelve de 27 a 26 errores. También: ESLint analiza `coverage/`, de donde salen 3 de los 4 avisos. |
| 2026-08-07 | **T1-16** Paginación saneada, sin 500 — **completada** | 12 tests nuevos (7 unitarios + 5 de HTTP): los cinco endpoints con `page`/`limit` no numéricos responden **200 con la paginación por defecto**. `verify` backend ✅ **235/235**, cobertura **88.15 %** | Helper `parsePagination` en `shared/lib/`, con `defaultLimit` por servicio (productos y ventas 10, usuarios 20, auditoría 50) y techo de 100. Cualquier valor que no sea entero positivo —texto, cero, negativo, cadena vacía— cae al valor por defecto en vez de convertirse en `NaN`. **Hallazgo extra:** `limit` ya tenía techo pero `page` no, así que `?page=99999999999999` seguía dando 500 al desbordar el entero de 32 bits de PostgreSQL; ahora `page` se acota a 1 000 000. Desbloquea **T2-03**. |
| 2026-08-07 | **T1-15** Índices ausentes en la base de datos — **completada** | `EXPLAIN (ANALYZE, BUFFERS)` sobre 40 000 filas: `stock_movements` por producto **5.709 → 0.747 ms** (`Seq Scan` → `Bitmap Index Scan`, 617 → 205 buffers), `audit_logs` paginado **7.857 → 0.110 ms** (`Seq Scan` + sort → `Index Scan Backward`, 455 → **3** buffers), `products` por categoría **8.807 → 1.665 ms**. `verify` ✅ **235/235** | Migración `20260807215703_add_missing_indexes` con los **15 índices** de la lista. Dos observaciones honestas: `products_isActive_idx` **no se usa** —la consulta dominante filtra `isActive = true`, la mayoría de las filas, y el planificador acierta descartándolo—, y falta un índice por `createdAt` en `products` pese a que todos los listados ordenan por él; la lista de la auditoría no lo contemplaba. **Trampa del entorno:** `Stockly_test` no tiene tabla `_prisma_migrations`, así que `migrate deploy` falla con **P3005**; se sincroniza con `prisma db push`. |
| 2026-08-07 | **T1-19** Exención CSRF explícita — **completada** | 10 tests: `logout`, `PUT /me` y `PATCH /me/password` → **403** sin token; las 7 rutas públicas siguen sin exigirlo | El prefijo `/api/v1/auth/` eximía tres operaciones autenticadas y mutantes; `logout` era explotable por formulario cross-site, sin preflight que lo frenara. El frontend ya mandaba la cabecera en toda petición mutante, así que endurecer no rompió nada — comprobado antes de tocar el middleware. |
| 2026-08-07 | **T1-20** STARTTLS obligatorio en SMTP — **completada** | Servidor SMTP de mentira sin STARTTLS: con `requireTLS` el envío aborta con **`ETLS`**; **sin él, el mismo correo sale en claro y es aceptado** | El contraste está escrito como test: es lo que demuestra que la corrección hace algo. `secure` queda atado al puerto 465 (TLS implícito). **Sin verificar:** el envío contra el SMTP real, que necesita credenciales que no están en esta máquina. |
| 2026-08-07 | **T1-26** Variables de entorno realmente opcionales — **completada** | 7 tests: `validateEnv()` no lanza sin las 8 opcionales, avisa si un grupo queda a medias; correo y Cloudinary responden **503** nombrando lo que falta | `required` baja de **12 a 4**. Era un bloqueador de puesta en marcha: el README prometía que Cloudinary y SMTP eran opcionales y el arranque las exigía. `.env.example` reescrito en tres bloques; corregido el «doce variables» del README y de `CLAUDE.md`. |
| 2026-08-07 | **T1-25** READMEs alineados con el código — **completada** | Las 6 divergencias comprobadas una a una contra el código; cero coincidencias de `/api/` sin versionar o `api-docs` | Prefijo `/api/v1` en las 11 secciones, Swagger en `/api/v1/docs` (y solo fuera de producción), `PATCH /me/password`, validación manual en vez de Zod, Node 22. Se documentaron `pnpm verify` y `pnpm smoke`, que no aparecían. El «README de la raíz» de la auditoría no existe aquí: su papel lo cumple `docs/README-proyecto.md`. |
| 2026-08-07 | **T1-24** E2E reproducible — **completada** | `pnpm test:e2e:full` **sin levantar nada a mano**: 9 pasados, 1 omitido | `e2e/global-setup.ts` deja la base lista (y solo recurre a Docker si no hay PostgreSQL escuchando); el `webServer` arranca backend y frontend. Proyecto `Mobile Chrome` añadido. **Hallazgo:** el rate limit global (100/15 min) se agota en una sola pasada del navegador y devolvía 429 hasta en la comprobación de salud; se añadieron `RATE_LIMIT_MAX` y `AUTH_RATE_LIMIT_MAX` para subir el techo **sin desactivar limitador ni CSRF**. |
| 2026-08-07 | **T1-23** E2E de los tres flujos rotos — **completada** | Los 3 escenarios pasan contra la aplicación completa en `chromium` y `Mobile Chrome` | **Dos defectos encontrados y corregidos por el camino:** el modal no tenía scroll propio, así que un formulario más alto que la ventana dejaba sus botones fuera de pantalla e inalcanzables; y `Input`/`Select` no ataban la etiqueta al campo sin un `id` explícito, dejando varios controles sin nombre accesible (`useId` como respaldo). **Limitación anotada:** la interfaz no permite cancelar una orden ya enviada, así que ese paso del tercer escenario va por API. |
| 2026-08-07 | **T1-21** Contenedor sin privilegios — **implementada, SIN VERIFICAR** *(→ verificada el 2026-08-09, fila más abajo)* | — | `COPY --chown=node:node`, `chown -R` y `USER node` en el stage runner. **El daemon de Docker no arrancaba en esta máquina**, así que `docker exec … id` → `uid=1000(node)` quedó sin comprobar hasta el 2026-08-09. |
| 2026-08-07 | **T2-03 + T2-04** Órdenes de compra paginadas — **completadas** | Backend: 6 tests (criterio literal, sin repetición entre páginas, filtro por estado, estado inventado ignorado, `?page=abc` sin 500). Frontend: 4 tests con 23 órdenes — «Siguiente» **pide `{page: 2}` al servidor**, no recorta en cliente | Era la última lista de la API sin techo. Se replicó también `parseStatusFilter`, así que compras y ventas quedan simétricas. En el frontend, los parámetros entran en la clave de React Query (una caché por página) y borrar la última orden de una página retrocede desde el propio evento, sin `setState` en efecto (T1-10). **Hallazgo menor:** el contador decía «ordenes» sin tilde, por concatenar `"es"`. |
| 2026-08-07 | **T2-29** Esquema `Product` de Swagger — **completada** | El cuerpo documentado enviado a `POST /products` devuelve **201** y `category` sale como objeto. 5 tests | El test **compara los campos escribibles del esquema con lo que acepta `createProductSchema`**: si documentación y validador vuelven a separarse, la suite lo dice. Esquemas nuevos `NamedRef`, `Tag`, `ProductWrite` y `ProductImport` (que va por nombre de categoría, no por id). Corregidos también los filtros de `GET /products`. |
| 2026-08-07 | **T2-17** Conmutadores de etiqueta accesibles — **completada** | 4 tests de componente + 7 del helper `color.ts`. El contraste se comprueba **recorriendo los 256 grises**: peor caso **4.58 ≥ 4.5** | `aria-pressed`, `role="group"` rotulado y color de texto calculado por luminancia. **Obligó a usar negro puro:** con un gris oscuro, el peor fondo se queda en 4.23 y no llega al mínimo. Destapó además que `#ef4444` contrasta más con negro (5.7) que con blanco (3.7). `textoLegibleSobre()` queda listo para T2-38. |
| 2026-08-07 | **T2-35** Capa de tokens semánticos — **completada** | Los tres puntos del criterio: capa completa (13 tests), propagación comprobada cambiando `--color-accent` a `#ff00ff` y reconstruyendo, y contrastes **recalculados desde `index.css`** con la fórmula WCAG | **Corrección sobre la ficha de la paleta:** `#dc2626` cumple contra blanco (4.83) pero **falla sobre su propia superficie de badge (4.41)** — los ratios estaban medidos solo contra blanco. Ahora `#b91c1c`. Lo encontró el test, no la revisión a ojo. **Comprobado contra Tailwind 4:** todos los tokens generan utilidad salvo las duraciones, que no tienen espacio de nombres; por eso viven en `:root`. Ningún `--radius-*` tocado, con test que lo vigila. Desbloquea T2-36/37/38/39/40/41. |
| 2026-08-07 | **T2-36** `Button` y `Badge` semánticos — **completada** | Cero utilidades crudas en los dos primitivos y cero variantes decorativas en la app. `verify` ✅ **231/231**; E2E **3 pasadas seguidas** en verde | Las 7 variantes de `Badge` pasan a 5 con significado, y los 12 usos se reasignan por lo que comunican (categoría → `neutral`, no `info`: clasifica, no informa de estado). `BadgeVariant` exportado tipa los cuatro mapas del proyecto: el compilador cazó un `purple` superviviente. Los tests comprueban con expresión regular que **ninguna variante emite una utilidad cruda**. **Prueba intermitente corregida:** el E2E de configuración esperaba a que el botón se deshabilitara, pero eso también ocurre con la petición en vuelo; ahora espera la respuesta del PATCH. |
| 2026-08-07 | **T2-37** Fuera las utilidades de color crudas — **completada** | **593 sustituciones en 39 archivos**; el grep del criterio devuelve **cero, sin excepciones**. `verify` ✅ **232/232**, E2E ✅. Comparación visual antes/después de dashboard, productos y reportes con Chrome DevTools | Codemod en Node (PowerShell habría roto el UTF-8). El criterio deja de depender de que alguien ejecute el grep: `tokens.test.ts` lo comprueba en cada `verify`. **Regresión que solo se vio en las capturas:** el fondo de página (`bg-gray-50`) acabó en `bg-surface-muted`, el mismo valor que el botón secundario, que se volvió invisible; los 9 contenedores de página pasan a `bg-background`. `gray-50` significaba dos cosas distintas según dónde estuviera, y eso una sustitución mecánica no lo distingue. **Fuera de alcance:** las paletas de Recharts siguen en hex — son props, no clases. |
| 2026-08-08 | **T2-38** El estado se dice con icono, no solo con color — **completada** | Verificado **con el filtro de escala de grises del navegador**, que es el criterio: capturas en gris de tabla de productos, órdenes de compra y de venta, movimientos y dashboard. `verify` ✅ **257/257** (25 tests nuevos), E2E ✅ | Etiqueta, color e icono salen de un descriptor único (`shared/lib/estados.ts`): no hay forma de poner uno sin los otros. **Defecto destapado:** «bajo» y «agotado» eran el mismo triángulo ámbar, indistinguibles incluso **con** color; `nivelDeStock()` los separa y agotado gana a bajo. El test extrae del SVG los atributos `d` —la geometría, no el nombre del componente— y exige que dos estados del mismo conjunto no coincidan; falsificado dando a «Cancelado» el reloj de «Pendiente». Se migraron también `UsersPage` y `ProductDetailModal`, fuera de la ubicación listada. Los estados que faltaban en la base de desarrollo se crearon para verlos y **se borraron después**. |
| 2026-08-08 | **T2-39** Cifras tabulares en las columnas numéricas — **completada** | **Medido en el navegador** (jsdom no tiene métricas de fuente): el KPI de valor de inventario pasa de moverse **50.42 px** entre `$1,111,111.11` y `$8,888,888.88` a **0**; los bordes derechos de la columna de stock caen todos en la misma coordenada. `verify` ✅ **260/260**, E2E ✅ | La regla va en `index.css` sobre `table`, no celda a celda: la próxima tabla nace alineada. Las cifras tabulares **no bastaban** para el criterio de alineación vertical — hizo falta alinear a la derecha la columna de precio y meter el stock en una caja de ancho fijo, porque el icono y el mínimo que van detrás cambian de ancho por fila. **Trampa:** la contraprueba con la clase `proportional-nums` no medía nada, porque Tailwind solo genera las utilidades que aparecen escritas en el código; hay que usar `style.fontVariantNumeric`. |
| 2026-08-08 | **T2-40** Densidad y mínimo táctil — **completada con una salvedad** | Mínimo táctil: de **71 dianas bajo 44×44 a 0** a 375 px, con emulación táctil, barriendo seis pantallas y el modal de nueva orden. Fila de escritorio: **80.8 → 48.8 px**. `verify` ✅ **269/269**, E2E ✅ | **Los 36 px de fila no se alcanzan**: 6+6 de relleno, 20 de nombre y 16 de SKU son ya 48, y la celda de imagen 44; llegar a 36 exigiría quitar el SKU y bajar la miniatura a 24 px, o sea empeorar la tabla para cuadrar la cifra. Se documenta en vez de forzarlo. Un solo componente en dos densidades (`min-h-11` / `md:min-h-9`); lo que no puede crecer —casilla de 16 px, interruptor de 24— recibe el toque en su envoltorio. La rejilla de 12 columnas de los ítems de orden dejaba «Cant.» en 38 px de ancho a 375 px: pasa a 2 columnas hasta `md`. **Regresión propia cazada por el E2E:** el `sr-only` con que nombré la casilla duplicaba el nombre del producto en el árbol de texto; se sustituye por `aria-label`. |
| 2026-08-08 | **T2-41** Escala tipográfica explícita y recorte de Inter — **completada** | Dos compilaciones reales para medir el antes y el después: **56 → 8 archivos de fuente emitidos**, CSS **78.40 → 68.40 kB** (gzip **13.55 → 12.14**). `verify` ✅ **279/279** (10 tests nuevos), E2E ✅ | La escala se declara **borrando antes** `--text-*` y `--font-weight-*`: los tamaños no declarados dejan de existir, así que es una restricción, no un comentario. Cinco tamaños con un papel cada uno y cuatro pesos. El ahorro de fuentes viene de que `@fontsource/inter/400.css` trae **siete `@font-face` por peso** (cirílico, griego, vietnamita…) para una aplicación que solo se escribe en español; los `latin-*.css` traen uno. **La auditoría no había visto el `text-6xl`** del 404: apareció al borrar el espacio de nombres, junto al `font-black` que el navegador venía fingiendo. **El test se acusaba a sí mismo** —encontraba las clases prohibidas en los comentarios que explican por qué se fueron—, así que escanea el código sin comentarios. |
| 2026-08-08 | **T2-10** Logging estructurado con correlación — **completada** | Los tests **capturan la salida real de pino** y recuperan las líneas de una petición por su `x-request-id`. `verify` ✅ **275/275** (8 nuevos), E2E ✅ 3 pasadas | `pino` + `pino-http` sustituyen a morgan y al `console.error`. **La redacción no era opcional:** pino-http registra todas las cabeceras, así que sin ella la cookie de sesión iba al log en cada llamada. Dos defectos vistos al mirar la salida: el mensaje decía `GET /` (Express reescribe `req.url` en un router montado) y en desarrollo se volcaban `req` y `res` enteros. **Regresión propia:** el hilo de `pino-pretty` subió el E2E de 36 s a 66 s con dos pruebas agotando su tiempo; aislada con `git stash` contra el estado anterior y resuelta condicionando el formato legible a `process.stdout.isTTY`. |
| 2026-08-08 | **T2-07** Las alertas de stock dejan de bloquear la respuesta — **completada** | Con un SMTP de 500 ms la respuesta tarda menos de 500; con el `await` anterior, **750 ms**. `verify` ✅ **275/275** | Un `void promesa` habría dejado el envío sin testar y los fallos sin registrar: hay un registro de alertas en vuelo y `esperarAlertasEnVuelo()`, así que los tests esperan de verdad. En órdenes de venta era una alerta por producto **y en serie**. |
| 2026-08-09 | **T2-19 a T2-22** Cobertura del frontend y umbrales — **completadas** | `PurchaseOrdersPage` **49.25 → 92.53 %**, `UsersPage` **0 → 86.66 %**, `DashboardPage` **0 → 81.81 %**, `ReportsPage` **0 → 84.37 %**; global **38.52 → 44.55 %** con **369** tests. Umbrales falsificados en los dos repos subiéndolos a 99 % y comprobando que `verify` falla | Los tests miran el **payload**, no solo la pantalla: cantidades como número y no como texto, proveedor vacío como `undefined`. En usuarios lo importante es lo que **no** debe poder hacerse —actuar sobre la propia cuenta, que el backend rechaza con 400—. **Trampa cara:** el primer mock de Recharts era un `Proxy` que respondía a cualquier propiedad, incluida `then`; eso vuelve el módulo «thenable» y el `import()` no resuelve nunca — la suite se cuelga sin dar un error. |
| 2026-08-09 | **T2-12 a T2-16** Bloque de accesibilidad cerrado — **completadas** | 21 tests nuevos y dos comprobaciones en navegador: con «reducir movimiento» la transición de un botón pasa de **0.15 s a 0.00001 s** y el spinner de 1 s a 3 s; la fila de la tabla expone **6 paradas de tabulación, una por acción**, y cero interactivos anidados. `verify` ✅ **336/336**, E2E ✅ | **Una desviación deliberada:** T2-16 pedía `role="menu"`/`menuitem` en `NavDropdown` y **no se aplica**, porque ese rol es para comandos y dentro hay enlaces de navegación: con él dejan de anunciarse como enlaces y salen de la lista de enlaces del lector. Lo destapó el E2E al no encontrar «Productos» por rol — un fallo de prueba ajena señalando un problema real. El resto: `prefers-reduced-motion` reduce sin eliminar (con `none`, los `transitionend` quedan colgados), los diez selectores de color pasan a tener nombre y `aria-pressed`, el `<button>` dentro de `<a>` se queda en enlace con las clases extraídas a `clasesDeBoton()`, y la casilla «seleccionar todos» completa la selección sin desmarcar lo ya marcado, con estado indeterminado —que solo existe como propiedad del DOM—. |
| 2026-08-09 | **T2-18** Foco y anuncio al cambiar de ruta — **completada** | **Medido en el navegador:** al ir del panel a Reportes, `document.title` → «Reportes · Stockly», la región viva → «Reportes» y el foco → `#contenido`; **el Tab siguiente cae en «Descargar PDF», dentro de `<main>`**, no al principio del menú. `verify` ✅ **313/313** (12 tests nuevos), E2E ✅ | El texto se **deriva** del `pathname`: ni `setState` en efecto (T1-08, T1-10) ni anuncio en la primera carga, porque una región viva anuncia sus cambios y no su contenido inicial. Los títulos **no se leen del `<h1>`** —con las rutas en `lazy()` aún no está montado al cambiar de ruta—, viven en una lista que `titulos.test.ts` compara con el router en ambos sentidos. De paso, `document.title` deja de ser el mismo en las 21 rutas. **Trampa al medir:** la primera lectura decía que no pasaba nada; era la medición, no el código — React Router navega en `startTransition`, la URL cambia antes de que React confirme el render y el efecto corre al confirmar. |
| 2026-08-09 | **T2-43** Índices del orden por `createdAt` en `products` — **completada** | `EXPLAIN (ANALYZE, BUFFERS)` sobre 40 000 productos: listado por defecto **10.309 ms → 0.016 ms** (773 → 7 buffers); filtrado por activos **10.170 → 0.015 ms**; por inactivos **0.701 → 0.022 ms**. `verify` ✅ **275/275** | Dos índices, no uno: el filtro `isActive` es **opcional**, así que el listado sin filtro es una consulta real y el compuesto no la sirve (su primera columna no es `createdAt`). `products_isActive_idx` **no se retira: se amplía** a `(isActive, createdAt)`, que gana por medición al índice parcial `WHERE isActive = false` —iguala en el caso inactivo pero no sirve para nada más y no es expresable en el esquema de Prisma, así que habría vivido en SQL suelto—. Los 40 000 productos de banco se borraron al terminar. |
| 2026-08-09 | **T2-44** Un solo formato de importe — **completada** | 18 sustituciones en 7 archivos y 9 tests nuevos. `verify` ✅ **301/301**, E2E ✅. **Comprobado en la página real:** «Top por valor» pinta `$14,999.00` junto a `$179,988.00`, donde antes el primero salía `$14999.00` | `Intl.NumberFormat` con `style: "currency"` en vez de `toLocaleString` con decimales: el símbolo deja de escribirse a mano (eran 20 `$` sueltos), los negativos se colocan bien y `signDisplay` da el `+` de la columna de variación. Un valor no numérico devuelve `—`, no `$NaN`. **Dos exclusiones deliberadas:** las etiquetas compactas de los ejes y `dailyVelocity`, que no es dinero — el primer escáner las marcaba, y por eso el definitivo busca los dos patrones concretos que existían. |
| 2026-08-08 | **T2-45** Scrollers horizontales contenidos en móvil — **completada** | Sonda `position: fixed; inset: 0` en Pixel 5 (393 px): **663 → 393**. `pnpm test:e2e:full` **9 pasados, 1 omitido, 0 fallos** en `chromium` **y** `Mobile Chrome`, que venían de 2 fallos. `verify` ✅ **292/292** | Un `overflow-x-auto` ensancha el viewport de diseño de Chrome de Android con el ancho de su contenido **aunque lo recorte**, y todo lo `position: fixed` se dimensiona contra ese viewport: el modal medía 663 px en una pantalla de 393 y su botón primario caía fuera. **El síntoma señalaba a otro sitio** —«el `<label>` de *Stock mínimo* intercepta el clic»—, que era simplemente lo que había bajo las coordenadas. Tres candidatos descartados **midiendo**: `body{overflow:hidden}` no influye (el viewport ya estaba ensanchado sin modal), `html{overflow-x:hidden}` no cambia nada y quitar el `min-w-160` tampoco, porque el mínimo intrínseco de las celdas ya supera la pantalla. `desbordes.test.ts` falla si aparece un scroller sin `contain-paint`. |
| 2026-08-08 | **T2-42** Cancelar por interfaz una venta ya enviada — **completada** | 8 tests nuevos (`verify` frontend ✅ **290/290**) y el escenario E2E de la venta cancelada **hecho entero por la interfaz en `chromium`**: stock 20 → envío 17 → cancelación confirmada → **20** | La reposición de T0-03 llevaba cuatro días en el backend **sin camino desde la aplicación**. Se confirma el movimiento de stock, no el cambio de estado: la orden pendiente se sigue cancelando de un clic y la enviada abre un diálogo que dice cuántas unidades vuelven. El recuento **excluye los ítems sin `productId`**, porque el backend no los repone. Falsificado desactivando la condición de estado: caen 5 de los 8 tests, y los 3 que quedan son justo los que describen lo que no debía cambiar. **Hallazgo ajeno:** en `Mobile Chrome` el escenario no llega a la cancelación porque falla al crear el producto — reproducido con los cambios revertidos. |
| 2026-08-08 | **T2-11** Saltar al contenido principal — **completada** | 1×1 px sin foco, 218×44 al recibirlo. `verify` ✅ **282/282** (3 nuevos), E2E ✅ | Lo que se comprueba no es que el enlace exista: que sea el primero en el orden de tabulación y que activarlo deje el foco **dentro** de `<main>`. Sin `tabIndex={-1}` el navegador desplaza pero no mueve el foco, y el siguiente Tab devuelve al principio de la navegación — el fallo que convierte el enlace en decoración. |
| 2026-08-09 | **T2-46** Ítems de menú delimitados y separados — **completada** | Medido en el navegador: altura de ítem **42 px**, hueco entre ítems **4 px** (antes **0**). `verify` ✅ **380/380**, E2E ✅ | El borde nace transparente para que el texto no baile un píxel al señalar, y es `focus-visible` y no `focus` para que no se quede pegado tras un clic de ratón. La falta de separación **no existía antes de delimitarlos**: sin borde no hay nada que se solape. Se probó con 2 px, se midió y se subió a 4. Un solo helper para los tres desplegables, con tests que lo fijan: sin ellos el próximo panel nace pegado otra vez. |
| 2026-08-09 | **T2-47** La cabecera de productos no se parte — **completada** | A 1308 px: cabecera en **una línea** y «Nombre / SKU» de 125 → **335 px**. De diez filas solo envuelve la del nombre más largo, y con el nombre íntegro. `verify` ✅ **382/382** (2 nuevos) | `whitespace-nowrap` en el `<thead>`: `white-space` se hereda, así que cubre las nueve columnas y las futuras. **Las dos salidas evidentes se descartaron con motivo:** truncar el nombre lo inutiliza como identificador —dos productos con prefijo común quedan indistinguibles—, y ensanchar en general no toca la causa, porque con reparto automático un nombre más largo vuelve a quitarle sitio a otra columna. |
| 2026-08-09 | **T2-48** Volver arriba al cambiar de ruta — **completada** | Antes: desde 800 px en Reportes, Dashboard quedaba en **202 px** con el `<h1>` en **−113**. Después: **0** y título visible, sobre **15 rutas**. Retroceso comprobado: 600 → Dashboard → atrás → **600**. `verify` ✅ **386/386** (4 nuevos) | React Router no restablece el desplazamiento, y el `focus()` de T2-18 lo enmascaraba de la peor manera: al enfocar algo más alto que la ventana el navegador desplaza *lo mínimo*, alineando el **final** de `<main>` con el borde inferior. Los 202 px eran `scrollHeight 1091 − ventana 889`, no un capricho. De ahí `preventScroll`: un solo mecanismo decidiendo. **En `POP` no se toca**, o se borraría la posición que el usuario espera recuperar. El enlace de salto tenía el mismo defecto. |
| 2026-08-09 | **T2-01** 404 en JSON — **completada** | `verify` ✅ **280/280** (5 nuevos) y comprobado contra el servidor en marcha: `application/json` y `{"success":false,"message":"Ruta no encontrada: …"}`. Falsificado comentando el `app.use`: caen 4 de 5, y sobrevive el que describe lo que no debía cambiar | El estado ya era 404: lo roto era el formato, y por eso `health.test.ts` daba el caso por cubierto comprobando solo el estado. El middleware **lanza** en vez de formatear, para que el sobre se escriba en un único sitio y el 404 se registre con su `requestId`. **Un caso del test se cayó al probarlo de verdad:** `DELETE /api/v1/health` da 404 en jest pero 403 en el servidor real, porque el CSRF va antes del router y en tests se omite. |
| 2026-08-09 | **T2-33** Límite de cuerpo por ruta — **completada** | 1000 productos son **185.1 kB** y entran en **806 ms**; 1 MB en `/auth/login` da **413**. Falsificado quitando la excepción de ruta: la importación pasa de 201 a **413 en 8 ms**. `verify` ✅ **287/287** (7 nuevos) | El orden de los parsers decide cuál se aplica: `body-parser` marca la petición y el siguiente se abstiene, así que el específico va **antes** que el general. **Descubierto al comprobarlo: el 413 salía como 500**, porque el error de `body-parser` no es `HttpError` y el manejador lo tomaba por avería. Se ensancha para respetar `expose: true` (convención de `http-errors`), y estrecho a propósito: sin la marca vuelve a ser 500, y un 5xx ajeno tampoco se reenvía. |
| 2026-08-09 | **T2-32** Imágenes validadas por su firma — **completada** | Un ejecutable (`MZ…`) enviado como `image/jpeg` se rechaza con **422**; JPEG, PNG y WebP reales pasan. Falsificado confiando en la cabecera: caen 4 de 9. `verify` ✅ **296/296** (9 nuevos) | **No puede ir en `fileFilter`:** multer lo llama antes de leer el contenido, así que ahí solo existe la cabecera del cliente. Va después de `upload.single(...)`. Sin `file-type` a propósito: tres formatos, doce bytes, y la librería es ESM puro contra un proyecto CommonJS. WebP obliga a mirar dos trozos —`RIFF` y `WEBP` en el byte 8—, y hay un test con un WAV para que `RIFF` no baste. Un test recorre las rutas y exige la comprobación en toda línea con `upload.single(`. **Volvió a morder la trampa del mock:** cuatro suites dejaron de arrancar con «argument handler must be a function». |
| 2026-08-09 | **T2-08** Importación masiva agrupada — **completada** | 1000 productos: **806 → 271-414 ms**. Consultas de inserción: con 200 productos **396 → 2**; con 1000, **10**. `verify` ✅ **298/298** (2 nuevos) | Se agrupa con `createMany` en vez de bajar el lote a 10, que mantendría las 2000 consultas y solo las haría menos simultáneas. **La atribución de errores por fila se conserva** —lo que más fácil era perder— reintentando fila a fila si el lote falla; como `createMany` es una sentencia atómica, ese reintento no puede duplicar nada. El «antes» se midió **forzando la vía de reserva**, que es literalmente el algoritmo anterior. El caso de la fila mala costó un intento: un nombre de 300 caracteres lo rechaza Zod antes de llegar a la base; un precio de 100 000 000 pasa Zod y revienta contra `Decimal(10, 2)`. |
| 2026-08-09 | **T2-09** Índice de trigramas en la búsqueda — **completada** | Sobre 40 000 productos: término raro **24.914 → 0.346 ms** (663 → 33 buffers), inexistente **24.851 → 0.030 ms**, recuento **23.899 → 5.738 ms**. El plan pasa a `Bitmap Index Scan on products_name_idx`. `verify` ✅ **298/298** | **El caso que parecía el principal ya era rápido y no mejora**: con muchas coincidencias, la primera página se resuelve por el índice de `createdAt`. Lo que dolía era lo contrario — un término raro obliga a mirar la tabla entera para poder decir «no hay nada», que es lo que hace quien no encuentra un producto y prueba otra palabra. En usuarios se indexan nombre **y** correo, no solo el correo: con uno la otra mitad del `OR` seguiría recorriendo la tabla. Ahí no se nota nada y se dice: son cuatro filas. **Trampa nueva:** `db push` no ejecuta el SQL de las migraciones, así que `pg_trgm` hay que crearla a mano en `Stockly_test`. |
| 2026-08-09 | **T2-02** Agregados del dashboard en SQL — **completada** | Con 40 000 productos activos: **200.4 → 27.3 ms** de mediana y heap **178.9 → 32.8 MB**. `verify` ✅ **301/301** (3 nuevos), `reports.service.ts` sigue al **100 %** | La equivalencia se comprobó **comparando las dos respuestas completas** (capturada con `git stash`), no confiando en los tests: `totals` idéntico y el resto del informe byte a byte. Lo único que cambia es el orden de `stockByCategory`, y a mejor: antes lo daba el recorrido del `findMany` y dos cargas podían pintar el gráfico distinto. Los tres tests nuevos cubren los bordes fáciles de perder al traducir —«Sin categoría», orden, inactivos— y **dos de los tres fallan** contra la implementación anterior. |
| 2026-08-09 | **T2-05** Exportaciones en streaming — **completada** | 50 000 productos: **3.58 MB en 4.0 s**. Con el heap limitado a **48 MB**, la forma anterior muere con `Reached heap limit` y la nueva termina con **pico de 42.5 MB**. `verify` ✅ **308/308** (7 nuevos) | **El primer intento de medición se quedó corto:** sin restricción, el pico apenas bajaba (105.2 → 92.5 MB), porque `heapUsed` cuenta la basura no recogida. El tamaño de lote **es** el techo de memoria: con 48 MB, 500 y 1000 caben y 2000 y 5000 no. Se elige 500 sobre 1000 pese a ser un 25 % más lento, porque 1000 deja el pico a 2 MB del límite. **Cuesta más tiempo y se dice:** 832 ms → 4.0 s, el precio de no tener el archivo en memoria. El JSON también se transmite por partes, que la ficha no pedía y tenía el mismo problema. **El desempate del cursor no se pudo falsificar** y se documenta como garantía, no como fallo corregido. |
| 2026-08-09 | **T2-34** CSV con codificación correcta — **completada** | Contra el servidor real: `text/csv; charset=utf-8` y primeros bytes **`EF BB BF`**. La línea acentuada se lee «corrección»; en ANSI —lo que hacía Excel— «correcciÃ³n». `verify` backend ✅ **311/311**, frontend ✅ **389/389** (6 nuevos) | **El alcance real no era el de la ficha:** el `<a href>` que describe **no lo llamaba nadie**, así que el problema del 401 no era alcanzable; el de los acentos sí, y en las dos descargas que la interfaz sí usa. Se arregla el helper igualmente para que enchufarlo no reabra los tres defectos. La marca va en el CSV y no en el JSON, donde sería un error de sintaxis. **El primer test fallaba estando el código bien:** comprobaba `blob.text()`, y `TextDecoder` se come la marca; se cambió a mirar los bytes. El lint cazó el carácter crudo en los literales. |
| 2026-08-09 | **T2-06** Reducir el `vendor` del frontend — **completada con salvedad** | JavaScript del arranque **697.3 → 474.9 kB (−32 %)** y `vite build` ya no emite el aviso de tamaño. **Los 250 kB por trozo no se cumplen**: quedan `vendor` 331 kB y `vendor-charts` 391 kB. `verify` ✅ **389/389** | **Lo que pedía la ficha era contraproducente:** separar `vendor-react` sube el arranque a **956 kB** porque mete `vendor-charts` en la carga inicial —el grafo de trozos gana un ciclo entre React y quien lo importa—. Cuatro variantes construidas y comparadas para decidirlo. Lo que sí funciona es sacar recharts **y todo lo que existe solo por él** (redux-toolkit, immer, es-toolkit, victory-vendor, d3), que estaba en `vendor` y se descargaba siempre. Bajar `vendor-charts` de 250 kB exigiría partir recharts en trozos arbitrarios que siempre se cargan juntos, y no hace falta: no se descarga hasta entrar en Dashboard o Reportes. |
| 2026-08-09 | **T1-21** Contenedor sin privilegios — **verificada por ejecución** | `docker exec stockly_backend id` → **`uid=1000(node)`**. Las **10** migraciones se aplican al arrancar sin privilegios, incluida el `CREATE EXTENSION pg_trgm` de T2-09; comprobado en la base del contenedor que `products_name_idx` existe como `gin (name gin_trgm_ops)` | Quedaba pendiente desde el 2026-08-07 porque el motor de Docker no arrancaba en este equipo. La duda de fondo no era el `id` sino si `prisma migrate deploy` conservaría permiso de escritura como `node`: lo conserva. |
| 2026-08-09 | **T2-25** Sonda de disponibilidad — **completada** | Con la pila arriba, `/ready` → 200 y `backend (healthy)`. Tras `docker compose stop db`: **`/ready` → 503** y **`backend (unhealthy)`**. `verify` ✅ **314/314** (3 nuevos) | Dos sondas para dos preguntas: `/health` es vivacidad y **sigue devolviendo 200 con la base caída a propósito** —reiniciar el contenedor no arregla una base que no está—; `/ready` es la que decide si mandar tráfico. 503 y no 500, que es la distinción que usa un orquestador. El healthcheck usa `node` porque `node:alpine` no trae `curl`. |
| 2026-08-09 | **T2-27** Credenciales del compose fuera del archivo — **completada** | Las tres situaciones con `docker compose config`: desarrollo sin variables funciona; producción sin credenciales **aborta**; producción con credenciales resuelve y `db` **queda sin `ports`** | `ports: !reset []` y no una lista vacía: Compose **concatena** los `ports` de los archivos superpuestos, así que sin `!reset` el 5432 seguiría publicado en producción. La `DATABASE_URL` se compone de las mismas variables que la base, para no tener dos sitios donde cambiar la contraseña. |
| 2026-08-09 | **T2-28** Frontend contenedorizado — **completada** | `docker compose up -d --build` deja `db`, `backend` y `frontend` en pie, y **el login funciona en el navegador** contra `http://localhost:8080`; recargar en `/catalog/products` pinta las 10 filas y «48 productos en total» | nginx sirve la SPA **y hace de proxy de `/api`**, así que hay un solo origen: eso responde lo que la ficha mandaba documentar y permite `SameSite=Lax` en vez de `None`+`Secure`. **Defecto real encontrado al montarlo:** `NODE_ENV=production` forzaba `secure: true` y sobre HTTP el navegador descarta la cookie sin decir nada — el login parecía fallar por credenciales. Se añaden `COOKIE_SECURE`/`COOKIE_SAMESITE` con los valores actuales por defecto. `proxy_buffering off`, o el búfer de nginx desharía el streaming de T2-05. |
| 2026-08-09 | **T2-26** Reproducibilidad del build — **completada** | Dos `docker build --no-cache`: **310 paquetes, lista idéntica**; `node v22.23.2` y `pnpm 11.21.0` en las dos; y el compilado (108 archivos) con el **mismo md5**: `dc10fd00…` | **El comando de la ficha no sirve en esta imagen y por poco lo doy por bueno:** `pnpm list --depth=0` falla con `EACCES` sobre `/root/.local/share/pnpm` porque desde T1-21 el contenedor corre como `node`. Las dos imágenes devolvían lo mismo… **que era el mismo error**, y el `diff` limpio no demostraba nada. Se sustituye por el listado de `node_modules/.pnpm` y el md5 del compilado, que además comprueba que dos builds dan el mismo artefacto. |
| 2026-08-09 | **T2-31** Reuso de refresh tokens — **completada** | Se rota un token, se presenta el viejo → 401 **y el legítimo recién emitido también deja de servir**; en la base los dos hashes a `null` y una entrada `REFRESH_REUSE`. Falsificado quitando el guardado del hash gastado: cae el test del escenario y sobreviven los cuatro que describen lo que no debía cambiar. `verify` ✅ **319/319** (5 nuevos) | Lo que cambia no es el 401 —ya lo daba— sino lo de después. Se cierra la familia entera porque no hay forma de saber cuál de los dos tokens tiene el atacante. **Tres de los cinco tests son de falsos positivos**, que es donde esto se rompe: rotaciones encadenadas, token inventado y —el que obligó a tocar más código— presentar el viejo **tras un logout ordenado**, que no debe registrar anomalía. Se guarda un solo token anterior, no la familia: se dice. |
| 2026-08-09 | **T2-30** Swagger completo — **completada** | De 3 módulos a **14 etiquetas, 43 rutas y 67 operaciones**, las 67 del router real; `/api/v1/docs` responde 200. `verify` ✅ **333/333** (14 nuevos) | La garantía no es una lista a mano: el test **recorre el árbol de Express** y exige que cada operación esté documentada, y también que el spec no prometa rutas inexistentes. Los cuatro catálogos se generan con una función en vez de copiarse. **El test cazó un fallo recién introducido por mí:** el spread de las rutas nuevas sobrescribió `/products/{id}/movements` y borró su `GET` —sustituye la clave, no fusiona—, documentando menos que antes y en silencio. |
| 2026-08-09 | **T2-23** Cobertura de las zonas flojas — **completada** | `sale-orders.controller.ts` **69.44 → 86.11 %** (pide >75) y `upload.middleware.ts` **75.67 %** (pide >70). Global del backend **91.00 %**. `verify` ✅ **339/339** (6 nuevos) | Faltaban las tres rutas de solo lectura, las que nadie mira hasta que dejan de funcionar. El test del CSV comprueba que una orden de dos líneas produce **dos filas**: la diferencia entre contar órdenes y contar filas, que es lo que decide si el tope de T2-05 se queda corto. **`upload.middleware` llegó al umbral por otro camino** —T2-32— así que el test que proponía la ficha no habría medido nada nuevo. `nodemailer` se queda al 39 %: cubrirlo exige un SMTP falso y el criterio no lo pedía. |
| 2026-08-09 | **T2-24** Contrato frontend ↔ backend — **completada** | Falsificado como pedía el criterio: cambiar `value: false` por `"false"` en el mock compartido hace fallar **dos archivos al cargarse**. `verify` ✅ **395/395** (6 nuevos) | La validación corre **al importar**, no dentro de un `it`: así falla cualquier test que use un mock desalineado, sin depender de que alguien invoque el de contrato. **Costó un intento:** el primer esquema declaraba `value: boolean \| number \| string` y aceptaba `{ type: "boolean", value: "false" }`, o sea el mock exacto que ocultó T1-06. Un contrato que acepta el defecto que debe cazar no vale nada. |
| 2026-08-10 | **T3-01** Comentarios y mensajes en inglés — **completada** | Barrido sobre `src/` completo: cero comentarios y cero mensajes en inglés fuera de `src/generated/`. `verify` ✅ **357/357** | **Una de las cuatro ubicaciones estaba caducada:** `upload.middleware.ts:28` cambió con T2-32 y el mensaje vive ahora en la 105. Buscar por contenido encontró los mismos cuatro puntos, ni uno más. El cuarto no era un comentario sino un `Error("Upload failed")` que llega al usuario. |
| 2026-08-10 | **T3-02** Enums de rol y auditoría — **completada** | Criterio literal: un `INSERT` con `role='SUPERADMIN'` **por SQL crudo** lo rechaza la base. `verify` ✅ **357/357**, cobertura **91.33 %** (9 nuevos) | Migración escrita a mano con `USING`, como la de 2026-06-01: el diff automático de Prisma para `text`→enum borra la columna. **Destapó dos cosas que no estaban en la ficha:** los filtros aceptaban cualquier cadena (ahora 400, porque ignorarlos haría que `?role=admin` devolviera **todos** los usuarios), y un **500 alcanzable desde la URL** — la guarda `status in $Enums…` daba verdadero para `toString`, porque los enums generados heredan de `Object.prototype`. |
| 2026-08-10 | **T3-13** Rutas del sistema en errores — **completada** | 3 de 6 tests fallaban antes del cambio, uno a través de una petición completa. `verify` ✅ **357/357** | **La fuga se reprodujo, no se supuso:** el 500 de T3-02 devolvía `C:\Users\…\sale-orders.service.ts:32:30` en el cuerpo. Se sanea **siempre**, no solo con `NODE_ENV` bien puesto: una garantía que depende de recordar una variable en staging no es una garantía. El log conserva el error entero; el `requestId` de T2-10 une los dos. |
| 2026-08-10 | **T3-05** Cabeceras CSV entre repos — **completada** | Las mismas **once columnas en el mismo orden**, fijadas como la misma cadena literal en un test de cada repositorio. `verify` ✅ **409/409** y ✅ **357/357** | **El enunciado no era exacto:** el botón de la interfaz no tiene dos rutas, siempre arma el CSV en el navegador; quien daba once columnas era la API. Los tres campos ya venían en la respuesta y el frontend los tiraba porque el tipo no los declaraba. `price` estaba mal tipado —llega como cadena, es `Decimal`—, comprobado sobre la respuesta real. |
| 2026-08-10 | **T3-08** Iconos decorativos — **completada** | 8 tests nuevos sobre el **DOM renderizado**. `verify` ✅ **409/409** | **La premisa de la ficha era falsa:** Heroicons v2 ya emite `aria-hidden` en sus 24 usos, así que el criterio se cumplía solo. Los tests fijan una garantía que hoy da una dependencia externa. **El fallo real es el contrario:** los botones de acción no estaban mudos —`title` cuenta como nombre accesible, medido antes de tocar nada— pero repetían el mismo nombre en todas las filas. Ahora nombran el producto. |
| 2026-08-10 | **T3-14** Radios y elevación — **completada** | Medido por `grep`: cero radios fuera de la convención (39/32/13) y las **once sombras** son los dos tokens (7 `raised`, 4 `overlay`). `verify` ✅ **409/409** | **Los tokens existían desde T2-35 y no los usaba nadie:** su única aparición era el test que comprueba que están definidos. La guarda recorre `src/` como la de colores crudos de T2-37, y está **falsificada** con un archivo infractor. Mis propios comentarios contaminaban el recuento por `grep` al nombrar las clases prohibidas; están reescritos. |
| 2026-08-10 | **T3-04** Navegación sin aritmética de índices — **completada** | Orden intacto en escritorio y móvil, ahora fijado por 5 tests. `verify` ✅ **419/419** | El orden no estaba en ningún sitio: había que leer `slice(0, 1)` y `slice(1)` a la vez para reconstruirlo. Ahora el array **es** el orden. Se movieron al array `catalogActive`/`ordersActive` y la condición de administrador. **Nada comprobaba el orden hasta ahora**, que es lo que hacía arriesgado el refactor. |
| 2026-08-10 | **T3-09** Botón flotante sobre la paginación — **completada** | Verificado **en navegador**: antes, `elementFromPoint` en el centro de «Anterior» y «Siguiente» devolvía «Movimiento manual»; después, devuelve cada botón. `verify` ✅ **419/419** | **Peor de lo que decía la ficha: los botones no se podían pulsar**, no es que se vieran mal. Y **no es un problema de móvil**: pasa igual a 1280×800, porque lo que junta a los dos elementos no es el ancho sino que ambos viven abajo a la derecha. El hueco solo se reserva cuando el botón existe. jsdom no calcula diseño, así que los tests fijan la decisión, no la geometría. |
| 2026-08-10 | **T3-12** No indexar la aplicación — **completada** | Criterio literal contra el build: `GET /robots.txt` → **200 text/plain**; una ruta de la SPA → **200 text/html**. `verify` ✅ **419/419** | Se añade además `noindex` en el `index.html`, y **no es redundante**: `Disallow` prohíbe rastrear, no indexar — un buscador con un enlace puede listar la URL igualmente, porque no puede entrar a ver que no debe. Cada uno cubre el hueco del otro, y ambos archivos lo explican para que nadie borre uno por parecer duplicado. |
| 2026-08-10 | **T3-15** Sistema de diseño documentado — **completada** | `Stockly-F/docs/design-system.md`, enlazado desde el README. `verify` ✅ **419/419** | **Cada sección dice qué test la vigila:** la mitad de las reglas no dependen de que alguien lea el documento, porque incumplirlas hace fallar `verify`. Lo que aporta sobre los tests es el **porqué**. Termina con una receta de página nueva, que es la forma de comprobar el criterio. Corregido de paso el README, que seguía listando las variantes de `Badge` que T2-36 retiró. |
| 2026-08-10 | **T3-03** Convención de exportación — **completada** | Los **doce** controladores y los doce servicios exportan objeto. `verify` ✅ **362/362** (5 nuevos) | **No era solo `products`, eran cinco**: `audit-logs`, `products`, `purchase-orders`, `reports` y `sale-orders`. Hay tensión con la ficha —«no justifica un cambio masivo aislado»— y se resuelve a favor del criterio, con una transformación mecánica y comprobada. Lo que gana no es estética: `product.routes.ts` importaba trece nombres sueltos. Guarda **falsificada** añadiendo un `export function` a `tags`. |
| 2026-08-10 | **T3-06** `.agents/` en el control de versiones — **completada** | Decisión del propietario: **se comparten a propósito** (varias máquinas). Criterio cumplido: `git grep -il z.object` da 61 archivos, `git buscar-archivos` da **8**, todos en `src/` | La ficha se quedaba corta: `.claude/` también está rastreado y pesa más — **458 de 657 archivos** en el frontend. Ruido medido antes de atacarlo: 53 de 59 aciertos eran documentación. **`.gitattributes` con `-diff` se probó y no sirve** (git los trata como binarios, los sigue listando y rompe el diff de un cambio legítimo); lo que sí aporta es `linguist-vendored`. |
| 2026-08-10 | **T3-11** Decisiones de arquitectura — **completada** | **Cinco** ADRs en `docs/adr/` con índice; las cuatro pedidas más una | Escritas leyendo el código, citando archivo. El apartado de consecuencias recoge lo que muerde al mantener: que `clearCookie` sin repetir el `path` **no borra nada**, que un token perdido solo se regenera. **La quinta no estaba en la ficha y es la que más falta hacía —«sin CI»—**: una ausencia no deja archivo que la explique, y quien vea 781 tests sin pipeline lo leerá como descuido. |
| 2026-08-10 | **T4-03** Modo oscuro — **completada** | Emulando la preferencia del sistema en las dos direcciones sobre la aplicación en marcha: dashboard, reportes, catálogo y un modal. Tokens resueltos en vivo (`--color-surface` → `#151d2c`) y **cero clases `dark:`**. `verify` ✅ **448/448**, E2E ✅ | **La ficha acertaba:** con la capa de tokens de T2-35–T2-37 ya montada, esto es redefinir la capa semántica y nada más. **La inversión de los rellenos salió gratis** porque los botones usan `text-surface` y no `text-white`, que no aparece ni una vez en `src/`. **No es la paleta invertida:** los estados se aclaran y desaturan, medido antes de escribirlo (19 de 20 pares a la primera), y el borde se calibró contra el claro —1.23:1— en vez de contra un número inventado. **Dos defectos propios encontrados midiendo:** las sombras **no se pueden redefinir por token** —Tailwind incrusta el literal, mi test lo daba por bueno y el modal seguía en `rgba(15,23,42,0.12)`— y el `body` no pintaba fondo. Los ~40 hexadecimales de los gráficos, que ninguna guardia veía, salen ya de tokens. |
| 2026-08-10 | **T4-02** OpenAPI derivado de Zod — **completada** | Contra el servidor en marcha: `/api/v1/docs` → **200** y el spec servido trae los **23 esquemas** generados, con las 43 rutas y 67 operaciones de T2-30 intactas. `verify` ✅ **402/402** | **La dependencia de la ficha no hacía falta:** Zod 4.4 trae `z.toJSONSchema()` con `target: "openapi-3.0"` nativo, el dialecto exacto del spec. Comprobado antes de escribir: convierten los 9 validadores y los 36 esquemas del contrato. **Peticiones con `io: "input"`**, o el spec diría que `price` solo admite números cuando el validador coerce la cadena de un formulario. **Destapó `/settings` mal documentado en las dos direcciones** —un mapa de cadenas donde hay un array de ajustes tipados—, `/reports` con cuatro listas como `items: {}` y `/products/export` sin esquema. Falsificación clave: hacer obligatorio el SKU en el validador cambia el `required` del spec **solo**. |
| 2026-08-10 | **T4-01** Contrato compartido entre repositorios — **completada** | El criterio, medido: conectar el contrato produjo **12 errores de compilación** en el frontend (4 de producción, 8 de mocks) donde antes no había ninguno. `verify` ✅ backend **392/392** y frontend **421/421** | **La ficha pedía un paquete del workspace pnpm y eso no puede existir**: son dos repos git independientes con la carpeta madre sin versionar. Se copia desde una fuente única, con las tres alternativas descartadas por coste real ([ADR 0006](adr/0006-contrato-copiado-entre-repositorios.md)). **Los tipos ya mentían:** `price` y los tres `unitPrice` decían `number` y llegan como cadena, sostenidos por dos `Number()` y un `z.coerce`. **`SettingEntry.value` seguía siendo la unión laxa que T2-24 rechazó por escrito** — endureció su espejo pero no el tipo de producción. Tres guardianes, los tres falsificados: 8 caídas, 1 y 1. |
| 2026-08-11 | **T4-04** Internacionalización — **completada** | Medido con la misma regla a los dos lados: **289 textos a mano en 47 archivos → 0**. `verify` backend ✅ **402/402** (91.96 %) y frontend ✅ **493/493 + 1 omitido** (53.14 %), E2E ✅ | **Sin `i18next`:** lo que la librería resuelve —variantes regionales, espacios de nombres, seis formas de plural, detección por cabecera— este proyecto no lo tiene, y `Intl.PluralRules` ya viene en el navegador ([ADR 0007](adr/0007-i18n-propio.md)). **El compilador ya vigilaba el catálogo; lo que faltaba era vigilar las pantallas**, porque nada impedía escribir `<h1>Productos</h1>` en una nueva: compila, se ve bien en español y está roto en inglés. `literales.test.ts` lo detecta, está falsificado con cuatro casos y comprueba que la lista de archivos no se vacíe —el defecto que T4-02 encontró en su propio guardián—. **Destapó dos avisos que llevaban meses sin traducir y que ninguna revisión visual habría visto**: el 429 de `axios.ts` y los de `useSettings`. **Componer frases con el nombre de la entidad no sobrevive a un idioma más:** `Nueva ${entityLabel}` ya cojeaba en español —el artículo concuerda en género— y en inglés el adjetivo va delante. **Lo que no se traduce está razonado:** exportaciones y motivos de movimiento son datos, no pantalla, y los importes agrupan igual en los dos idiomas; las fechas sí, y por eso existe `shared/lib/fechas.ts`. Quedan dos salvedades anotadas: los mensajes por campo de un 422 y los correos (**T4-12**). |
| 2026-08-10 | **T3-10** CHANGELOG y guía de contribución — **completada** | Ambos en la raíz de `Stockly-B`, más un `CONTRIBUTING.md` corto en `Stockly-F` que apunta al canónico. Enlaces relativos comprobados | **La ficha pedía documentar `pnpm lint`, y el backend no lo tiene**: se documenta `pnpm verify`, la puerta real, con las asimetrías escritas. El CHANGELOG **no inventa versiones** —no hay etiquetas y los `package.json` ni coinciden—, así que todo va bajo «Sin publicar». La convención de commits se documenta como objetivo y se dice el dato: 35 de 41 commits convencionales son `feat`. |

### Resumen por Tier

| Tier | Completadas | Total | % |
|---|---:|---:|---:|
| **Tier 0** | **8** | **8** | **100 %** ✅ |
| **Tier 1** | **26** | **26** | **100 %** ✅ |
| **Tier 2** | **48** | **48** | **100 %** ✅ |
| **Tier 3** | **15** | **15** | **100 %** ✅ |
| Tier 4 | **5** | 12 | 42 % |
| **Total** | **102** | **109** | **94 %** |

*El denominador creció cuatro veces con tareas que no venían de la auditoría —cuatro el 2026-08-08 (T2-42 a T2-45), tres el 2026-08-09 (T2-46 a T2-48), una el 2026-08-10 (T4-11) y una el 2026-08-11 (T4-12)—, así que el 94 % de arriba es sobre 109, no sobre las 100 originales.*

***Los cuatro tiers de trabajo están cerrados.** Del Tier 4 —que la auditoría dejó fuera del alcance inmediato a propósito— se abordaron **T4-01**, **T4-02** y **T4-03** el 2026-08-10, ese mismo día se añadió y cerró **T4-11**, y el 2026-08-11 se cerraron **T4-04**, la internacionalización, **T4-05**, la copia de seguridad, y **T4-06**, monitorización y alertas. Las 6 restantes siguen fuera de alcance, y dos de ellas no vienen de la auditoría sino de los cierres anteriores: **T4-12**, los correos, que anotó el de T4-04, y **T4-13**, la discrepancia de versión de PostgreSQL que destapó el ensayo de restauración de T4-05.*

*T3-07 (limpiar artefactos antes de compilar) se resolvió como efecto colateral de T0-01.*

### Métricas

| Métrica | Inicial (auditoría) | Actual (2026-08-11) | Objetivo |
|---|---|---|---|
| Tests backend | 198/198 ✅ | **414/414** ✅ | mantener en verde |
| Cobertura backend (sentencias) | 86.92 % | **91.83 %** ✅ *(suelo en 85 %, T2-22)* | ≥ 88 % |
| Tests frontend | 181/181 ✅ | **494/494** ✅ *(+1 omitido: la frescura del contrato sin el repo hermano)* | mantener en verde |
| Cobertura frontend (sentencias) | 19.88 % | **53.14 %** ✅ *(suelo subido a 45 % con T4-01)* | ≥ 45 % — **alcanzado** |
| Idiomas de la interfaz | 1 *(español incrustado en los componentes)* | **2** ✅ *(español e inglés, con «auto» siguiendo al navegador, T4-04)* | 2 |
| Textos de interfaz escritos a mano | 289 en 47 archivos *(medido con la guardia sobre el árbol anterior)* | **0** ✅ *(`literales.test.ts` los vigila)* | 0 |
| Errores de la API con código estable | 0 *(solo `message`, siempre en español)* | **42 códigos** ✅ *(el cliente compone la frase en su idioma, T4-04)* | que ningún mensaje de error dependa del idioma del servidor |
| Tipos de respuesta declarados por duplicado | 12 módulos, dos copias a mano | **0** ✅ *(fuente única + copia generada, T4-01)* | una sola fuente de verdad |
| Divergencias de contrato que el compilador ve | 0 *(el tipo mentía y nada lo señalaba)* | **12 detectadas y corregidas** ✅ | que una divergencia no compile |
| Esquemas del spec escritos a mano | 14 *(~180 líneas de objeto literal)* | **0** ✅ *(23 derivados; solo `ProductWrite.image` es manual, T4-02)* | que la documentación se derive de la validación |
| Estados que se comunican solo por color | 3 conjuntos *(stock, orden, movimiento)* | **0** ✅ | 0 (WCAG 1.4.1) |
| Listados de la API sin paginar | 1 *(órdenes de compra)* | **0** ✅ | 0 |
| E2E (Playwright) | 2 escenarios, arranque manual | **10 en 2 proyectos, `pnpm test:e2e:full` sin pasos previos** — 9 pasados y 1 omitido, en verde en `chromium` **y** `Mobile Chrome` ✅ | escenarios que crucen la frontera |
| Flujos de venta alcanzables desde la interfaz | cancelar una orden **enviada**, no | **sí** ✅ *(T2-42)* | ninguna corrección del backend inalcanzable desde la UI |
| Variables de entorno obligatorias | 12 | **4** ✅ | solo las imprescindibles |
| Tiempo hasta enterarse de un pico de 5xx | *nunca: lo reportaba un usuario* | **inmediato** ✅ *(alerta en proceso al 5.º error; ~8 min y medio la de Prometheus, medido con `promtool`, T4-06)* | antes que el usuario |
| Métricas expuestas por el servicio | 0 | **3 propias + las del proceso** ✅ *(peticiones, duración, 5xx, bucle de eventos, montón, GC)* | que un incidente se pueda reconstruir |
| Reglas de alerta probadas | 0 *(no había reglas)* | **5 escritas, 2 con prueba unitaria** ✅ *(`promtool test rules`)* | que ninguna regla llegue sin ejecutarse antes |
| Copias de seguridad de la base | 0 *(ni procedimiento ni archivo)* | **`pnpm db:backup`, retención de 14 días y mínimo 3 copias** ✅ *(T4-05)* | una copia diaria automática |
| Restauraciones probadas | 0 *(nunca se había intentado)* | **1** ✅ *(2026-08-11: 31 MB restaurados en 0.3 s, `/ready` 200 contra la copia)* | una al mes, con su fila en el registro |
| Consultas extra a BD por mutación (email del actor) | 1 | **0** ✅ | 0 |
| Índices no-únicos en el esquema | 0 | **19** ✅ *(T2-43 los del orden por `createdAt`; T2-09 los GIN de trigramas)* | cubrir FK, ordenaciones y búsqueda |
| Histórico de un producto (40 000 movimientos) | `Seq Scan`, 5.709 ms | **`Bitmap Index Scan`, 0.747 ms** ✅ | `Index Scan` |
| CSS de la aplicación (build) | 78.40 kB · gzip 13.55 | **68.40 kB · gzip 12.14** ✅ | bajar con la escala y los subconjuntos |
| Archivos de fuente emitidos | 56 *(7 subconjuntos × 4 pesos × 2 formatos)* | **8** ✅ | solo el subconjunto latino |
| `pnpm lint` (frontend) | ❌ 26 errores, 4 avisos | ✅ **0 errores, 0 avisos** | ✅ 0 errores |
| Conflictos de merge sin resolver en el árbol | 1 *(no detectado en la auditoría)* | **0** ✅ | 0 |
| `pnpm check` (ambos) | ✅ sin errores | ✅ sin errores | mantener |
| `node dist/server.js` | ❌ MODULE_NOT_FOUND | ✅ **arranca** | ✅ arranca |
| `docker compose build backend` | ❌ falla en el primer `pnpm install` | ✅ **imagen construida** | ✅ imagen construida |
| `docker compose up --build` | ❌ no alcanzable | ✅ **health 200** | ✅ health 200 |
| Chunk `vendor` (sin comprimir) | 549.93 kB | 549.93 kB | < 250 kB |
| Guiones `verify` locales | 0 | **2 en verde** ✅ *(backend y frontend, exit 0)* | 2 en verde |
| Tokens semánticos en `@theme` | 1 (`--font-sans`) | **30** ✅ *(17 colores de interfaz, 9 de gráfico, 2 sombras, easing y tipografía)* | capa completa (T2-35) |
| Utilidades de color crudas en `src/**/*.tsx` | 561 (41 de 57 archivos) | **0** ✅ *(con test que lo vigila)* | 0 fuera de excepciones |
| Variantes de `Badge` sin significado | 4 de 7 | **0 de 5** ✅ | 0 |
| Temas con contraste AA verificado | 1 *(solo claro)* | **2** ✅ *(claro y oscuro, recalculados por test, T4-03)* | 2 |
| Paletas que hay que mantener a la vez | 2 *(un bloque claro y otro bajo media query, T4-03)* | **1** ✅ *(un `light-dark()` por token, T4-11)* | 1 |
| Temas que el usuario puede elegir | 0 *(solo la preferencia del sistema)* | **3** ✅ *(auto, claro y oscuro, T4-11)* | 3 |
| Clases `dark:` | 0 | **0** ✅ *(el modo oscuro es capa semántica, no clases)* | 0 |
| Hexadecimales en los gráficos | 40 *(que ningún test veía)* | **0** ✅ *(tokens + guardia propia, T4-03)* | 0 |

### Hallazgos nuevos del 2026-08-07/08 (no estaban en la auditoría)

Salieron al cerrar el Tier 1 y las primeras tareas del Tier 2. Los tres primeros se corrigieron
sobre la marcha, dentro de la tarea que los destapó; los tres siguientes **tienen desde el
2026-08-08 ficha propia** en el Tier 2 (T2-42, T2-43 y T2-44), porque ninguno cabía en el alcance
de la tarea que los encontró. El último apareció al verificar T2-42, se diagnosticó ese mismo día
y se cerró como T2-45. **Los siete están hoy corregidos.**

| Hallazgo | Estado |
|---|---|
| El modal no tenía scroll propio: un formulario más alto que la ventana dejaba sus botones fuera de pantalla e **inalcanzables** (el body está bloqueado mientras está abierto). Lo destapó el E2E al no poder pulsar «Crear producto» | ✅ corregido (`Modal.tsx`, `max-h` + `overflow-y-auto`) |
| `Input` y `Select` solo ataban la etiqueta al campo si se les pasaba `id`. Sin él, `htmlFor` quedaba vacío: campos rotulados a la vista, **sin nombre accesible** (los ítems de las órdenes, entre otros) | ✅ corregido (`useId` como respaldo) |
| El rate limit global (100 peticiones / 15 min por IP) se agota en una sola pasada del navegador; devolvía 429 en pruebas ajenas al tema | ✅ configurable con `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX`, sin bajar el techo por defecto |
| **La interfaz no permite cancelar una orden de venta ya enviada**: los botones solo aparecen en estado PENDIENTE. La reposición de stock de T0-03 existe en el backend pero es inalcanzable desde la aplicación | ✅ **[T2-42]** |
| `products` no tiene índice por `createdAt` pese a que **todos** los listados ordenan por ese campo; la lista de índices de la auditoría no lo contemplaba. `products_isActive_idx` sí se creó pero el planificador no lo usa (filtro poco selectivo) | ✅ **[T2-43]** |
| **En `Mobile Chrome` no se puede crear un producto:** al pulsar «Crear producto» (y antes, un conmutador de etiqueta) el clic lo intercepta el `<label>` de «Stock mínimo (alerta)», con reintentos hasta agotar el tiempo. Tumba los dos escenarios de `flows.spec.ts` que pasan por el formulario. Visto al verificar T2-42 y **reproducido con esos cambios revertidos** (`git stash`, misma máquina, Chrome Headless Shell 149): no es una regresión de esa tarea. **Diagnosticado el mismo día:** no era del modal ni del formulario, sino de la tabla de productos, que ensancha el viewport de diseño de Chrome móvil y con él todo lo `position: fixed`. El `<label>` que aparecía en el mensaje era solo lo que había en las coordenadas donde Playwright pulsaba | ✅ **[T2-45]** |
| En la tabla «Top por valor» de reportes conviven dos formatos de importe: «Precio unit.» sale de `toFixed(2)` y se ve como `$14999.00`, sin separador de miles, mientras «Valor total» usa `toLocaleString` y sí lo lleva. Visto al alinear las columnas en T2-39; es formato, no alineación, así que quedó fuera de esa tarea | ✅ **[T2-44]** |

### Línea base de navegador (2026-07-15)

Única medición sobre la aplicación en marcha. Se tomó con el servidor de desarrollo (sin minificar), por lo que en producción cabe esperar mejores cifras. Es el «antes» contra el que debe compararse T4-09; la auditoría del 2026-08-04 fue estática y no volvió a medir.

| Métrica | 2026-07-15 | Objetivo (T4-09) |
|---|---|---|
| Lighthouse — Accesibilidad | 96 *(fallo: contraste de color, ya corregido)* | ≥ 95 sobre build de producción |
| Lighthouse — Buenas prácticas | 100 | mantener |
| Lighthouse — SEO | 82 *(faltaban `lang` y meta description, ya corregidos)* | reevaluar tras T3-12 |
| LCP (dashboard, dev) | 556 ms | medir sobre build de producción |
| CLS | 0.02 | < 0.1 |
| Errores de consola | ninguno | ninguno |
