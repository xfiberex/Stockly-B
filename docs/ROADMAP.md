# ROADMAP — Stockly

Plan de implementación derivado de [INFORME-AUDITORIA.md](INFORME-AUDITORIA.md) (2026-08-04), ampliado el 2026-08-05 con la consultoría de estilo UX/UI (tareas `T2-35`–`T2-41`, `T3-14`, `T3-15`, `T4-10`).
Cada tarea es independiente, marcable y referenciable desde commits e issues por su ID (`T{tier}-{nº}`).

> **Convención de commits:** `fix(T0-01): resolver alias de rutas en el build de producción`

---

## Índice

| Tier | Descripción | Tareas | Esfuerzo bajo / medio / alto |
|---|---|---:|---|
| **Tier 0** | Crítico / bloqueante — despliegue roto, corrupción de inventario, credencial expuesta | 8 | 5 / 3 / 0 |
| **Tier 1** | Alta prioridad — funcionalidades rotas, verificación local, autorización, accesibilidad grave | 26 | 23 / 3 / 0 |
| **Tier 2** | Mejoras sustanciales — rendimiento, accesibilidad, sistema de diseño, cobertura, infra, documentación | 41 | 28 / 13 / 0 |
| **Tier 3** | Pulido y mantenimiento | 15 | 15 / 0 / 0 |
| **Tier 4** | Futuro / opcional — fuera del alcance inmediato | 10 | 0 / 5 / 5 |
| | **Total** | **100** | **71 / 24 / 5** |

**Ruta crítica sugerida:** `T0-01 → T0-02 → T0-03/04 → T0-05 → T1-01/T1-02 (verificación local)` y, en paralelo desde el primer día, todos los quick wins sin dependencias de Tier 1.

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

- [ ] **[T1-02] Guion de verificación local del frontend**
  - **Área:** QA / DevOps
  - **Ubicación:** `Stockly-F/package.json` (script `verify`)
  - **Qué hacer:** Encadenar `pnpm install --frozen-lockfile`, `pnpm check` (`tsc -b`), `pnpm lint`, `pnpm test:coverage` y `pnpm build`. Dos añadidos que el repositorio necesitaba y que ya están hechos:
    1. **No existía script `check`.** A diferencia del backend, `Stockly-F/package.json` no lo declaraba pese a que este roadmap lo da por hecho. Añadido `"check": "tsc -b"` — no emite, porque `tsconfig.app.json` tiene `noEmit: true`.
    2. **No existía campo `packageManager`.** Sin él, `--frozen-lockfile` deja de ser reproducible entre máquinas. Fijado a `pnpm@11.2.2`, el mismo que el backend.
  - **Criterio de aceptación:** `pnpm verify` pasa entero y falla ante errores de lint, tipos o tests.
  - **Verificado localmente (2026-08-07):** el script existe y encadena bien. `check` ✅ · `test:coverage` ✅ **181/181, 19.88 %** · `build` ✅. **`pnpm lint` ❌ — 26 errores y 4 avisos, que es exactamente T1-09.** El guion es correcto; el repositorio todavía no, y por eso `verify` se detiene en el lint. Se deja **sin marcar** hasta cerrar T1-09.
    Dos cosas que el primer `verify` real destapó:
    - **Un conflicto de merge sin resolver commiteado** en `e2e/smoke.spec.ts:3-12` desde el merge `4254582` (2026-08-05), que reintroducía la credencial `Ad159753` purgada por T0-06. Elevaba el lint a 27 errores. Resuelto a favor del lado del seed; el recuento vuelve a los 26 de la auditoría.
    - **ESLint analiza `coverage/`**, que son artefactos generados. De ahí salen 3 de los 4 avisos. Añadirlo a los `ignores` de `eslint.config.js` es parte de T1-09.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-09

### Etiquetas de producto (funcionalidad rota)

- [ ] **[T1-03] Declarar `tagIds` en los esquemas de validación de producto**
  - **Área:** Arquitectura / funcionalidad
  - **Ubicación:** `Stockly-B/src/modules/products/product.validator.ts:26-49`
  - **Qué hacer:** Ni `createProductSchema` ni `updateProductSchema` declaran `tagIds`; Zod descarta las claves desconocidas y `validate.middleware.ts:20` reemplaza `req.body` con el resultado parseado, por lo que el servicio nunca las recibe. Añadir un campo `tagIds` con `preprocess` que normalice a array (multipart envía un string cuando hay un solo valor) y valide UUIDs.
  - **Criterio de aceptación:** `POST /api/v1/products` con `tagIds` en el `FormData` crea el producto con las etiquetas asociadas. Verificado hoy: 201 con 0 etiquetas asignadas.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-04] Tests de asignación de etiquetas a productos**
  - **Área:** QA
  - **Ubicación:** `Stockly-B/src/tests/products.test.ts`
  - **Qué hacer:** Crear un producto con una etiqueta y verificar la relación persistida; actualizar un producto sustituyendo el conjunto de etiquetas (`set`); enviar un `tagIds` con un UUID inválido y esperar 422; filtrar el catálogo por `?tagId=` y comprobar que devuelve el producto.
  - **Criterio de aceptación:** los 4 tests pasan y fallan si se revierte T1-03.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-03

### Configuración de la aplicación (funcionalidad rota)

- [ ] **[T1-05] Alinear el payload de `PATCH /settings` con el contrato del backend**
  - **Área:** Arquitectura / funcionalidad
  - **Ubicación:** `Stockly-F/src/modules/settings/api/settings.api.ts:11`
  - **Qué hacer:** El frontend envía `{ updates: {...} }` y el backend espera el objeto plano (`settings.controller.ts:14` → `Object.entries(req.body)`), por lo que la clave `updates` se descarta por no estar en el catálogo y no se persiste nada. Enviar el objeto plano: `api.patch("/settings", updates)`.
  - **Criterio de aceptación:** guardar el interruptor de alertas desde la UI escribe la fila en `app_settings`. Verificado hoy: HTTP 200, `data: []`, cero filas persistidas.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-06] Corregir el tipo de `SettingEntry.value` en el frontend**
  - **Área:** Arquitectura / funcionalidad
  - **Ubicación:** `Stockly-F/src/modules/settings/types/settings.types.ts:8`, `SettingsPage.tsx:8`
  - **Qué hacer:** El backend devuelve `value` ya parseado (boolean para los ajustes de tipo `boolean`), pero el frontend lo tipa como `string` y compara `entry.value === "true"`, por lo que el interruptor siempre se pinta apagado y `isDirty` siempre da verdadero. Cambiar el tipo a `boolean | string | number` y normalizar la comparación.
  - **Criterio de aceptación:** con `lowStockAlertEnabled` en `true` en base de datos, la página muestra el interruptor encendido y el botón «Guardar cambios» aparece deshabilitado hasta que haya un cambio real.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-05

- [ ] **[T1-07] Añadir validación Zod al endpoint de configuración**
  - **Área:** Código / Seguridad
  - **Ubicación:** `Stockly-B/src/modules/settings/settings.routes.ts:10`
  - **Qué hacer:** Es el único endpoint mutante sin `validate()`. Un cuerpo `null` provoca un `TypeError` (500) en `Object.entries`, y una forma incorrecta devuelve 200 sin efecto — que es exactamente cómo pasó desapercibido T1-05. Generar el esquema desde `SETTINGS_CATALOG` y aplicarlo con `.strict()`.
  - **Criterio de aceptación:** `PATCH /settings` con `{updates:{...}}` o con un cuerpo no-objeto devuelve 422; con la forma correcta devuelve 200 y persiste.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-08] Eliminar el efecto de sincronización de `SettingsPage`**
  - **Área:** UI/UX / Código
  - **Ubicación:** `Stockly-F/src/modules/settings/components/SettingsPage.tsx:28-34`
  - **Qué hacer:** ESLint marca `setState` síncrono dentro de un efecto. La dependencia `settings` proviene de `data ?? []`, que crea un array nuevo en cada render mientras la consulta carga, provocando renders en cascada. Derivar el estado en lugar de sincronizarlo: mantener solo un `overrides` de los valores modificados y calcular el valor mostrado y el `isDirty` en render.
  - **Criterio de aceptación:** `pnpm lint` no reporta el error en este archivo; la página no encadena renders durante la carga (verificar con React DevTools Profiler); los tests existentes de `SettingsPage` siguen pasando.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-06

### Calidad estática

- [ ] **[T1-09] Dejar `pnpm lint` en verde**
  - **Área:** QA
  - **Ubicación:** `Stockly-F/eslint.config.js`
  - **Qué hacer:** 26 errores y 4 avisos. Desactivar `react-refresh/only-export-components` para `src/routes/**` (23 falsos positivos por los `lazy()`), eliminar las 3 directivas `eslint-disable` inútiles, y resolver los 3 errores reales de `react-hooks` (T1-08 y T1-10). Evaluar el aviso de React Compiler en `TagsPage.tsx:37` (`watch("color")` provoca el bailout del componente).
  - **Criterio de aceptación:** `pnpm lint` termina con código de salida 0.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-08, T1-10

- [ ] **[T1-10] Corregir el `setState` en efecto de `App.tsx` y `ProductForm.tsx`**
  - **Área:** Código
  - **Ubicación:** `Stockly-F/src/App.tsx:180-182`, `Stockly-F/src/modules/products/components/ProductForm.tsx:91-109`
  - **Qué hacer:** En `App.tsx`, el cierre del menú móvil al cambiar de ruta puede resolverse con una `key` en el contenedor o comprobando el estado previo antes de actualizar. En `ProductForm.tsx`, el `setSelectedTagIds` dentro del efecto de `reset` puede derivarse de `product` (el componente ya se remonta por `key` desde `ProductsPage:255`).
  - **Criterio de aceptación:** ESLint no reporta `react-hooks` en ninguno de los dos archivos; el menú móvil sigue cerrándose al navegar y el formulario sigue precargando las etiquetas al editar.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Autenticación y autorización

- [ ] **[T1-11] Comprobar `isActive` en `requireAuth`**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/middlewares/auth.middleware.ts:14-17`
  - **Qué hacer:** El middleware solo selecciona `id` y `role`, por lo que un usuario desactivado conserva acceso durante toda la vida de su access token (15 min). Añadir `isActive` al `select` y devolver 403 si es falso. Aprovechar el mismo cambio para incluir `email` (ver T1-13).
  - **Criterio de aceptación:** desactivar un usuario desde el panel de administración invalida inmediatamente sus peticiones (403), sin esperar a que expire el token.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-12] Comprobar `isActive` también en el endpoint de refresh**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/modules/auth/auth.service.ts:84-102`
  - **Qué hacer:** Defensa en profundidad: `refresh` no valida `isActive` ni `isVerified`. Aunque `setActive(false)` ya anula el refresh token (`users.service.ts:63-68`), la comprobación explícita cubre cualquier ruta futura de desactivación.
  - **Criterio de aceptación:** un refresh token válido de un usuario con `isActive: false` (modificado directamente en base de datos) devuelve 401.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-13] Centralizar `getActorEmail` y eliminar la consulta redundante**
  - **Área:** Refactorización / Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.controller.ts:7-13`, `sale-orders/sale-orders.controller.ts:7-13`, `purchase-orders/purchase-orders.controller.ts:7-13`
  - **Qué hacer:** La misma función está copiada literalmente tres veces, usa un `await import()` dinámico innecesario y ejecuta una consulta extra a la base de datos en **cada mutación**. Cargar el email en `requireAuth`, exponerlo como `req.userEmail` (declarándolo en la interfaz global de `Request`) y borrar las tres copias.
  - **Criterio de aceptación:** las tres funciones locales desaparecen; los registros de `AuditLog` siguen conteniendo `userEmail`; los tests de auditoría siguen pasando.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-11

- [ ] **[T1-14] Vincular los mensajes de error de formulario a sus campos**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/shared/components/Input.tsx:18-29`, `Stockly-F/src/shared/components/Select.tsx:22-47`
  - **Qué hacer:** El error se pinta en un `<p>` sin relación programática con el campo, y el único indicador visual es el color del borde. Añadir `aria-invalid`, `aria-describedby` apuntando a un `<p id={`${id}-error`} role="alert">`. Estos dos componentes son la base de **todos** los formularios de la aplicación, así que la corrección se propaga sola.
  - **Criterio de aceptación:** enviar un formulario inválido hace que el lector de pantalla anuncie el mensaje de error asociado al campo enfocado; `Input.test.tsx` y `Select.test.tsx` incluyen aserciones de `aria-invalid` y `aria-describedby`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Base de datos y robustez

- [ ] **[T1-15] Añadir los índices ausentes en la base de datos**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/prisma/schema.prisma` (completo), nueva migración
  - **Qué hacer:** No existe **ningún** índice no-único en el esquema; PostgreSQL no los crea automáticamente sobre las claves foráneas. Añadir: `StockMovement([productId, createdAt])` y `([createdAt])`, `PriceHistory([productId])`, `SaleOrderItem([saleOrderId])` y `([productId])`, `PurchaseOrderItem([purchaseOrderId])` y `([productId])`, `Product([categoryId])`, `([brandId])`, `([supplierId])`, `([isActive])`, `AuditLog([createdAt])` y `([entity, action])`, `SaleOrder([status, createdAt])`, `PurchaseOrder([status, createdAt])`.
  - **Criterio de aceptación:** `EXPLAIN ANALYZE` sobre `SELECT * FROM stock_movements WHERE "productId" = $1 ORDER BY "createdAt"` pasa de `Seq Scan` a `Index Scan`; la migración aplica limpiamente y la suite del backend sigue en verde.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-16] Sanear los parámetros de paginación para eliminar los 500**
  - **Área:** Código
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:37-38`, `users/users.service.ts:17-19`, `audit-logs/audit-logs.service.ts:43-45`, `sale-orders/sale-orders.service.ts:23-25`
  - **Qué hacer:** `parseInt("abc")` es `NaN` y `Math.max(1, NaN)` sigue siendo `NaN`, que llega a Prisma como `skip`/`take` y provoca un 500. Extraer un helper `parsePagination` en `shared/lib/` que use `Number.parseInt(...) || valorPorDefecto` y aplicarlo en los cuatro servicios.
  - **Criterio de aceptación:** `GET /api/v1/products?page=abc`, `?limit=abc`, `/users?page=xyz` y `/audit-logs?limit=nope` devuelven 200 con la paginación por defecto. Verificado hoy: los cuatro devuelven 500.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Interfaz

- [ ] **[T1-17] Reinicializar el formulario al editar una etiqueta**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/tags/components/TagsPage.tsx:151`
  - **Qué hacer:** `TagFormModal` está montado de forma permanente y `useForm` solo aplica `defaultValues` en el primer montaje, por lo que editar una etiqueta abre el modal con el nombre vacío. Añadir `key={editingTag?.id ?? "new"}`, el mismo patrón que ya usan `ProductsPage:255`, `SuppliersPage:183` y `CatalogItemSection:180`.
  - **Criterio de aceptación:** pulsar «Editar» en una etiqueta abre el modal con su nombre y su color precargados; pulsar «Nueva etiqueta» a continuación abre el modal vacío.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-18] Guardia de rol en las rutas de administración del frontend**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/shared/components/ProtectedRoute.tsx:9-22`, `Stockly-F/src/routes/index.tsx:70-77`
  - **Qué hacer:** `ProtectedRoute` solo comprueba que exista sesión. Un usuario con rol `USER` que abra `/settings`, `/audit-logs` o `/admin/users` por URL directa ve una página rota con toasts de 403 (el backend sí protege correctamente). Añadir una prop `requireRole` que redirija a `/` cuando el rol no coincida, y aplicarla a las tres rutas.
  - **Criterio de aceptación:** un usuario `USER` que navegue a `/admin/users` es redirigido al dashboard sin peticiones fallidas; un `ADMIN` accede con normalidad.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Endurecimiento

- [ ] **[T1-19] Sustituir la exención CSRF por prefijo por una lista explícita**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/middlewares/csrf.middleware.ts:25-28`
  - **Qué hacer:** `req.path.startsWith("/api/v1/auth/")` exime también `POST /auth/logout`, `PUT /auth/me` y `PATCH /auth/me/password`, que son operaciones autenticadas y mutantes. La explotación práctica está limitada por el preflight CORS, salvo en `logout`, que es vulnerable a CSRF por formulario cross-site. Sustituir por un `Set` con las siete rutas públicas reales.
  - **Criterio de aceptación:** `PUT /api/v1/auth/me` sin cabecera `x-csrf-token` devuelve 403 con `NODE_ENV != test`; login, register, refresh, verify-email, resend-verification, forgot-password y reset-password siguen funcionando sin token.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-20] Exigir TLS en el transporte SMTP**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/lib/nodemailer.ts:20-24`
  - **Qué hacer:** Sin `secure` ni `requireTLS`, Nodemailer usa STARTTLS de forma oportunista y continúa en claro si el servidor no lo anuncia — exponiendo credenciales SMTP y los tokens de verificación y reset que viajan en los correos. Añadir `secure: env.smtp.port === 465` y `requireTLS: true`.
  - **Criterio de aceptación:** el envío contra un servidor sin STARTTLS falla con error en lugar de transmitir en claro; el envío contra el SMTP habitual sigue funcionando.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-21] Ejecutar el contenedor con un usuario sin privilegios**
  - **Área:** Seguridad / DevOps
  - **Ubicación:** `Stockly-B/Dockerfile:19-37`
  - **Qué hacer:** El stage runner nunca cambia de usuario, por lo que Node corre como root. Añadir `USER node` antes del `CMD` y ajustar la propiedad de `/app` con `COPY --chown=node:node`.
  - **Criterio de aceptación:** `docker exec stockly_backend id` devuelve `uid=1000(node)` y el contenedor arranca y sirve peticiones con normalidad.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-02

- [ ] **[T1-22] Retirar la promoción automática a ADMIN del primer usuario**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/modules/auth/auth.service.ts:16-18`
  - **Qué hacer:** `userCount === 0 ? "ADMIN" : "USER"` convierte en administrador al primer visitante que se registre en un despliegue sin seed, y tiene una condición de carrera (dos registros concurrentes leen ambos `count() === 0`). Crear el administrador inicial exclusivamente por seed o por un comando de bootstrap explícito. Si se conserva, envolver comprobación y creación en una transacción `Serializable`.
  - **Criterio de aceptación:** el registro público siempre crea usuarios con rol `USER`; el seed sigue generando el administrador; hay un test que verifica el rol del primer usuario registrado.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Red de seguridad E2E

- [ ] **[T1-23] Ampliar el smoke E2E a los flujos que estaban rotos**
  - **Área:** QA
  - **Ubicación:** `Stockly-F/e2e/smoke.spec.ts`
  - **Qué hacer:** Los tres defectos funcionales de esta auditoría no produjeron ningún fallo entre 379 tests, porque cada repositorio prueba contra su propia suposición del contrato. Añadir escenarios que crucen la frontera: (a) activar el interruptor de configuración, recargar y comprobar que sigue activo; (b) crear un producto con una etiqueta y verificar que aparece en el detalle y en el filtro por etiqueta; (c) crear una orden de venta, enviarla, cancelarla y comprobar que el stock del producto vuelve al valor inicial.
  - **Criterio de aceptación:** los 3 escenarios pasan contra la aplicación completa, y fallan si se revierte T0-03, T1-03 o T1-05.
  - **Esfuerzo:** medio
  - **Depende de:** T0-03, T1-03, T1-05, T1-24

- [ ] **[T1-24] Hacer reproducible la ejecución del E2E**
  - **Área:** QA / DevOps
  - **Ubicación:** `Stockly-F/playwright.config.ts:21-26`
  - **Qué hacer:** El `webServer` solo arranca el frontend; el backend y la base de datos hay que levantarlos a mano, y la credencial por defecto no coincide con el seed. Añadir un `globalSetup` o un script `test:e2e:full` que orqueste `docker compose up -d db` + `db:migrate` + `db:seed` + backend + frontend, y usar la credencial del seed. Añadir el proyecto `Mobile Chrome` de Playwright para cubrir de paso los hallazgos responsive.
  - **Criterio de aceptación:** `pnpm test:e2e:full` pasa en local desde un checkout limpio sin pasos manuales previos.
  - **Esfuerzo:** medio
  - **Depende de:** T0-06

### Documentación bloqueante

- [ ] **[T1-25] Corregir las rutas de API y el stack en los READMEs**
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/README.md`, `README.md` (raíz)
  - **Qué hacer:** Seis divergencias verificadas contra el código: el prefijo real es `/api/v1` y no `/api`; Swagger está en `/api/v1/docs` y no en `/api-docs`; el cambio de contraseña es `PATCH /me/password` y no `PUT`; `config/env.ts` usa validación manual y no Zod; la imagen Docker es `node:22-alpine` mientras el README indica Node 20.
  - **Criterio de aceptación:** cada ruta y afirmación del README puede comprobarse contra el código; una prueba manual con curl siguiendo el README funciona.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T1-26] Resolver la contradicción sobre las variables de entorno obligatorias**
  - **Área:** Documentación / Código
  - **Ubicación:** `Stockly-B/README.md`, `Stockly-B/src/config/env.ts:4-17`, `Stockly-B/.env.example`
  - **Qué hacer:** El README afirma que «Cloudinary y SMTP son opcionales en desarrollo», pero `validateEnv()` exige las ocho variables y lanza una excepción al arrancar. Es un bloqueador real de puesta en marcha. Decidir: o marcarlas como obligatorias en la documentación, o —preferible— sacarlas del array `required` y fallar solo al invocar la funcionalidad correspondiente, con un mensaje claro.
  - **Criterio de aceptación:** seguir el README desde un checkout limpio permite arrancar el backend; el comportamiento documentado coincide con el real. Anotar en `.env.example` qué variables son imprescindibles.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

---

## Tier 2 — Mejoras sustanciales

### Rendimiento

- [ ] **[T2-01] Middleware 404 con respuesta JSON**
  - **Área:** Código
  - **Ubicación:** `Stockly-B/src/app.ts:45-51`
  - **Qué hacer:** Las rutas desconocidas devuelven la página HTML de error de Express (`<!DOCTYPE html>...Cannot GET`), rompiendo el sobre `{success, message}` que usa el resto de la API. Insertar un middleware 404 entre el router y el `errorHandler`.
  - **Criterio de aceptación:** `GET /api/v1/ruta-inexistente` devuelve 404 con `{ "success": false, "message": "..." }` y cabecera `application/json`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-02] Bajar a SQL los agregados del resumen de reportes**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/reports/reports.service.ts:19-22,73-83`
  - **Qué hacer:** Un `findMany` sin `take` carga todos los productos activos en memoria para calcular el valor de inventario y los totales por categoría en JavaScript, junto a cinco consultas SQL crudas que sí están optimizadas. Es la consulta que alimenta el dashboard, la primera pantalla tras el login. Sustituir por `GROUP BY` con `SUM(price*stock)` y `COUNT(*) FILTER (WHERE stock <= "minStock")`.
  - **Criterio de aceptación:** `GET /api/v1/reports` devuelve exactamente los mismos valores que hoy (la cobertura de `reports.service.ts` es del 100 %, sirve de red) y ya no materializa el catálogo en el proceso Node.
  - **Esfuerzo:** medio
  - **Depende de:** T1-15

- [ ] **[T2-03] Paginar el listado de órdenes de compra en el backend**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/purchase-orders/purchase-orders.service.ts:13-18`
  - **Qué hacer:** `getAll()` no tiene `skip`/`take` y arrastra el detalle completo de cada ítem — es la única lista de la API sin techo. Replicar el patrón de `saleOrderService.getAll` (`sale-orders.service.ts:22-36`), incluyendo el objeto `meta`.
  - **Criterio de aceptación:** `GET /api/v1/purchase-orders?page=2&limit=5` devuelve 5 elementos y `meta` con `total`, `page`, `limit` y `totalPages`.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-16

- [ ] **[T2-04] Adaptar el frontend a la respuesta paginada de órdenes de compra**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/purchase-orders/hooks/usePurchaseOrders.ts`, `components/PurchaseOrdersPage.tsx`
  - **Qué hacer:** Consumir la nueva forma `{ data, meta }` y añadir los controles de paginación, igual que en `ProductsPage:240-252`.
  - **Criterio de aceptación:** la página muestra la paginación y navega entre páginas correctamente.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-03

- [ ] **[T2-05] Exportaciones por lotes y en streaming**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:208-239`, `sale-orders/sale-orders.service.ts:158-181`, `purchase-orders/purchase-orders.service.ts:107-133`
  - **Qué hacer:** Los tres `exportAll()` cargan la tabla completa y `buildCsv` concatena todo en una sola cadena antes de enviarla. Paginar con cursor y escribir el CSV en streaming sobre `res`, enviando primero la cabecera. Añadir un tope duro configurable como red de seguridad.
  - **Criterio de aceptación:** exportar 50 000 productos no dispara el uso de memoria del proceso por encima de un umbral razonable y el archivo resultante es idéntico al actual para conjuntos pequeños.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna

- [ ] **[T2-06] Reducir el chunk `vendor` del frontend**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-F/vite.config.ts:19-30`
  - **Qué hacer:** Medido: `vendor` pesa 549.93 kB (170.86 kB gzip) y se carga en todas las rutas, incluida la de login — ~680 kB sin comprimir de JavaScript para pintar un formulario. Separar `vendor-react` y `vendor-forms` (react-hook-form + @hookform + zod) del resto, y reducir `@fontsource/inter` a los pesos realmente usados.
  - **Criterio de aceptación:** ningún chunk supera los 250 kB sin comprimir y `vite build` no emite el aviso de tamaño.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-07] No bloquear la respuesta HTTP con el envío de alertas**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:182,370,404`, `sale-orders/sale-orders.service.ts:143-145`
  - **Qué hacer:** `checkLowStockAlert` está correctamente fuera de la transacción, pero se `await`-ea dentro del ciclo de la petición; en órdenes de venta se hace además en serie, una alerta por producto. Disparar sin esperar, registrando los fallos: `void checkLowStockAlert(...).catch((e) => logger.warn(e))`.
  - **Criterio de aceptación:** el tiempo de respuesta de `POST /products/:id/movements` no depende de la latencia del servidor SMTP; los tests de `low-stock-alert.test.ts` siguen verificando el envío (añadiendo un `await` explícito o un flush si hiciera falta).
  - **Esfuerzo:** bajo
  - **Depende de:** T2-10

- [ ] **[T2-08] Ajustar el lote de importación masiva al tamaño del pool**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:242,253-285`, `shared/lib/prisma.ts:9-14`
  - **Qué hacer:** `BATCH_SIZE = 50` con dos operaciones por elemento contra un pool de 10 conexiones y `connectionTimeoutMillis: 5000` puede producir errores por timeout en importaciones grandes. Reducir el lote a ~10 o usar `createMany` seguido de una inserción agrupada de movimientos.
  - **Criterio de aceptación:** importar 1000 productos (el máximo que permite el validador) termina sin errores de timeout en el resultado.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-09] Índice trigram para la búsqueda por nombre**
  - **Área:** Rendimiento
  - **Ubicación:** `Stockly-B/src/modules/products/product.service.ts:48`, `users/users.service.ts:30-33`, nueva migración
  - **Qué hacer:** `{ contains, mode: "insensitive" }` genera `ILIKE '%término%'`, que ningún índice B-tree aprovecha. Migración manual con `CREATE EXTENSION pg_trgm` e índices GIN sobre `products.name` y `users.email`.
  - **Criterio de aceptación:** `EXPLAIN ANALYZE` de la búsqueda del catálogo usa el índice GIN en lugar de un recorrido secuencial.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-15

### Observabilidad

- [ ] **[T2-10] Logging estructurado con correlación de peticiones**
  - **Área:** Código / DevOps
  - **Ubicación:** `Stockly-B/src/app.ts:22-24`, `shared/middlewares/error.middleware.ts:15`
  - **Qué hacer:** `morgan("dev")` solo en desarrollo y un `console.error` de texto plano en producción, sin identificador de petición ni niveles. Adoptar `pino` + `pino-http`, generar un `requestId` por petición, propagarlo al `errorHandler` y devolverlo en la cabecera `x-request-id`.
  - **Criterio de aceptación:** los logs de producción salen en JSON con nivel y `requestId`; dado un `x-request-id` de una respuesta, se pueden recuperar todas sus líneas de log.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna

### Accesibilidad

- [ ] **[T2-11] Enlace para saltar al contenido principal**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/App.tsx:184-236`
  - **Qué hacer:** La barra de navegación tiene entre 3 y 12 controles y se repite en todas las páginas, sin mecanismo para saltarla (WCAG 2.4.1, nivel A). Añadir un enlace visible al recibir foco que apunte a `<main id="contenido" tabIndex={-1}>`.
  - **Criterio de aceptación:** la primera pulsación de Tab desde el inicio de la página revela el enlace; activarlo mueve el foco al contenido principal.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-12] Respetar `prefers-reduced-motion`**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/index.css`
  - **Qué hacer:** Cero coincidencias de `prefers-reduced-motion` en todo `src/`, pese al uso generalizado de `transition-*`, `hover:scale-110` y `animate-spin`. Añadir el bloque `@media` estándar que reduce animaciones y transiciones a duración mínima.
  - **Criterio de aceptación:** con «Reducir movimiento» activado en el sistema operativo, la interfaz no anima transiciones ni escalados.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-13] Nombres accesibles en la página de etiquetas**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/tags/components/TagsPage.tsx:63-73,135-144`
  - **Qué hacer:** Los diez selectores de color son botones sin texto ni etiqueta, y su estado seleccionado se comunica solo con un `outline` CSS; los botones de editar y eliminar tampoco tienen `title` ni `aria-label` (a diferencia de `ProductTable` y `SuppliersPage`). Añadir `aria-label` descriptivos con el nombre de la etiqueta, `aria-pressed` en los colores, y envolverlos en `role="group"` con etiqueta.
  - **Criterio de aceptación:** un lector de pantalla anuncia el propósito de cada botón y el color actualmente seleccionado.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-14] Eliminar el anidamiento `<Link><Button>` de la tabla de productos**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx:156-160`
  - **Qué hacer:** Un `<button>` dentro de un `<a>` es HTML inválido: produce dos paradas de tabulación por acción y confunde a las tecnologías de asistencia, multiplicado por cada fila de la tabla. Como es una navegación, dejar solo el `<Link>` con las clases del botón y un `aria-label` descriptivo.
  - **Criterio de aceptación:** el HTML validado no contiene contenido interactivo anidado; la acción tiene una única parada de tabulación y se activa con Enter.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-15] Nombre accesible en las casillas de selección de fila**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx:71-76`
  - **Qué hacer:** Las casillas del flujo de ajuste masivo de stock —una operación destructiva— no tienen `<label>` ni `aria-label`. Añadir `aria-label={`Seleccionar ${product.name}`}` y una casilla de cabecera «Seleccionar todos» con estado indeterminado.
  - **Criterio de aceptación:** un lector de pantalla identifica a qué producto corresponde cada casilla; la casilla de cabecera selecciona y deselecciona toda la página.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-16] Atributos ARIA y cierre con Escape en los menús de navegación**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/shared/components/NavDropdown.tsx:36-46`, `Stockly-F/src/App.tsx:67-104`
  - **Qué hacer:** `NavDropdown` (Catálogo, Órdenes, Admin) carece de `aria-haspopup`, `aria-expanded`, `role="menu"` y `role="menuitem"`, que `UserMenu` sí tiene bien resueltos. Ninguno de los dos cierra con Escape ni devuelve el foco al botón disparador. Replicar el patrón del `UserMenu` y añadir el manejador de Escape en ambos.
  - **Criterio de aceptación:** el estado abierto/cerrado se anuncia; pulsar Escape cierra el menú y devuelve el foco a su botón.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-17] Exponer el estado de los conmutadores de etiqueta del formulario de producto**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductForm.tsx:221-252`
  - **Qué hacer:** La selección se comunica solo por color de fondo. Añadir `aria-pressed={isSelected}`, envolver en `role="group"` con `aria-label`, y calcular la luminancia de `tag.color` para elegir texto blanco o negro y no fallar el contraste con colores claros.
  - **Criterio de aceptación:** el lector de pantalla anuncia qué etiquetas están seleccionadas; el texto sobre cualquier color de etiqueta cumple un ratio de contraste ≥ 4.5.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-03

- [ ] **[T2-18] Gestión de foco y anuncio al cambiar de ruta**
  - **Área:** Accesibilidad
  - **Ubicación:** `Stockly-F/src/App.tsx`, `Stockly-F/src/routes/index.tsx`
  - **Qué hacer:** En una SPA la navegación no recarga la página: el foco se queda donde estaba y el lector de pantalla no anuncia nada. Añadir un componente que, al cambiar `pathname`, mueva el foco a `<main tabIndex={-1}>` y actualice una región `aria-live="polite"` con el título de la página.
  - **Criterio de aceptación:** navegar entre secciones anuncia el nuevo título y coloca el foco al inicio del contenido.
  - **Esfuerzo:** medio
  - **Depende de:** T2-11

### Cobertura de tests

- [ ] **[T2-19] Tests de las páginas de órdenes de venta y compra**
  - **Área:** QA
  - **Ubicación:** `Stockly-F/src/tests/` (nuevos), cubriendo `SaleOrdersPage.tsx` y `PurchaseOrdersPage.tsx`
  - **Qué hacer:** Son las páginas con más lógica de UI sin cobertura (formularios de array dinámico con `useFieldArray`, transiciones de estado con efectos sobre el inventario) y están al 0 %. Cubrir: alta con varios ítems, validación de cantidades y precios, cambio de estado y renderizado de la lista con sus badges.
  - **Criterio de aceptación:** ambas páginas superan el 60 % de cobertura de sentencias.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna

- [ ] **[T2-20] Tests de la página de gestión de usuarios**
  - **Área:** QA
  - **Ubicación:** `Stockly-F/src/tests/` (nuevo), cubriendo `UsersPage.tsx`
  - **Qué hacer:** Página al 0 % con acciones destructivas (cambio de rol, activar/desactivar). Cubrir el renderizado de la lista, el cambio de rol, la desactivación y el caso de intentar actuar sobre uno mismo (que el backend rechaza con 400).
  - **Criterio de aceptación:** la página supera el 60 % de cobertura de sentencias.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna

- [ ] **[T2-21] Tests del dashboard y la página de reportes**
  - **Área:** QA
  - **Ubicación:** `Stockly-F/src/tests/` (nuevos), cubriendo `DashboardPage.tsx` y `ReportsPage.tsx`
  - **Qué hacer:** Ambas al 0 %. Cubrir estados de carga, renderizado de las tarjetas de KPI con datos mockeados, la sección de alertas de stock bajo y el formateo de moneda.
  - **Criterio de aceptación:** ambas páginas superan el 50 % de cobertura de sentencias.
  - **Esfuerzo:** medio
  - **Depende de:** ninguna

- [ ] **[T2-22] Umbrales de cobertura en ambos repositorios**
  - **Área:** QA
  - **Ubicación:** `Stockly-B/jest.config.js`, `Stockly-F/vite.config.ts:40-53`
  - **Qué hacer:** Ninguna configuración define umbrales, así que nada impide que la cobertura baje. Fijar el suelo en el valor actual menos 2 puntos (backend 85 %, frontend al nivel que resulte tras T2-19/20/21) y subirlo con cada incorporación.
  - **Criterio de aceptación:** `pnpm test:coverage` falla en local si la cobertura baja del umbral.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-01, T1-02, T2-19, T2-20, T2-21

- [ ] **[T2-23] Cubrir las zonas de baja cobertura del backend**
  - **Área:** QA
  - **Ubicación:** `Stockly-B/src/tests/sale-orders.test.ts`, nuevos tests para `upload.middleware.ts`
  - **Qué hacer:** `nodemailer` (31.8 %) y `upload.middleware` (47 %) están siempre mockeados y sus rutas de error nunca se ejercitan; la exportación de órdenes de venta (`sale-orders.controller.ts:74-87`) no tiene tests. Añadir: exportación en CSV y JSON, y el `fileFilter` de multer rechazando un mimetype no permitido.
  - **Criterio de aceptación:** `sale-orders.controller.ts` supera el 75 % y `upload.middleware.ts` el 70 %.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-24] Tests de contrato entre frontend y backend**
  - **Área:** QA / Arquitectura
  - **Ubicación:** `Stockly-F/src/tests/` (nuevos)
  - **Qué hacer:** Segundo nivel de defensa contra la clase de fallo que produjo T0-03, T1-03 y T1-05: validar los datos mockeados de los tests del frontend contra esquemas Zod que reproduzcan las respuestas reales del backend, de modo que un mock desalineado con la API haga fallar los tests. Empezar por settings, products y orders. `SettingsPage.test.tsx:20-23` es el ejemplo canónico: mockea `value` como cadena cuando la API devuelve un boolean.
  - **Criterio de aceptación:** existe al menos un test que falla si el mock diverge de la forma real de la respuesta, verificado alterando deliberadamente un mock.
  - **Esfuerzo:** medio
  - **Depende de:** T1-05, T1-06

### Infraestructura

- [ ] **[T2-25] Healthcheck de aplicación y sonda de readiness**
  - **Área:** DevOps
  - **Ubicación:** `Stockly-B/src/routes/index.ts:17-19`, `docker-compose.yml:22-38`
  - **Qué hacer:** `/health` devuelve 200 aunque la base de datos esté caída, y el servicio `backend` no tiene `healthcheck` en el compose (el de `db` sí lo tiene). Añadir un endpoint `/ready` que ejecute `SELECT 1` y devuelva 503 si falla, y registrar el healthcheck en el compose.
  - **Criterio de aceptación:** con la base de datos detenida, `/ready` devuelve 503 y `docker compose ps` marca el contenedor backend como `unhealthy`.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-02

- [ ] **[T2-26] Verificar la reproducibilidad del build de la imagen**
  - **Área:** DevOps
  - **Ubicación:** `Stockly-B/Dockerfile:7,23`, `Stockly-B/package.json:22-28`
  - **Qué hacer:** El anclaje de la versión de pnpm lo resuelve **T0-02 (punto 1)**, porque `corepack prepare pnpm@latest --activate` no solo era irreproducible sino que además rompía el build. Lo que queda aquí es la verificación: comprobar que dos builds del mismo commit producen el mismo árbol de dependencias, y añadir el campo `"packageManager": "pnpm@11.2.2"` a `package.json` si T0-02 no lo hizo ya.
  - **Criterio de aceptación:** dos `docker build --no-cache` del mismo commit instalan idénticas versiones (comparar `pnpm list --depth=0` dentro de ambas imágenes).
  - **Esfuerzo:** bajo
  - **Depende de:** T0-02

- [ ] **[T2-27] Externalizar las credenciales de PostgreSQL del compose**
  - **Área:** DevOps / Seguridad
  - **Ubicación:** `docker-compose.yml:9-13`
  - **Qué hacer:** `postgres`/`postgres` incrustados y el puerto 5432 publicado en el host, en un archivo que el README raíz presenta como «Docker (producción)». Externalizar a variables con valor requerido (`${POSTGRES_PASSWORD:?requerida}`), no publicar el puerto en producción, y separar `docker-compose.yml` de `docker-compose.prod.yml`.
  - **Criterio de aceptación:** el compose de producción falla si no se define la contraseña; el de desarrollo sigue funcionando con valores por defecto documentados.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-28] Contenedorizar el frontend y añadirlo al compose**
  - **Área:** DevOps
  - **Ubicación:** `Stockly-F/Dockerfile` (nuevo), `docker-compose.yml`
  - **Qué hacer:** No existe ruta de despliegue reproducible para la mitad del producto. Dockerfile multi-stage (build con Node, servido con `nginx:alpine`) con `try_files $uri /index.html` para el enrutado SPA, y su servicio en el compose. Documentar si frontend y backend comparten dominio, porque de ello depende si el `sameSite: "none"` de las cookies puede endurecerse a `lax`.
  - **Criterio de aceptación:** `docker compose up --build` levanta base de datos, backend y frontend, y el login funciona de extremo a extremo desde el navegador.
  - **Esfuerzo:** medio
  - **Depende de:** T0-02

### Documentación de API

- [ ] **[T2-29] Corregir el esquema `Product` de Swagger**
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/src/swagger.ts:17-31,147-151,172-177`
  - **Qué hacer:** El esquema declara `category` como un enum de cadenas cuando en realidad es una relación (`{ id, name }`) y el campo de escritura es `categoryId` (UUID). El `requestBody` de `POST /products` exige un campo `category` que el validador no acepta, por lo que seguir la documentación produce un 422.
  - **Criterio de aceptación:** una petición construida siguiendo el «Try it out» de Swagger para crear un producto devuelve 201.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-03

- [ ] **[T2-30] Documentar en Swagger los módulos ausentes**
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/src/swagger.ts:70-204`
  - **Qué hacer:** El spec cubre `auth` (parcial), `products` (parcial) y movimientos de stock. Faltan `categories`, `brands`, `suppliers`, `purchase-orders`, `sale-orders`, `reports`, `tags`, `users`, `settings`, `audit-logs`, y de products faltan `bulk-stock`, `price-history` y las exportaciones.
  - **Criterio de aceptación:** los doce módulos aparecen en `/api/v1/docs` con sus operaciones, parámetros y códigos de respuesta.
  - **Esfuerzo:** medio
  - **Depende de:** T2-29

### Endurecimiento adicional

- [ ] **[T2-31] Detección de reuso de refresh tokens**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/modules/auth/auth.service.ts:84-102`
  - **Qué hacer:** La rotación es correcta, pero el reuso de un token ya rotado se trata como una expiración normal, sin invalidar la familia ni registrar la anomalía. Persistir el hash del token anterior; si llega un refresh con un hash ya rotado, invalidar todas las sesiones del usuario y registrar el evento en `AuditLog`.
  - **Criterio de aceptación:** reutilizar un refresh token ya rotado invalida la sesión activa y genera una entrada de auditoría; hay un test que lo verifica.
  - **Esfuerzo:** medio
  - **Depende de:** T0-07

- [ ] **[T2-32] Validar las imágenes por sus magic bytes**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/shared/middlewares/upload.middleware.ts:12-18`
  - **Qué hacer:** `fileFilter` confía en `file.mimetype`, que lo fija el cliente. Verificar la firma real del buffer (p. ej. con `file-type`) antes de subir a Cloudinary.
  - **Criterio de aceptación:** un archivo no-imagen enviado con `Content-Type: image/jpeg` se rechaza con 422 antes de llegar a Cloudinary; hay un test que lo verifica.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-33] Limitar el tamaño del cuerpo por ruta**
  - **Área:** Seguridad
  - **Ubicación:** `Stockly-B/src/app.ts:26-27`, `Stockly-B/src/modules/products/product.routes.ts:41`
  - **Qué hacer:** `express.json({ limit: "5mb" })` se aplica globalmente cuando solo la importación masiva lo justifica. Bajar el límite global a `100kb` y aplicar el de 5 MB específicamente en `POST /products/import`.
  - **Criterio de aceptación:** un cuerpo de 1 MB en cualquier endpoint que no sea el de importación devuelve 413; la importación de 1000 productos sigue funcionando.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-34] Descargar el CSV de movimientos vía axios y con codificación correcta**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/api/product.api.ts:95-100`, `Stockly-B/src/modules/products/product.controller.ts:133`
  - **Qué hacer:** La descarga usa un `<a href>` a otro origen, por lo que el atributo `download` se ignora y la petición esquiva el interceptor de axios: con la sesión caducada el usuario descarga el JSON del error 401 en lugar de ser redirigido al login. Además el backend envía `text/csv` sin `charset=utf-8` ni BOM, por lo que los acentos se ven mal en Excel. Descargar como `blob` vía axios reutilizando `downloadBlob`, y corregir la cabecera y el BOM en el backend.
  - **Criterio de aceptación:** con la sesión caducada la acción redirige al login; el CSV descargado muestra correctamente los acentos al abrirlo en Excel en Windows.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

### Sistema de diseño

*Añadido el 2026-08-05 tras la consultoría de estilo UX/UI. El estilo elegido es **Flat Design + Minimalismo Suizo** con perfil **Data-Dense**, que es la recomendación para el tipo de producto «Inventory & Stock Management». Se descartaron glassmorphism y neumorphism por incompatibilidad declarada con interfaces densas en datos y con requisitos de contraste — habrían agravado las ocho tareas de accesibilidad de este mismo tier.*

**Principio rector:** en una aplicación de inventario el color es **dato**, no decoración. Stock bajo, orden cancelada, movimiento `IN`/`OUT`. Si el cromo de la interfaz compite por el color, el usuario pierde la señal. De ahí la separación: **cromo neutro (slate), color reservado para el estado.**

- [ ] **[T2-35] Definir la capa de tokens semánticos en `@theme`**
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
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T2-36] Migrar `Button` y `Badge` a variantes semánticas**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/shared/components/Button.tsx:9-14`, `Badge.tsx:10-18`
  - **Qué hacer:** Son los dos primitivos de los que cuelga el resto de la interfaz, así que la migración se propaga sola. En `Button`, sustituir los literales (`bg-blue-600`, `bg-gray-100`, `bg-red-600`) por los tokens, usando `--color-accent-strong` en los rellenos por lo dicho en T2-35. En `Badge`, las siete variantes actuales mezclan semántica (`success`, `danger`) con decoración (`blue`, `purple`, `orange`, `teal`): `purple` y `teal` se usan **una vez cada una** en toda la aplicación. Reducir a cinco variantes con significado — `neutral | success | warning | danger | info` — mapeadas a los pares `--color-<estado>-surface` / `--color-<estado>`, y reasignar los 12 usos existentes según lo que el badge realmente comunica.
  - **Criterio de aceptación:** ninguno de los dos archivos contiene utilidades `bg-<familia>-<n>`; `pnpm test:run` sigue en verde; los badges de estado de órdenes conservan su significado y ningún estado queda sin variante propia.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35

- [ ] **[T2-37] Erradicar las utilidades de color crudas del resto de la interfaz**
  - **Área:** UI/UX / Refactorización
  - **Ubicación:** transversal — **41 de los 57 archivos `.tsx`** de `Stockly-F/src/`
  - **Qué hacer:** Medido: **561 utilidades** de color literal (`bg|text|border|ring-<familia>-<n>`), repartidas en 386 `gray`, 66 `blue`, 35 `red`, 30 `orange`, 16 `green` y una cola de `purple`, `amber`, `emerald` y `teal` sueltas. Mientras existan, cualquier ajuste de paleta —y el modo oscuro de T4-03— es una edición de 561 puntos. La mayor parte es sustitución mecánica (`text-gray-900`→`text-foreground`, `text-gray-500`→`text-foreground-muted`, `border-gray-200`→`border-border`, `bg-white`→`bg-surface`). Reservar el juicio para los usos que ya codifican estado: `DashboardPage.tsx:36-40` define las tarjetas de KPI con pares `bg-*-50`/`text-*-600` que pasan a los pares de estado del token.
  - **Criterio de aceptación:** `grep -rE "\b(bg|text|border|ring)-(slate|gray|red|orange|amber|green|emerald|teal|blue|indigo|purple)-[0-9]{2,3}" --include="*.tsx" src/` devuelve cero resultados fuera de una lista de excepciones documentada; una comparación visual de las páginas principales no muestra regresiones.
  - **Esfuerzo:** medio
  - **Depende de:** T2-36

- [ ] **[T2-38] Comunicar el estado con icono además de color**
  - **Área:** Accesibilidad / UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx`, `dashboard/components/DashboardPage.tsx`, `sale-orders/components/SaleOrdersPage.tsx`, `purchase-orders/components/PurchaseOrdersPage.tsx`
  - **Qué hacer:** Los tres conjuntos de estado del producto —nivel de stock (correcto / bajo / agotado), estado de orden (`PENDING`/`SHIPPED`/`RECEIVED`/`CANCELLED`) y tipo de movimiento (`IN`/`OUT`)— se distinguen hoy únicamente por color, lo que incumple WCAG 1.4.1 y deja fuera a los usuarios con deficiencia de visión cromática: precisamente la información crítica de una aplicación de inventario. Acompañar cada estado de un icono de Heroicons y de su texto. Es el mismo principio que T2-17 aplica a los colores de etiqueta elegidos por el usuario.
  - **Criterio de aceptación:** con el filtro de escala de grises del navegador activado, los tres conjuntos de estado siguen siendo distinguibles entre sí en tabla, dashboard y listados de órdenes.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-36

- [ ] **[T2-39] Cifras tabulares en las columnas numéricas**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductTable.tsx`, `dashboard/components/DashboardPage.tsx:64-77`, `reports/components/ReportsPage.tsx`
  - **Qué hacer:** Stock, precios, totales e importes se renderizan con las cifras proporcionales de Inter: las columnas no alinean verticalmente entre filas y los KPI cambian de ancho al refrescarse. Inter incluye cifras tabulares; aplicar `tabular-nums` a las celdas numéricas de tabla y a los contadores del dashboard.
  - **Criterio de aceptación:** en una tabla con valores de uno a cinco dígitos las unidades quedan alineadas en vertical; el KPI de valor de inventario no cambia de ancho al actualizarse.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35

- [ ] **[T2-40] Densidad de tabla en escritorio y mínimo táctil en móvil**
  - **Área:** UI/UX / Accesibilidad
  - **Ubicación:** `Stockly-F/src/shared/components/Button.tsx:26`, `Input.tsx`, `Select.tsx`, `modules/products/components/ProductTable.tsx`
  - **Qué hacer:** El perfil *Data-Dense* pide fila de 36 px, padding de tarjeta de 12 px y escala 4/8/16/24/32 en escritorio — pero esa densidad choca de frente con el mínimo táctil de 44 px en móvil, y la resolución de ese conflicto es lo que hay que decidir aquí. Medido: el `Button` base mide **36 px** de alto (`py-2` + `text-sm`), por debajo del mínimo, y es el componente de las acciones por fila y de los controles de paginación. Resolver con padding responsivo sobre el mismo componente (denso a partir de `md`, cómodo por debajo), **no** duplicando componentes.
  - **Criterio de aceptación:** a 375 px de ancho ninguna acción interactiva mide menos de 44×44 px CSS, verificable con el inspector; a ≥1024 px la altura de fila de la tabla de productos es de 36 px.
  - **Esfuerzo:** medio
  - **Depende de:** T2-35

- [ ] **[T2-41] Escala tipográfica explícita y recorte de pesos de Inter**
  - **Área:** UI/UX / Rendimiento
  - **Ubicación:** `Stockly-F/src/index.css:2-5`, transversal
  - **Qué hacer:** Inter es la elección correcta y se mantiene —es el emparejamiento recomendado para paneles de administración—, pero su uso es hoy implícito. Medido: la escala real en uso es `text-sm` (104), `text-xs` (65), `text-2xl` (17), `text-base` (15), `text-xl` (8) y `text-lg` (**1 sola vez**, que es ruido); y los pesos son `font-medium` (57), `font-semibold` (33), `font-bold` (27) y `font-black` (1). **`font-black` (900) no está entre los pesos importados** (`index.css` carga 400/500/600/700), por lo que ese texto se renderiza con negrita sintética. Fijar la escala con roles declarados, eliminar el `text-lg` y el `font-black` huérfanos, y verificar que los cuatro pesos importados son los cuatro usados. Contribuye directamente a T2-06.
  - **Criterio de aceptación:** la escala está declarada en `@theme` con un rol por tamaño; no queda ningún peso usado sin importar ni importado sin usar; el CSS de fuentes baja de peso de forma medible.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35

---

## Tier 3 — Pulido y mantenimiento

- [ ] **[T3-01] Traducir los comentarios y el mensaje de error en inglés**
  - **Área:** Ortografía y redacción
  - **Ubicación:** `Stockly-B/src/modules/users/users.service.ts:63`, `settings/settings.service.ts:3`, `audit-logs/audit-logs.service.ts:38`, `shared/middlewares/upload.middleware.ts:28`
  - **Qué hacer:** Cuatro puntos en inglés en una base de código con comentarios íntegramente en español. El cuarto es un mensaje que llega al usuario: `new Error("Upload failed")` → `"No se pudo subir la imagen"`.
  - **Criterio de aceptación:** no quedan comentarios ni mensajes de usuario en inglés en `src/`.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-02] Convertir `User.role` y los campos de `AuditLog` a enums de Prisma**
  - **Área:** Código
  - **Ubicación:** `Stockly-B/prisma/schema.prisma:154,181-182`
  - **Qué hacer:** La migración `20260601200000` convirtió los estados de órdenes y movimientos a enums nativos, pero `role String @default("USER")` y `AuditLog.action`/`entity` quedaron fuera, pese a tener tipos unión bien definidos en TypeScript. Añadir `enum Role { ADMIN USER }` y los enums de auditoría con su migración.
  - **Criterio de aceptación:** la base de datos rechaza un rol inexistente; `requireRole` y la suite siguen pasando.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-03] Unificar el estilo de exportación del módulo de productos**
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/src/modules/products/product.controller.ts`, `product.service.ts`
  - **Qué hacer:** `products` exporta funciones sueltas mientras los otros once módulos exportan objetos (`usersController`, `settingsService`, …). Alinear con el estilo mayoritario al tocar el módulo; no justifica un cambio masivo aislado.
  - **Criterio de aceptación:** los doce módulos siguen la misma convención de exportación.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-13

- [ ] **[T3-04] Simplificar el intercalado de enlaces de la navegación**
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-F/src/App.tsx:195-208`
  - **Qué hacer:** Señalado ya en la revisión de 2026-07-15 y aún presente: `navLinks.slice(0, 1)` y `navLinks.slice(1)` para colocar los desplegables entre «Dashboard» y «Reportes». Sustituir por un único array de elementos discriminados por `kind: "link" | "dropdown"`.
  - **Criterio de aceptación:** añadir un enlace a la barra no requiere entender aritmética de índices; la navegación renderiza en el mismo orden.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-05] Unificar las cabeceras de exportación CSV entre repos**
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/src/shared/lib/csv.ts:1-11`, `Stockly-F/src/modules/products/utils/importExport.ts:5-26`
  - **Qué hacer:** El escapado está duplicado literalmente (incluido el comentario) y las cabeceras difieren: el backend incluye `sku`, `minStock` y `tags`; el frontend no. El mismo botón «Exportar CSV» produce columnas distintas según la ruta. Unificar las cabeceras y, como mínimo, documentar la duplicación en ambos archivos.
  - **Criterio de aceptación:** ambas exportaciones producen las mismas columnas en el mismo orden; los tests de `importExport.test.ts` y `csv.test.ts` lo verifican.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-06] Decidir explícitamente sobre `.agents/skills/` en el control de versiones**
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/.agents/skills/**`, `Stockly-F/.agents/skills/**`
  - **Qué hacer:** Cientos de archivos markdown de tooling de IA (zod, vitest, prisma, react-best-practices…) están rastreados por git en ambos repos, generando ruido en clones, diffs y búsquedas por texto. Si es tooling personal, añadir `.agents/` al `.gitignore` y sacarlo del índice; si se comparte deliberadamente, documentarlo en el README para que no parezca un descuido.
  - **Criterio de aceptación:** hay una decisión aplicada y documentada; `git grep` sobre el código de aplicación no devuelve resultados de estos archivos.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [x] **[T3-07] Limpiar los artefactos de build antes de compilar**
  - **Área:** Refactorización
  - **Ubicación:** `Stockly-B/package.json:8`, `Stockly-F/package.json:8`
  - **Qué hacer:** `dist/` y `coverage/` persisten en el árbol de trabajo (correctamente ignorados por git). Un `dist/` obsoleto es precisamente cómo se manifiesta T0-01. Añadir un paso de limpieza previo al build.
  - **Criterio de aceptación:** `pnpm build` parte siempre de un `dist/` vacío.
  - **Esfuerzo:** bajo
  - **Depende de:** T0-01

- [ ] **[T3-08] Marcar los iconos decorativos con `aria-hidden`**
  - **Área:** Accesibilidad
  - **Ubicación:** transversal — Heroicons en `ProductTable.tsx`, `App.tsx`, `DashboardPage.tsx` y demás
  - **Qué hacer:** Solo `Select.tsx:43` marca su chevron como decorativo. Añadir `aria-hidden="true"` a los iconos que acompañan a texto para reducir el ruido en lectores de pantalla.
  - **Criterio de aceptación:** los iconos que duplican información textual no se anuncian.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-09] Evitar que el botón flotante tape la paginación en móvil**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/modules/products/components/ProductsPage.tsx:224-238`
  - **Qué hacer:** El botón «Movimiento manual» es `fixed bottom-6 right-6 z-50` y los controles de paginación son estáticos al final del contenido; en pantallas estrechas con un producto seleccionado es probable que lo solape. **Verificar primero en navegador a 375 px** — este hallazgo está marcado como pendiente de verificación en el informe. Si se confirma, añadir `pb-24` al contenedor cuando el botón esté visible, o anclar la acción a la barra de acciones masivas que ya existe arriba.
  - **Criterio de aceptación:** a 375 px de ancho con un producto seleccionado, los botones «Anterior» y «Siguiente» son visibles y pulsables.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-10] Añadir CHANGELOG y guía de contribución**
  - **Área:** Documentación
  - **Ubicación:** `CHANGELOG.md`, `CONTRIBUTING.md` (nuevos, raíz)
  - **Qué hacer:** No existe ninguno de los dos. CHANGELOG con formato *Keep a Changelog*; guía de contribución con la convención de commits, el flujo de ramas y los comandos de verificación previos a un PR (`pnpm check`, `pnpm lint`, `pnpm test`).
  - **Criterio de aceptación:** ambos archivos existen y la guía referencia los comandos reales del proyecto.
  - **Esfuerzo:** bajo
  - **Depende de:** T1-09

- [ ] **[T3-11] Registrar las decisiones de arquitectura como ADRs**
  - **Área:** Documentación
  - **Ubicación:** `docs/adr/` (nuevo)
  - **Qué hacer:** El proyecto ha tomado decisiones no obvias y bien fundadas que hoy solo viven en comentarios dispersos y se perderían si cambia de manos: decremento condicional para cerrar la carrera de stock, tokens de verificación y reset hasheados con SHA-256 en base de datos, `path` restringido de la cookie de refresh, y envío de correos fuera de la transacción. Una entrada corta por decisión (contexto, decisión, consecuencias).
  - **Criterio de aceptación:** existen al menos cuatro ADRs, una por cada decisión citada.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-12] Declarar explícitamente que la aplicación no debe indexarse**
  - **Área:** SEO
  - **Ubicación:** `Stockly-F/public/robots.txt` (nuevo)
  - **Qué hacer:** La aplicación está íntegramente detrás de autenticación y no tiene contenido público indexable —por lo que la ausencia de SSR, sitemap y datos estructurados es la decisión correcta—, pero conviene declararlo: `User-agent: *` / `Disallow: /`.
  - **Criterio de aceptación:** `GET /robots.txt` devuelve el archivo en el build de producción.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-13] Asegurar `NODE_ENV=production` en entornos desplegados**
  - **Área:** Seguridad / DevOps
  - **Ubicación:** `Stockly-B/src/shared/middlewares/error.middleware.ts:18-21`, `docker-compose.yml:33-35`
  - **Qué hacer:** Fuera de producción el `errorHandler` devuelve `err.message` íntegro, que en un error de Prisma incluye la consulta completa y la ruta absoluta del archivo fuente. El compose ya fija `NODE_ENV: production` correctamente; documentar que cualquier entorno de staging debe hacer lo mismo y añadir la comprobación al arranque.
  - **Criterio de aceptación:** ningún entorno desplegado devuelve rutas del sistema de archivos en las respuestas de error.
  - **Esfuerzo:** bajo
  - **Depende de:** ninguna

- [ ] **[T3-14] Unificar la escala de radios y sombras**
  - **Área:** UI/UX / Refactorización
  - **Ubicación:** transversal, `Stockly-F/src/**/*.tsx`
  - **Qué hacer:** Medido: 81 utilidades de radio (40 `rounded-xl`, 28 `rounded-lg`, 12 `rounded-full`, **1 `rounded-md` huérfano**) y 11 de sombra repartidas entre `shadow-sm`, `shadow-lg` y `shadow-xl` sin criterio. Aplicar la convención fijada en T2-35 — `rounded-xl` para superficies (tarjetas, modales), `rounded-lg` para controles (botones, inputs), `rounded-full` para badges y avatares — y reducir las sombras a los dos tokens de elevación (`shadow-raised` para superficie elevada, `shadow-overlay` para modales y desplegables). La jerarquía la da el borde, no la sombra.
  - **Criterio de aceptación:** no queda ningún `rounded-md`; cada `shadow-*` del código es uno de los dos tokens de elevación.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35

- [ ] **[T3-15] Documentar el sistema de diseño**
  - **Área:** Documentación / UI/UX
  - **Ubicación:** `Stockly-F/docs/design-system.md` (nuevo)
  - **Qué hacer:** Sin un documento de referencia, el sistema se erosiona en el siguiente PR y se vuelve a las 561 utilidades crudas. Recoger: la tabla de tokens con sus contrastes, la convención de radios y elevación, el semáforo de estado con sus iconos, el perfil de densidad con la excepción táctil de móvil, la escala tipográfica con sus roles, y la regla que lo gobierna todo — **el color comunica estado, nunca decora**. Enlazarlo desde el README del frontend.
  - **Criterio de aceptación:** un colaborador puede añadir una página nueva coherente con el resto sin elegir un solo valor hexadecimal.
  - **Esfuerzo:** bajo
  - **Depende de:** T2-35, T2-36, T2-37, T2-38, T2-39, T2-40, T2-41, T3-14

---

## Tier 4 — Futuro / opcional

*Explícitamente fuera del alcance inmediato. Se listan para que la decisión de no hacerlos sea consciente.*

- [ ] **[T4-01] Paquete compartido de contratos entre repositorios**
  - **Área:** Arquitectura
  - **Ubicación:** `shared/` (nuevo paquete del workspace pnpm)
  - **Qué hacer:** Los tipos de request/response se declaran a mano y por duplicado en cada repo, sin nada que obligue a que coincidan. Es la causa raíz común de T0-03, T1-03 y T1-05. Extraer los esquemas Zod y los tipos inferidos a un paquete consumido por ambos lados.
  - **Criterio de aceptación:** una divergencia de contrato produce un error de compilación en lugar de un fallo silencioso en tiempo de ejecución.
  - **Esfuerzo:** alto
  - **Depende de:** T2-24

- [ ] **[T4-02] Generar el OpenAPI desde los esquemas Zod**
  - **Área:** Documentación
  - **Ubicación:** `Stockly-B/src/swagger.ts`
  - **Qué hacer:** Sustituir el objeto literal mantenido a mano por generación con `zod-to-openapi` desde los validadores, que ya son la fuente de verdad. Habilita además la generación de un cliente tipado para el frontend.
  - **Criterio de aceptación:** la documentación no puede desincronizarse de la validación, porque se deriva de ella.
  - **Esfuerzo:** alto
  - **Depende de:** T2-30, T4-01

- [ ] **[T4-03] Modo oscuro**
  - **Área:** UI/UX
  - **Ubicación:** `Stockly-F/src/index.css`, transversal
  - **Qué hacer:** Cero clases `dark:` y ningún soporte de `prefers-color-scheme` (curiosamente, las plantillas de correo sí declaran `color-scheme: light dark`). Si se aborda, hacerlo con tokens semánticos en `@theme` de Tailwind 4 antes que con clases `dark:` dispersas por 20 páginas. **Ese prerrequisito es exactamente lo que construyen T2-35 a T2-37:** una vez la interfaz consume tokens en lugar de 561 literales, el modo oscuro se reduce a redefinir la capa semántica bajo `prefers-color-scheme`, no a editar 20 páginas — de ahí que el esfuerzo baje de alto a medio. El estilo elegido soporta modo oscuro completo (`✓ Full`) según su propia ficha. Recordar que el modo oscuro no se construye invirtiendo colores, sino con variantes tonales desaturadas y contraste verificado por separado.
  - **Criterio de aceptación:** la aplicación respeta la preferencia del sistema y mantiene el contraste AA en ambos temas.
  - **Esfuerzo:** medio *(alto si se aborda antes que T2-37)*
  - **Depende de:** T2-35, T2-37

- [ ] **[T4-04] Internacionalización**
  - **Área:** UI/UX
  - **Ubicación:** transversal, ambos repos
  - **Qué hacer:** Todos los textos están incrustados en los componentes y el backend devuelve mensajes de error en español. Requeriría extraer cadenas en ambos repos y que la API devuelva códigos de error en lugar de mensajes.
  - **Criterio de aceptación:** cambiar el idioma traduce toda la interfaz, incluidos los mensajes de error procedentes de la API.
  - **Esfuerzo:** alto
  - **Depende de:** T4-01

- [ ] **[T4-05] Documentar la estrategia de backup y rollback**
  - **Área:** DevOps
  - **Ubicación:** `docs/operaciones.md` (nuevo)
  - **Qué hacer:** No hay procedimiento de copia de seguridad ni de reversión. Documentar un `pg_dump` programado con retención definida, un procedimiento de restauración **probado**, y la política de migraciones hacia adelante (Prisma no genera *down migrations*). Especialmente relevante en un sistema cuyo valor es la integridad de un histórico de inventario.
  - **Criterio de aceptación:** existe un procedimiento escrito y se ha ejecutado con éxito una restauración de prueba.
  - **Esfuerzo:** medio
  - **Depende de:** T2-28

- [ ] **[T4-06] Monitorización y alertas**
  - **Área:** DevOps
  - **Ubicación:** transversal
  - **Qué hacer:** No hay recogida de métricas, agregación de logs ni alertas: un incidente en producción se detectaría por el reporte de un usuario. Añadir un endpoint `/metrics` y un agregador de logs cuando el proyecto entre en producción real.
  - **Criterio de aceptación:** un pico de errores 5xx genera una alerta antes de que lo reporte un usuario.
  - **Esfuerzo:** medio
  - **Depende de:** T2-10, T2-25

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
| V-06 Sin backup ni monitorización | Bajo | T4-05, T4-06 |
| SEO — sin `robots.txt` | Bajo | T3-12 |
| Zonas no cubiertas — SCA y licencias | — | T4-07 |
| Zonas no cubiertas — pruebas de carga | — | T4-08 |
| Zonas no cubiertas — auditoría de navegador | — | T4-09 |

### Consultoría de diseño (2026-08-05)

*Hallazgos ajenos a la auditoría del 2026-08-04. Estilo adoptado: Flat Design + Minimalismo Suizo, perfil Data-Dense.*

| Hallazgo | Severidad | Tareas |
|---|---|---|
| DS-01 Sin capa de tokens semánticos (1 solo token en `@theme`) | Medio | T2-35, T2-37 |
| DS-02 561 utilidades de color crudas en 41 de 57 archivos | Medio | T2-36, T2-37 |
| DS-03 El estado se comunica solo por color (WCAG 1.4.1) | Medio | T2-38 |
| DS-04 Cifras proporcionales en columnas numéricas | Bajo | T2-39 |
| DS-05 Densidad sin sistema y `Button` de 36 px bajo el mínimo táctil | Medio | T2-40 |
| DS-06 Escala tipográfica implícita; `font-black` sin peso importado | Bajo | T2-41 |
| DS-07 Radios y sombras sin convención | Bajo | T3-14 |
| DS-08 Sistema de diseño sin documentar | Bajo | T3-15 |
| DS-09 Navegación superior con doce módulos | Bajo | T4-10 |

---

## Progreso

Registrar aquí cada tarea completada con su fecha y una nota breve de verificación.

| Fecha | Tarea | Verificación | Notas |
|---|---|---|---|
| 2026-08-04 | **T0-01** Alias `@/` en el build | `pnpm build && node dist/server.js` arranca y conecta con la BD | `tsc-alias@1.9.1` como devDependency; `build` pasa a `tsc && tsc-alias`. Se añadió también un `prebuild` que limpia `dist/` sin dependencias nuevas — **absorbe T3-07**. |
| 2026-08-04 | **T0-02** Imagen Docker (5 fallos) | `docker compose up --build` → migraciones aplicadas + `GET /api/v1/health` **200** | Dentro de la imagen: `pnpm 11.2.2`, `prisma.config.ts` presente, CLI de Prisma disponible. `prisma` movida a `dependencies`; `packageManager` fijado; `pnpm-workspace.yaml` copiado; `ARG DATABASE_URL` para `prisma generate`. **Absorbe el anclaje de versión de T2-26.** |
| 2026-08-04 | **T0-03** Reposición de stock al cancelar venta enviada | Test: stock 100 → `SHIPPED` 70 → `CANCELLED` **100** + movimiento `IN` de `+30` | Rama `beingCancelled` transaccional, simétrica al envío. |
| 2026-08-04 | **T0-04** Descuento de stock al cancelar compra recibida | Test: stock 100 → `RECEIVED` 140 → `CANCELLED` **100** + movimiento `OUT` de `-40` | Decremento condicional: si las unidades ya se consumieron, 400 y la transacción se revierte entera. |
| 2026-08-04 | **T0-05** Tests de cancelación | 6 tests nuevos en `sale-orders.test.ts` y `purchase-orders.test.ts`, todos en verde | Cubren reposición, descuento, stock ya consumido (400), cancelar `PENDING` (sin efecto) y no reponer dos veces. |
| 2026-08-04 | **T0-06** Credencial del E2E | Cero coincidencias en todos los blobs del historial reescrito; `origin/main` actualizado | Valor por defecto ahora el del seed (`Admin1234!`). Historial purgado con `git-filter-repo --replace-text` y publicado con `push --force`: los 24 SHA cambiaron (`main` pasó de `af1d8d3` a `7290e33`). **Pendiente por parte del usuario:** rotar la contraseña original y abrir ticket a GitHub Support para recolectar el commit huérfano `55efe3b`. |
| 2026-08-04 | **T0-07** Reset revoca sesiones | Test: `POST /auth/refresh` con la cookie previa devuelve **401** tras el reset | `resetPassword` anula `refreshToken`/`refreshExpires`, igual que `updatePassword`. |
| 2026-08-04 | **T0-08** Test de regresión del reset | En verde; falla si se revierte T0-07 | Login → refresh OK → forgot → reset → refresh 401 + campos nulos en BD. |
| 2026-08-05 | **T1-01** Cadena de verificación del backend — *verificada, sin marcar* | Los 6 pasos ejecutados localmente: `check` ✅, `test:coverage` ✅ 205/205, `build` ✅, arranque del artefacto ✅ (`/api/v1/health` → 200) | Hallazgos que la secuencia exige: `prisma generate` como paso propio y previo (el cliente está en `.gitignore`) y base de tests `Stockly_test` para alinearse con la reescritura de `jest.setup.js:11`. Sin verificar: `migrate deploy` en base nueva — Docker no disponible. **Pendiente:** empaquetarlo como script `verify`. |
| 2026-08-05 | **T1-02** Cadena de verificación del frontend — *verificada, bloqueada* | `install --frozen-lockfile` ✅, `check` ✅, `test:coverage` ✅ 181/181, `build` ✅. **`lint` ❌ 26 errores** | Se añadieron a `package.json` el script `check` (`tsc -b`) y el campo `packageManager: pnpm@11.2.2`, que no existían. El rojo del lint **es T1-09**. **Pendiente:** empaquetarlo como script `verify`. |
| 2026-08-06 | **Decisión: sin CI** | `Stockly-B/.github/` y `Stockly-F/.github/` eliminados | Se descarta GitHub Actions y cualquier pipeline. Toda la verificación (tipos, lint, tests, cobertura, build, E2E) se ejecuta en local. T1-01 y T1-02 se reformulan como guiones de verificación local. También se quitó la dependencia de `process.env.CI` en `playwright.config.ts:11-12`. |
| 2026-08-07 | **T1-01** Script `verify` del backend — **completada** | `pnpm verify` entero en verde contra el PostgreSQL local (5433): `generate` ✅, `migrate deploy` ✅, `check` ✅, `test:coverage` ✅ 205/205, `build` ✅, smoke ✅ `/api/v1/health` → 200, salida **0**. Camino de fallo comprobado: con `dist/server.js` renombrado sale **1** | Nuevo `scripts/smoke.js`. Usa `SMOKE_PORT` (3100) para no chocar con el `dev`, y `process.exitCode` en vez de `process.exit()`: en Windows, salir con el hijo aún cerrándose aborta libuv (`UV_HANDLE_CLOSING`) y devuelve un código basura pese a haber pasado la comprobación. |
| 2026-08-07 | **T1-02** Script `verify` del frontend — *implementado, bloqueado por T1-09* | `check` ✅, `test:coverage` ✅ 181/181, `build` ✅. **`lint` ❌ 26 errores + 4 avisos**, así que `verify` se detiene ahí | El primer `verify` real destapó **un conflicto de merge sin resolver commiteado** en `e2e/smoke.spec.ts:3-12` (merge `4254582`, 2026-08-05) que reintroducía la credencial `Ad159753` purgada por T0-06 — resuelto a favor del lado del seed, con lo que el lint vuelve de 27 a 26 errores. También: ESLint analiza `coverage/`, de donde salen 3 de los 4 avisos. |

### Resumen por Tier

| Tier | Completadas | Total | % |
|---|---:|---:|---:|
| **Tier 0** | **8** | **8** | **100 %** ✅ |
| Tier 1 | 1 | 26 | 4 % |
| Tier 2 | 0 | 41 | 0 % |
| Tier 3 | 1 | 15 | 7 % |
| Tier 4 | 0 | 10 | 0 % |
| **Total** | **10** | **100** | **10 %** |

*T3-07 (limpiar artefactos antes de compilar) se resolvió como efecto colateral de T0-01.*

### Métricas

| Métrica | Inicial (auditoría) | Tras Tier 0 | Objetivo |
|---|---|---|---|
| Tests backend | 198/198 ✅ | **205/205** ✅ | mantener en verde |
| Cobertura backend (sentencias) | 86.92 % | **87.10 %** | ≥ 88 % |
| Tests frontend | 181/181 ✅ | 181/181 ✅ | mantener en verde |
| Cobertura frontend (sentencias) | 19.88 % | 19.88 % | ≥ 45 % |
| `pnpm lint` (frontend) | ❌ 26 errores | ❌ 26 errores | ✅ 0 errores |
| Conflictos de merge sin resolver en el árbol | 1 *(no detectado en la auditoría)* | **0** ✅ | 0 |
| `pnpm check` (ambos) | ✅ sin errores | ✅ sin errores | mantener |
| `node dist/server.js` | ❌ MODULE_NOT_FOUND | ✅ **arranca** | ✅ arranca |
| `docker compose build backend` | ❌ falla en el primer `pnpm install` | ✅ **imagen construida** | ✅ imagen construida |
| `docker compose up --build` | ❌ no alcanzable | ✅ **health 200** | ✅ health 200 |
| Chunk `vendor` (sin comprimir) | 549.93 kB | 549.93 kB | < 250 kB |
| Índices no-únicos en BD | 0 | 0 | 14 |
| Guiones `verify` locales | 0 | **2** *(backend en verde; el del frontend se detiene en el lint — T1-09)* | 2 en verde |
| Tokens semánticos en `@theme` | 1 (`--font-sans`) | 1 | capa completa (T2-35) |
| Utilidades de color crudas en `src/**/*.tsx` | 561 (41 de 57 archivos) | 561 | 0 fuera de excepciones |
| Variantes de `Badge` sin significado | 4 de 7 | 4 de 7 | 0 |
| Clases `dark:` | 0 | 0 | (T4-03) |

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
