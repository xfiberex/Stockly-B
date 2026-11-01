# Área 02 · Seguridad · hallazgos provisionales

Revisado (profundidad *rápida*, dirigida por riesgo; solo Crítico y Alto):
- **Leído entero:** `src/app.ts`; `src/config/env.ts`; `src/routes/index.ts`; middlewares `auth`, `csrf`, `rateLimiter`, `upload`, `error`, `validate`; módulo `auth` (rutas, controlador, servicio, validador); `users` (rutas, servicio, controlador); `notifications` (servicio y controlador); `settings` (servicio, controlador y validador); `sale-orders` (rutas, servicio, controlador y validador); `stock-transfers` (servicio, validador); `inventory-counts` (validador); `customers.service`; `product.routes`, `product.controller` y `product.validator`; `shared/lib` `jwt`, `hash`, `tokens`, `csv`, `exportacion`, `logger`, `logoDelNegocio`, `emailTemplates`; `cli/resumen-semanal.ts`; `audit-logs.service`; `reports.controller`; `Dockerfile` y `docker-compose*.yml`; en `Stockly-F`: `nginx.conf`, `index.html`, `shared/api/axios.ts`, `ProtectedRoute.tsx`, `usePuede.ts`.
- **Por muestra:** `nodemailer.ts` (transporte y plantillas de verificación y reset), `product.service.ts` (solo `prepararEtiquetas` y las selecciones), `contratos/api.ts` (matriz `PERMISOS` y comentarios), `prisma/schema.prisma` (modelos `Customer` y `Supplier`), `prisma/seed.ts` (usuarios y limpieza), `README.md`, `docs/ROADMAP.md`, `docs/legal.md` y `docs/operaciones.md` (para saber qué está decidido).
- **Por búsqueda (no leído línea a línea):** los 94 usos de `$queryRaw`, `$executeRaw` y `Prisma.sql` de `src/` (todos son plantillas etiquetadas con parámetros; **no hay** `$queryRawUnsafe` ni `Prisma.raw`); `fetch(`, `redirect` y `process.env` en `src/`; `dangerouslySetInnerHTML`, `innerHTML`, `localStorage`, `document.cookie`, `window.open` y `<img src>` en `Stockly-F/src`.
- **No se abrió:** `shared/lib/stock.ts`, `lotes.ts`, `stockComprometido.ts`, `inventory-counts.service.ts`, `purchase-orders.*`, `reports.service.ts` y `reports.abc.ts`, `reports.pdf.ts`, `sale-orders.comprobante.ts`, `product.service.ts` (resto), `warehouses.service.ts`, `suppliers/brands/categories/tags` (CRUD trivial), `metricas.middleware.ts`, `notFound.middleware.ts`, `swagger*.ts`, `alertas5xx.ts`, `scripts/`, `load/`, `observabilidad/`, migraciones y el resto de componentes del frontend. El `.env` del backend existe en el árbol de trabajo (ignorado por git) y no se abrió a propósito.
- **Contraste con el inventario de Haiku:** las 97 claves de `permitir(...)` coinciden con las de `PERMISOS`; los 16 `router.use(requireAuth)` y el limitador de `unread-count` están donde dice `superficie.md`; las únicas rutas de módulos sin `permitir` son las 12 de `/auth` (comprobado con `grep`). Las líneas citadas en la matriz son las de `superficie.md`, y las que abrí las confirmé.
- **Línea base y dependencias:** las vulnerabilidades de dependencias salen de `trabajo/linea-base.md`, que no consulté al no estar disponible al escribir esto: **no hay conclusión sobre dependencias en este archivo** (queda para la consolidación). Secretos en el historial: tomé `trabajo/secretos-historial.md` (escaneo parcial, sin gitleaks); sin candidatos nuevos con aspecto de secreto real. Confirmé en HEAD que ningún `.env` está versionado en los dos repos (`git ls-files`: solo `.env.example`).

Herramientas ejecutadas: ninguna externa (Grep, Glob, Read y `git ls-files`/`git check-ignore` de solo lectura). Sin Semgrep, sin `pnpm audit`, sin gitleaks. Sin skills de apoyo.
Modelo: claude-sonnet-5-5 (Sonnet 5.5) · esfuerzo high.

Resumen: **Crítico 0 · Alto 3** (rápida: Medio y Bajo no se reportan). Re-auditoría: las 10 tareas cerradas siguen resueltas (tabla en *Puntos fuertes*); sin regresiones ni «cerradas en falso».

## Hallazgos

### P-02-01 · El registro público abierto da un rol `USER` que lee los datos personales de todos los clientes, las ventas y los costes
**Área:** Seguridad · **Severidad:** Alto · **Confianza:** Alta · **Verificación:** estática · **Esfuerzo:** Bajo
**Ubicación:** `src/modules/auth/auth.routes.ts:19` (`POST /auth/register`, sin ninguna aprobación), `src/modules/auth/auth.service.ts:15-43` (crea `USER`, la cuenta se activa al confirmar el correo), `src/contratos/api.ts:119-120` (`GET /customers`, `GET /customers/:id` → `TODOS`), `:125,127,129` (`GET /sale-orders`, `/:id`, `/:id/receipt` → `TODOS`), `:77` (`cost-history` → `TODOS`), `:158-162` (informes → `TODOS`), `:174` (`GET /settings/business` → `TODOS`); `Stockly-F/src/routes/index.tsx:60` (página de registro).
**Estado:** nuevo (la auditoría anterior solo cerró el ADMIN automático, S-07/T1-22; entonces `USER` no leía datos de clientes. Los clientes con documento y los comprobantes entraron en los Tiers 5 y 6, y eso es el hecho nuevo).
**Problema:** cualquiera que pueda recibir un correo puede crearse una cuenta. `register` es público, solo lo frena el limitador de registro y la verificación del buzón propio, y no existe ningún interruptor para cerrarlo ni paso de aprobación por un ADMIN. La cuenta nace con `role: "USER"` y activa, y `USER` está dentro del grupo `TODOS`, que lee:
- los clientes con nombre, correo, teléfono, **documento (cédula, NIF)** y notas (`customers.service.ts:36-71`, `Customer` en `schema.prisma:449-467`);
- todas las ventas, con `customerEmail`, `customerPhone`, `customerDocument` y `createdByEmail` (el correo de cada empleado vendedor; decidido en T6-06 pensando en personal, no en cuentas abiertas) y el comprobante en PDF;
- los costes por producto, su histórico y los márgenes de los informes;
- los datos de proveedores y de compras y los datos fiscales del negocio.

El README (`README.md:234`) y T6-10 plantean el alta con otro rol solo por invitación, pero la puerta por registro sigue abierta con acceso de lectura a lo anterior. `legal.md §2.1` documenta que «lo lee todo el que lee ventas o clientes», sin contar con que eso incluye a cualquier cuenta autoregistrada.
**Impacto:** en cuanto exista un despliegue con clientes reales, cualquier persona de internet obtiene en un par de minutos una cuenta con lectura de la agenda completa de clientes (identificadores nacionales incluidos), del historial de ventas y de la estructura de costes. Es exposición masiva de datos personales con una cuenta que cualquiera puede crear (A01:2025, API1/API5:2023; RGPD/LOPD según jurisdicción). Hoy no hay despliegue ni datos reales, por eso no es Crítico; con registro abierto y datos reales sería Crítico y bloquearía el release. CVSS v4.0 orientativo: `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N`.
**Evidencia:** lectura de `auth.routes.ts:19` (solo `authRegisterLimiter` y `validate`), `auth.service.ts:30-40` (`role: "USER"`, sin `isActive: false`), `auth.service.ts:84` (el login solo exige verificar el correo) y `api.ts` (filas citadas). `permisos.test.ts` y `venta-de-mostrador.test.ts` fijan que `USER` lee ventas. Verificable en ejecución: registrar una cuenta, confirmar el correo y pedir `GET /api/v1/customers`.
**Solución propuesta:** elegir una de estas (la 1 es la más barata y suficiente):
1. Cerrar el registro público y dejar el alta solo por invitación (`POST /users`, que ya existe): quitar `POST /auth/register`, o dejarlo detrás de `REGISTRATION_ENABLED` (por defecto `false`) y ocultar la página.
2. Si el registro abierto debe quedar, que la cuenta nazca **sin acceso** (`isActive=false` o un rol sin permisos) hasta que un ADMIN la apruebe.
3. Reducir los datos de `TODOS`: `GET /customers*` y los campos `customerDocument/Email/Phone` de las ventas, solo para quien vende o administra.

En cualquier caso, actualizar `legal.md §2.1` y el test de `permisos.test.ts`.
**Criterio de aceptación:** una cuenta recién registrada y verificada (si el registro sigue existiendo) recibe 403 en `GET /customers`, `GET /sale-orders` y `GET /reports`, o `POST /auth/register` responde 404/403 con el interruptor apagado; un test de integración lo fija.

### P-02-02 · El arranque documentado de un despliegue (`pnpm db:seed`) crea administradores con contraseña pública y vacía la base, sin ninguna guarda de entorno
**Área:** Seguridad · **Severidad:** Alto · **Confianza:** Alta · **Verificación:** estática · **Esfuerzo:** Bajo
**Ubicación:** `prisma/seed.ts:85-90` (`deleteMany` de todas las tablas, incluido `user`), `prisma/seed.ts:100-150` (`admin@stockly.app` y `carlos@stockly.app` ADMIN con `Admi…`, además de `User…`, `Alma…` y `Vend…`, todos `isVerified: true`), `prisma/seed.ts:1147-1151` (los imprime), `prisma.config.ts:9` (`seed: "tsx prisma/seed.ts"`), `README.md:244-260` y `docs/README-proyecto.md:89-90` («En un despliegue nuevo hay que ejecutar el seed»).
**Estado:** nuevo.
**Problema:** la documentación presenta el seed como la forma de obtener el primer administrador en un despliegue nuevo, porque el registro ya no promueve a ADMIN (T1-22). Pero el seed no comprueba `NODE_ENV` ni pide confirmación, **borra toda la base** antes de sembrar y deja cuentas ADMIN con contraseñas que están escritas en el README y en el código de un **repositorio público**. No hay ningún paso, ni en README ni en `operaciones.md`, que obligue a cambiarlas ni a borrar las cuentas de demostración. No hay otra vía documentada para crear el primer ADMIN que el seed o una promoción manual.
**Impacto:** una instalación que siga la documentación queda con dos cuentas ADMIN cuyas credenciales conoce cualquiera que lea el repositorio: lectura y escritura de todo, creación de usuarios y exportaciones (A07:2025, credenciales por defecto). Además, relanzar el comando por error en una base con datos reales la destruye. No es Crítico solo porque aún no hay despliegue. CVSS v4.0 orientativo: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N`.
**Evidencia:** lectura de `seed.ts` (sin referencias a `NODE_ENV` ni `production`, `grep` vacío) y de las secciones citadas de README. Los valores de las contraseñas son los documentados en `README.md:250-254` (no se reproducen aquí más allá de lo necesario).
**Solución propuesta:** (a) el seed se niega a correr con `NODE_ENV=production` o con `DATABASE_URL` que no sea local, salvo con `--forzar`; (b) separar `db:seed` (demo) de un comando `admin:crear` (o `ADMIN_EMAIL`/`ADMIN_PASSWORD` por entorno, sin vaciar nada) que cree solo el primer ADMIN; (c) corregir README, `README-proyecto.md` y `operaciones.md` para que el despliegue use ese comando; (d) opcional: contraseña del seed generada al azar y mostrada una vez.
**Criterio de aceptación:** con `NODE_ENV=production`, `pnpm db:seed` aborta sin tocar la base; existe un comando documentado para crear el primer ADMIN con contraseña propia; ningún documento de despliegue manda a ejecutar el seed de demostración.

### P-02-03 · Los limitadores de peticiones cuentan por IP sin `trust proxy` detrás de nginx: un único cubo para todos los usuarios, y el login se bloquea con 10 peticiones anónimas
**Área:** Seguridad · **Severidad:** Alto · **Confianza:** Media · **Verificación:** estática · **Esfuerzo:** Bajo
**Ubicación:** `src/app.ts:16-84` (no hay `app.set("trust proxy", …)`; `grep` en `src/` sin resultados), `src/shared/middlewares/rateLimiter.middleware.ts:27-35` (global, 100/15 min), `:52-59` (`authStrictLimiter`, 10/15 min en login, forgot y reset), `:62-69` (registro, 5/hora), `Stockly-F/nginx.conf:34-41` (`proxy_pass` con `X-Forwarded-For`), `docker-compose.yml:133-134` (la pila publica nginx como entrada).
**Estado:** nuevo.
**Problema:** `express-rate-limit` usa `req.ip` por defecto. Sin `trust proxy`, `req.ip` es la dirección de quien abre el socket, que en la pila del compose es siempre el contenedor de nginx. Todas las peticiones de todos los clientes caen en el mismo cubo. `README.md:235` documenta «100 cada 15 min por IP; 10 en login»: con el proxy que el propio proyecto entrega, no es por IP.
**Impacto:** (1) cualquiera, sin cuenta, agota el cupo de login con 10 peticiones y deja a **todos** sin poder iniciar sesión (o recuperar la contraseña) 15 minutos, repetible; lo mismo con el registro (5/hora para todo el sitio). (2) El cupo global de 100 peticiones en 15 min se reparte entre todos los usuarios de la oficina: un panel hace varias consultas por pantalla, así que con unas pocas personas se llega al 429 en el uso normal. (3) La defensa de fuerza bruta por IP del atacante no existe como tal. Es un fallo de disponibilidad en el flujo de autenticación con explotación trivial, no de confidencialidad. Si el despliegue real usa otro proxy distinto de nginx el efecto es el mismo. Sube a *Confirmado* con la prueba de ejecución indicada abajo. CVSS v4.0 orientativo: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N`.
**Evidencia:** lectura de `app.ts` (sin `trust proxy`), `rateLimiter.middleware.ts` (sin `keyGenerator`) y `nginx.conf` (el único cliente directo del backend es nginx). Lo confirmaría: levantar la pila y mandar 11 logins fallidos desde una máquina; después, un login válido desde otra IP debería recibir 429.
**Solución propuesta:** `app.set("trust proxy", <saltos>)` configurable (`TRUST_PROXY`, por defecto el número de proxies del despliegue, 1 con nginx; nunca `true` a secas, que dejaría falsificar `X-Forwarded-For`). Añadir un test con la cabecera `X-Forwarded-For` y una prueba de que, sin `trust proxy`, la cabecera se ignora. Opcional: limitar también el login por cuenta (correo normalizado), no solo por IP.
**Criterio de aceptación:** dos clientes con distinta `X-Forwarded-For` a través de nginx tienen cubos separados, y 10 fallos desde una IP no bloquean el login de otra.

## Matriz de autorización

Fuente: `trabajo/superficie.md` (113 filas HTTP/Swagger: 112 rutas más el montaje de Swagger) más el comando CLI. `requireAuth` está en un `router.use` previo a las rutas de cada módulo (línea indicada); `permitir("…")` aplica la fila de `PERMISOS` (`src/contratos/api.ts`) mediante `requireRole`, que lee el rol **de la base** en cada petición (`auth.middleware.ts:18-37`), no del JWT. **Por objeto:** salvo notificaciones y perfil propio, ningún recurso del sistema tiene propietario (inventario, catálogo, clientes y ventas son globales para el personal): no hay IDOR entre cuentas del mismo rol que comprobar, y las cuentas con permiso ven lo mismo. Eso es una decisión de diseño; su riesgo con cuentas autoregistradas es P-02-01. Veredicto «correcta» = autenticación y rol correctos para quien debería usar la ruta; las notas indican dónde interviene un hallazgo.

Leyenda de grupos: TODOS = ADMIN, USER, WAREHOUSE, SELLER · SOLO_ADMIN = ADMIN · ALMACEN = ADMIN, WAREHOUSE · MOSTRADOR = ADMIN, SELLER. `RA:n` = `requireAuth` en `router.use` de la línea n.

| ID | Punto de entrada | Roles que deberían usarlo | Comprobación (archivo:línea) | Veredicto |
|---|---|---|---|---|
| E-001 | GET /audit-logs | SOLO_ADMIN | RA `audit-logs.routes.ts:7`; permitir `:8` | correcta |
| E-002 | POST /auth/register | público (anónimo) | `auth.routes.ts:19`: limitador de registro + validate; sin auth | correcta como pública; consecuencia en P-02-01 |
| E-003 | POST /auth/verify-email | público (token de 256 bits en el cuerpo) | `auth.routes.ts:20`; token hasheado en `auth.service.ts:45-57` | correcta |
| E-004 | POST /auth/resend-verification | público | `auth.routes.ts:21`: limitador de registro (ver P-02-03); respuesta distingue cuenta inexistente (enumeración, Bajo) | correcta |
| E-005 | POST /auth/login | público | `auth.routes.ts:22`: `authStrictLimiter` (ver P-02-03); bcrypt 12 `hash.ts:4`; activo y verificado `auth.service.ts:83-84` | correcta; limitador en P-02-03 |
| E-006 | POST /auth/logout | cualquiera con sesión (o sin) | `auth.routes.ts:23`; CSRF activo (no exenta, `csrf.middleware.ts:16-24`); revoca solo el refresh de su cookie `auth.service.ts:166-176` | correcta |
| E-007 | GET /auth/me | cualquier sesión | `auth.routes.ts:24`: `requireAuth`; usa `req.userId` (`auth.controller.ts:117`) | correcta |
| E-008 | POST /auth/refresh | cookie de refresh | `auth.routes.ts:25`; rotación y reuso `auth.service.ts:100-164`; `isActive` `:148` (T1-12) | correcta |
| E-009 | POST /auth/forgot-password | público | `auth.routes.ts:26`: `authStrictLimiter`; respuesta genérica `auth.service.ts:180` | correcta |
| E-010 | POST /auth/reset-password | público (token) | `auth.routes.ts:27`; revoca sesiones `auth.service.ts:210-222` (T0-07) | correcta |
| E-011 | PUT /auth/me | cualquier sesión, solo su perfil | `auth.routes.ts:28`: `requireAuth`; id de la sesión `auth.controller.ts:136`. No pide contraseña para cambiar el correo (debajo del umbral, ver Hipótesis) | correcta |
| E-012 | PATCH /auth/me/password | cualquier sesión | `auth.routes.ts:29`; exige la contraseña actual `auth.service.ts:299-300`; revoca refresh `:305` | correcta |
| E-013 | PATCH /auth/me/idioma | cualquier sesión | `auth.routes.ts:32`: `requireAuth` | correcta |
| E-014 | GET /brands | TODOS | RA `brands.routes.ts:9`; permitir `:11` | correcta |
| E-015 | GET /brands/:id | TODOS | RA `:9`; permitir `:12` | correcta |
| E-016 | POST /brands | SOLO_ADMIN | RA `:9`; permitir `:13` | correcta |
| E-017 | PUT /brands/:id | SOLO_ADMIN | RA `:9`; permitir `:14` | correcta |
| E-018 | DELETE /brands/:id | SOLO_ADMIN | RA `:9`; permitir `:15` | correcta |
| E-019 | GET /categories | TODOS | RA `categories.routes.ts:9`; permitir `:11` | correcta |
| E-020 | GET /categories/:id | TODOS | RA `:9`; permitir `:12` | correcta |
| E-021 | POST /categories | SOLO_ADMIN | RA `:9`; permitir `:13` | correcta |
| E-022 | PUT /categories/:id | SOLO_ADMIN | RA `:9`; permitir `:14` | correcta |
| E-023 | DELETE /categories/:id | SOLO_ADMIN | RA `:9`; permitir `:15` | correcta |
| E-024 | GET /customers | personal autorizado (hoy TODOS) | RA `customers.routes.ts:9`; permitir `:11` | correcta según matriz; exposición a autoregistrados en P-02-01 |
| E-025 | GET /customers/:id | idem | RA `:9`; permitir `:12` | correcta según matriz; ver P-02-01 |
| E-026 | POST /customers | SOLO_ADMIN | RA `:9`; permitir `:13` | correcta |
| E-027 | PUT /customers/:id | SOLO_ADMIN | RA `:9`; permitir `:14` | correcta |
| E-028 | DELETE /customers/:id | SOLO_ADMIN | RA `:9`; permitir `:15` | correcta |
| E-029 | GET /inventory-counts | TODOS | RA `inventory-counts.routes.ts:9`; permitir `:11` | correcta |
| E-030 | POST /inventory-counts | ALMACEN | RA `:9`; permitir `:12` | correcta |
| E-031 | GET /inventory-counts/:id | TODOS | RA `:9`; permitir `:13` | correcta |
| E-032 | GET /inventory-counts/:id/lines | TODOS | RA `:9`; permitir `:14` | correcta |
| E-033 | PATCH /inventory-counts/:id/lines | ALMACEN | RA `:9`; permitir `:15`; validador acotado (`inventory-counts.validator.ts:16-29`) | correcta |
| E-034 | POST /inventory-counts/:id/close | ALMACEN | RA `:9`; permitir `:16`; el ajuste de stock que dispara no se revisó (ver Para escalar) | correcta (autorización) |
| E-035 | POST /inventory-counts/:id/cancel | ALMACEN | RA `:9`; permitir `:17` | correcta |
| E-036 | GET /notifications | TODOS, solo las propias | RA `notifications.routes.ts:14`; permitir `:16`; `where: { userId }` (`notifications.service.ts:65-67`) | correcta (por objeto: sí) |
| E-037 | GET /notifications/unread-count | TODOS, solo las propias | limitador de sondeo `:12`, RA `:14`; permitir `:17`; cuenta por `userId` (`notifications.service.ts:57-59`); el mantenimiento global corre en una petición cualquiera (`notifications.service.ts:181-191`) sin datos del llamante | correcta |
| E-038 | POST /notifications/read-all | TODOS, solo las propias | RA `:14`; permitir `:19`; `where: { userId }` (`notifications.service.ts:93`) | correcta (por objeto: sí) |
| E-039 | POST /notifications/:id/read | TODOS, solo las propias | RA `:14`; permitir `:20`; `findFirst({ id, userId })` y 404 (`notifications.service.ts:84-90`) | correcta (por objeto: sí) |
| E-040 | GET /products | TODOS | RA `product.routes.ts:16`; permitir `:19` | correcta |
| E-041 | GET /products/export | TODOS | RA `:16`; permitir `:20`; tope de filas `exportacion.ts:76`; celdas con guarda de fórmulas `csv.ts:17` | correcta |
| E-042 | GET /products/lookup | TODOS | RA `:16`; permitir `:22` | correcta |
| E-043 | GET /products/labels | TODOS | RA `:16`; permitir `:23`; tope de etiquetas `product.service.ts:272-282` | correcta |
| E-044 | GET /products/:id | TODOS | RA `:16`; permitir `:24` | correcta |
| E-045 | GET /products/:id/movements | TODOS | RA `:16`; permitir `:25` | correcta |
| E-046 | GET /products/:id/movements/export | TODOS | RA `:16`; permitir `:26` | correcta |
| E-047 | GET /products/:id/price-history | TODOS | RA `:16`; permitir `:27` | correcta |
| E-048 | GET /products/:id/cost-history | TODOS | RA `:16`; permitir `:28` (costes visibles a todos los roles: decidido, «lee lo mismo que USER») | correcta según matriz |
| E-049 | GET /products/:id/lots | TODOS | RA `:16`; permitir `:30` | correcta |
| E-050 | POST /products/import | SOLO_ADMIN | RA `:16`; permitir `:33`; el parser JSON de 5 MB (`app.ts:66`) corre **antes** de `requireAuth` (debajo del umbral) | correcta |
| E-051 | POST /products | SOLO_ADMIN | RA `:16`; permitir `:36` **antes** de `upload.single` (multer solo corre para ADMIN); firma `upload.middleware.ts:94-103` | correcta |
| E-052 | PUT /products/:id | SOLO_ADMIN | RA `:16`; permitir `:37`; igual que E-051 | correcta |
| E-053 | DELETE /products/:id | SOLO_ADMIN | RA `:16`; permitir `:38` | correcta |
| E-054 | PATCH /products/:id/restore | SOLO_ADMIN | RA `:16`; permitir `:39` | correcta |
| E-055 | POST /products/:id/movements | ALMACEN | RA `:16`; permitir `:40`; validador `product.validator.ts:129-145` | correcta |
| E-056 | PATCH /products/bulk-stock | ALMACEN | RA `:16`; permitir `:41`; validador `:147-158` (sin tope superior de líneas, Bajo) | correcta |
| E-057 | GET /purchase-orders | TODOS | RA `purchase-orders.routes.ts:14`; permitir `:16` | correcta |
| E-058 | GET /purchase-orders/export | SOLO_ADMIN | RA `:14`; permitir `:17` | correcta |
| E-059 | GET /purchase-orders/suggestions | TODOS | RA `:14`; permitir `:19` | correcta |
| E-060 | POST /purchase-orders/suggestions | SOLO_ADMIN | RA `:14`; permitir `:20` | correcta |
| E-061 | GET /purchase-orders/:id | TODOS | RA `:14`; permitir `:21` | correcta |
| E-062 | POST /purchase-orders | SOLO_ADMIN | RA `:14`; permitir `:22` | correcta |
| E-063 | POST /purchase-orders/:id/receipts | ALMACEN | RA `:14`; permitir `:23`; la recepción recalcula el coste medio (servicio no abierto) | correcta (autorización) |
| E-064 | PATCH /purchase-orders/:id | SOLO_ADMIN | RA `:14`; permitir `:24` | correcta |
| E-065 | DELETE /purchase-orders/:id | SOLO_ADMIN | RA `:14`; permitir `:25` | correcta |
| E-066 | GET /reports | TODOS | RA `reports/index.ts:7`; permitir `:8` | correcta |
| E-067 | GET /reports/period | TODOS | RA `:7`; permitir `:9`; SQL con parámetros | correcta |
| E-068 | GET /reports/abc | TODOS | RA `:7`; permitir `:10` | correcta |
| E-069 | GET /reports/expiring | TODOS | RA `:7`; permitir `:11` | correcta |
| E-070 | GET /sale-orders | TODOS | RA `sale-orders.routes.ts:9`; permitir `:11` | correcta según matriz; ver P-02-01 |
| E-071 | GET /sale-orders/export | SOLO_ADMIN | RA `:9`; permitir `:12`; guarda de fórmulas `csv.ts:17` | correcta |
| E-072 | GET /sale-orders/:id | TODOS | RA `:9`; permitir `:13` | correcta según matriz; ver P-02-01 |
| E-073 | GET /sale-orders/:id/receipt | TODOS | RA `:9`; permitir `:15`; logo solo de `res.cloudinary.com`, sin redirecciones (`logoDelNegocio.ts:33-63`) | correcta |
| E-074 | POST /sale-orders | SOLO_ADMIN | RA `:9`; permitir `:16`; `unitPrice` del cliente, correcto al ser solo ADMIN | correcta |
| E-075 | POST /sale-orders/counter | MOSTRADOR | RA `:9`; permitir `:19`; `counterSaleSchema` no declara precio (`sale-orders.validator.ts:29-46`); precio y nombre del producto con fila bloqueada (`sale-orders.service.ts:371,394-403`); `createdByEmail` de la sesión (`:392`) | correcta |
| E-076 | POST /sale-orders/:id/ship | ALMACEN | RA `:9`; permitir `:23`; el controlador fija `status: "SHIPPED"` (`sale-orders.controller.ts:95`) | correcta |
| E-077 | PATCH /sale-orders/:id | SOLO_ADMIN | RA `:9`; permitir `:24`. La transición `SHIPPED → PENDING` se acepta sin devolver stock (ver Para otras áreas) | correcta en autorización |
| E-078 | DELETE /sale-orders/:id | SOLO_ADMIN | RA `:9`; permitir `:25`; no borra enviadas (`sale-orders.service.ts:533`) | correcta |
| E-079 | GET /settings | SOLO_ADMIN | RA `settings.routes.ts:10`; permitir `:12` | correcta |
| E-080 | PATCH /settings | SOLO_ADMIN | RA `:10`; permitir `:13`; `.strict()` y solo claves del catálogo (`settings.validator.ts:77-82`) | correcta |
| E-081 | GET /settings/business | TODOS | RA `:10`; permitir `:16`; solo claves de negocio y logo | correcta |
| E-082 | PUT /settings/logo | SOLO_ADMIN | RA `:10`; permitir `:17` antes de `upload.single`; firma de imagen; el servidor guarda lo que devuelve Cloudinary (`settings.service.ts:263-277`) | correcta |
| E-083 | DELETE /settings/logo | SOLO_ADMIN | RA `:10`; permitir `:18` | correcta |
| E-084 | GET /stock-transfers | TODOS | RA `stock-transfers.routes.ts:9`; permitir `:11` | correcta |
| E-085 | GET /stock-transfers/:id | TODOS | RA `:9`; permitir `:12` | correcta |
| E-086 | POST /stock-transfers | ALMACEN | RA `:9`; permitir `:13`; productos bloqueados, disponible y líneas únicas (`stock-transfers.service.ts:123-150`, validador `:12-23`) | correcta |
| E-087 | GET /suppliers | TODOS | RA `suppliers.routes.ts:9`; permitir `:11` | correcta |
| E-088 | GET /suppliers/:id | TODOS | RA `:9`; permitir `:12` | correcta |
| E-089 | POST /suppliers | SOLO_ADMIN | RA `:9`; permitir `:13` | correcta |
| E-090 | PUT /suppliers/:id | SOLO_ADMIN | RA `:9`; permitir `:14` | correcta |
| E-091 | DELETE /suppliers/:id | SOLO_ADMIN | RA `:9`; permitir `:15` | correcta |
| E-092 | GET /tags | TODOS | RA `tags.routes.ts:9`; permitir `:11` | correcta |
| E-093 | GET /tags/:id | TODOS | RA `:9`; permitir `:12` | correcta |
| E-094 | POST /tags | SOLO_ADMIN | RA `:9`; permitir `:13` | correcta |
| E-095 | PUT /tags/:id | SOLO_ADMIN | RA `:9`; permitir `:14` | correcta |
| E-096 | DELETE /tags/:id | SOLO_ADMIN | RA `:9`; permitir `:15` | correcta |
| E-097 | GET /users | SOLO_ADMIN | RA `users.routes.ts:11`; permitir `:13`; `USER_SELECT` sin hashes ni tokens (`users.service.ts:19-28`) | correcta |
| E-098 | POST /users | SOLO_ADMIN | RA `:11`; permitir `:15`; `{name,email,role}` explícitos (`users.controller.ts:17`); sin contraseña por correo | correcta |
| E-099 | GET /users/:id | SOLO_ADMIN | RA `:11`; permitir `:16` | correcta |
| E-100 | PATCH /users/:id/role | SOLO_ADMIN | RA `:11`; permitir `:19`; no el propio (`users.service.ts:111`); el rol se lee de la base en cada petición. Sin registro de auditoría del cambio de rol (debajo del umbral) | correcta |
| E-101 | PATCH /users/:id/activate | SOLO_ADMIN | RA `:11`; permitir `:25` | correcta |
| E-102 | PATCH /users/:id/deactivate | SOLO_ADMIN | RA `:11`; permitir `:26`; anula el refresh (`users.service.ts:124-127`); `requireAuth` corta el acceso (`auth.middleware.ts:30`) | correcta |
| E-103 | GET /warehouses | TODOS | RA `warehouses.routes.ts:9`; permitir `:11` | correcta |
| E-104 | GET /warehouses/summary | TODOS | RA `:9`; permitir `:12` | correcta |
| E-105 | POST /warehouses | SOLO_ADMIN | RA `:9`; permitir `:13` | correcta |
| E-106 | PUT /warehouses/:id | SOLO_ADMIN | RA `:9`; permitir `:14` | correcta |
| E-107 | PATCH /warehouses/:id/default | SOLO_ADMIN | RA `:9`; permitir `:15` | correcta |
| E-108 | PATCH /warehouses/:id/activate | SOLO_ADMIN | RA `:9`; permitir `:16` | correcta |
| E-109 | PATCH /warehouses/:id/deactivate | SOLO_ADMIN | RA `:9`; permitir `:17` | correcta |
| E-110 | GET /health | público | `routes/index.ts:34`: sin datos | correcta |
| E-111 | GET /ready | público | `routes/index.ts:48`: solo `SELECT 1`; el error no se devuelve | correcta |
| E-112 | GET /metrics | Prometheus, con token | `routes/index.ts:73-100`: `METRICS_TOKEN` con `timingSafeEqual`; en producción sin token → 404 | correcta |
| E-113 | /api/v1/docs (Swagger) | solo desarrollo | `app.ts:86-88`: solo si `NODE_ENV !== "production"` | correcta |
| CLI | `resumen-semanal.ts` (`pnpm resumen:enviar`) | operador del sistema (cron externo) | no es alcanzable por red; solo corre al invocar el archivo (`:53-58`); envía a administradores activos si el ajuste está activo | correcta |

**Cobertura:** 114 de 114 puntos de entrada revisados (113 filas HTTP/Swagger de `superficie.md` y el comando CLI). Rutas HTTP «falta»: 0; «no se pudo determinar»: 0. Hay cuatro puntos con matiz que no cambian el veredicto de autorización: E-002 y E-024/E-025/E-070/E-072 (P-02-01), y E-005 con los demás de `/auth` limitados por P-02-03; y E-077 (Para otras áreas). Frontend: de las 35 rutas de la SPA, 5 llevan guarda de rol o permiso (`requireRole`/`requirePermiso`) y es solo experiencia de usuario; el backend vuelve a decidir en todas (`ProtectedRoute.tsx:45-46` vs `permitir`).
**Middlewares globales (13):** leídos y valorados 11 (`helmet()`, `cors`, `pinoHttp`, los tres analizadores de cuerpo, `cookieParser`, limitador global, CSRF, `errorHandler`, Swagger condicional). Sin abrir: `metricas.middleware.ts` y `notFound.middleware.ts`.

## Hipótesis por verificar

1. **Cabeceras de seguridad de la SPA** (candidato Medio; verificar en ejecución). `Stockly-F/nginx.conf` no añade ninguna cabecera: ni CSP, ni `X-Frame-Options`/`frame-ancestors`, ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni HSTS. Helmet solo cubre las respuestas de la API, no el HTML ni los activos. La app es de ventas y con sesión por cookie, así que el clickjacking sobre botones destructivos y la falta de CSP como segunda línea contra XSS son relevantes. Una CSP tendrá que contemplar el script en línea del tema (`index.html`, bloque que lee `localStorage` `stockly:tema`), por hash `sha256` o `nonce`, y las imágenes de `res.cloudinary.com`. Lo confirmaría `curl -I` contra la pila. No hay XSS conocido: el frontend no usa `dangerouslySetInnerHTML` ni `innerHTML`, y `imageUrl` solo contiene URLs que devolvió Cloudinary.
2. **`NODE_ENV=test` es un valor admitido por `validateEnv`** (`env.ts:19,100`). Un despliegue con ese valor por error apaga el CSRF (`csrf.middleware.ts:28`), los limitadores de auth (`rateLimiter.middleware.ts:45,58,68`) y el global (`app.ts:77`). Poco probable (Bajo); se mitiga negándose a arrancar con `test` fuera de Jest.
3. **Refresh no atómico** (ver *Para escalar*): dos refrescos simultáneos con el mismo token (dos pestañas) pueden terminar con una sesión perdida por «reuso», y un token robado usado a la vez que el legítimo no siempre dispara la alarma. Requiere ejecución con peticiones paralelas.

**Debajo del umbral de la profundidad rápida (Medio o Bajo; no puntúan, se dejan anotados para la consolidación):**
- `PUT /auth/me` cambia el correo sin pedir la contraseña actual ni revocar el refresh (`auth.service.ts:258-286`). Con una cookie robada, el atacante cambia el correo, pide «olvidé mi contraseña» y se queda con la cuenta (Medio).
- El parser JSON de 5 MB de `/products/import` corre antes de `requireAuth` (`app.ts:66`): un anónimo puede obligar a parsear 5 MB por petición, limitado por el limitador global (Bajo-Medio; empeora con P-02-03).
- Enumeración de cuentas: `register` (409 `EMAIL_ALREADY_REGISTERED`), `resend-verification` (400 distinto), `POST /users` (409) y el login, que solo compara la contraseña si el usuario existe (diferencia de tiempo) (Bajo).
- El JWT de acceso (15 min) sigue siendo válido tras cerrar sesión, cambiar o restablecer la contraseña; solo se revoca el refresh (Bajo; aceptado habitualmente).
- El cambio de rol (`PATCH /users/:id/role`) no se registra en la auditoría (A09; Bajo-Medio).
- `bulk-stock` no tiene tope máximo de líneas (el cuerpo de 100 kB lo acota en la práctica) (Bajo).

## Pendiente de verificar en ejecución

- Cabeceras y CSP efectivas: nginx (SPA y `/api/`) y backend (Helmet). Comprobar también `X-Request-Id` devuelto y que `/api/v1/metrics` no responde sin token a través de nginx.
- Atributos de las cookies `token`, `refreshToken` (ruta `/api/v1/auth/refresh`) y `csrfToken` en la pila del compose (`COOKIE_SECURE=false`, `SameSite=Lax`, solo HTTP) y en la configuración por defecto de producción (`Secure`, `SameSite=None`). CORS efectivo con `FRONTEND_URL`.
- P-02-01: registrar y verificar una cuenta nueva, y pedir `GET /customers`, `/sale-orders`, `/reports`; anotar qué campos devuelve (documento, correos de vendedores).
- P-02-03: 11 logins fallidos desde una máquina y un login válido desde otra IP a través de nginx; y 100 peticiones en 15 min de dos cuentas.
- Propiedades de más en las respuestas: `costPrice`, `unitCost` y `createdByEmail` que ve cada rol (SELLER y USER); `GET /settings/business` con `taxId`; `GET /products/export` para todos los roles.
- IDOR entre dos cuentas del mismo rol: aplica a notificaciones (`/:id/read` con el id de otra cuenta: esperado 404) y al perfil; el resto de recursos no tiene propietario.
- Subidas reales con multer (los tests lo simulan): archivo > 2 MB (413), ejecutable renombrado como `.png` (422), WebP truncado, y el logo con Cloudinary de verdad.
- Transición `SHIPPED → PENDING` con `PATCH /sale-orders/:id` (ver *Para otras áreas*): comprobar el stock antes y después de un segundo envío.

## Para escalar

- **Integridad del stock bajo concurrencia** (`shared/lib/stock.ts`, `stockComprometido.ts`, `lotes.ts`, `inventory-counts.service.ts` en el cierre, `purchase-orders.service.ts` en la recepción): el diseño es sólido en lo que leí (bloqueo ordenado `FOR UPDATE`, decremento condicional del ADR 0001), pero el cierre de un conteo físico, el FEFO por lotes y la recepción parcial son flujos que cruzan varios módulos y que no abrí. Qué mirar: que ningún ajuste ni cierre pueda dejar el stock negativo o inflado con peticiones simultáneas o repetidas (idempotencia de `close`/`cancel`), y que `lotId` de otro producto no sea aceptado en movimientos.
- **Rotación de refresh no atómica** (`auth.service.ts:100-164`): `findFirst` y luego `update` sin condición. Revisar una actualización condicional (`updateMany where refreshToken = hash`) y el efecto de dos refrescos simultáneos.
- **Autorización indirecta del mostrador**: un `SELLER` crea clientes por el correo de la venta (`clienteDeLaVenta`, `sale-orders.service.ts:92-105`, `upsert`) aunque `POST /customers` sea solo ADMIN. Parece decidido (T5-06), pero conviene confirmar qué datos puede inyectar en la agenda (nombre, teléfono, documento) y si eso debe pasar por la misma validación que `createCustomerSchema`.
- **SQL compuesto de los informes** (`reports.service.ts`, 762 líneas, `reports.abc.ts`, `reposicion.service.ts`): ninguna llamada usa `Raw`/`Unsafe`, y todo lo que interpola es parámetro de plantilla etiquetada, pero la composición con `Prisma.sql`/`Prisma.join` anidada merece una pasada completa con más capacidad.

## Puntos fuertes

- **Autorización por función, uniforme y comprobada:** 97 rutas con `permitir("MÉTODO /ruta")` desde una única matriz, el rol leído de la base en cada petición (un cambio de rol o una desactivación surten efecto de inmediato), `permisos.test.ts` recorre las rutas montadas, y multer solo corre para quien ya pasó `permitir` (el cuerpo multipart no lo parsea un anónimo).
- **Sesión:** cookies httpOnly, refresh rotado con detección de reuso y hashes SHA-256 en base (ADR 0002), cookie de refresh con ruta restringida (ADR 0003), CSRF de doble envío con lista explícita de rutas exentas, bcrypt con 12 rondas, reset que revoca las sesiones, y tokens de 256 bits de `crypto.randomBytes`.
- **Dinero e integridad:** el mostrador no admite precio ni nombre del cliente, los lee del producto con la fila bloqueada; el impuesto se congela por línea; el envío usa decremento condicional y disponible menos comprometido.
- **Entradas del exterior:** firma de imágenes por magic bytes, límites de cuerpo por ruta, `traerLogoDelNegocio` cerrado (HTTPS, host fijo, sin redirecciones, 3 s, 2 MB, PNG/JPEG por firma) y la URL del logo fuera del catálogo editable; saneado de CSV contra inyección de fórmulas; HTML de los correos con `escapeHtml`; `.strict()` en ajustes; 94 usos de SQL crudo, todos parametrizados.
- **Errores y registro:** el manejador no filtra trazas ni rutas en producción (`error.middleware.ts:73-110`), el log redacta `authorization`, `cookie` y `set-cookie` (`logger.ts:53-62`), el reuso de refresh queda en auditoría. Swagger apagado y `/metrics` cerrado en producción.
- **Frontend:** token solo en cookie httpOnly, sin almacenamiento local de sesión; `localStorage` solo para tema, idioma y almacén preferido; sin HTML sin escapar; guardias de ruta con la misma matriz que el backend.

**Re-auditoría: tareas de seguridad cerradas, comprobadas en el código**

| Tarea | Resultado | Dónde |
|---|---|---|
| T0-06 credencial en el E2E | sigue resuelta: `smoke.spec.ts` usa `EMAIL`/`PASSWORD` de `helpers.ts` (variables de entorno o credenciales del seed documentado); sin credencial personal en HEAD | `Stockly-F/e2e/helpers.ts:6-17` |
| T0-07 reset revoca sesiones | sigue resuelta (`refreshToken` y `refreshExpires` a `null`; `previousRefreshToken` queda, sin efecto) | `auth.service.ts:210-222` |
| T1-11 `isActive` en `requireAuth` | sigue resuelta | `auth.middleware.ts:30-33` |
| T1-12 `isActive` en refresh | sigue resuelta | `auth.service.ts:148-150` |
| T1-19 lista CSRF explícita | sigue resuelta (7 rutas exactas; `logout`, `PUT /me` y `PATCH /me/password` protegidas) | `csrf.middleware.ts:16-24,40` |
| T1-20 TLS en SMTP | sigue resuelta (`secure` en 465, `requireTLS: true`, sin `rejectUnauthorized: false`) | `nodemailer.ts:59-65` |
| T1-21 contenedor sin root | sigue resuelta en el backend (`USER node`) | `Dockerfile` etapa `runner` |
| T1-22 sin ADMIN automático | sigue resuelta (`role: "USER"`), pero abre P-02-01 y P-02-02 | `auth.service.ts:30-40` |
| T2-31 reuso de refresh | sigue resuelta (con la reserva de *Para escalar*) | `auth.service.ts:100-164` |
| T2-32 magic bytes | sigue resuelta; el test llama al middleware directamente | `upload.middleware.ts:61-103`, `image-signature.test.ts` |
| T2-33 límites de cuerpo | sigue resuelta; el parser específico va antes del general | `app.ts:63-68` |

Ninguna regresión («regresión de T…») ni «cerrada en falso». Sin credencial nueva en el historial según `secretos-historial.md` (escaneo parcial).

## Para otras áreas

- **Área 1 (corrección) · Integridad del stock, Medio:** `PATCH /sale-orders/:id` con `{ "status": "PENDING" }` sobre una orden `SHIPPED` pasa por la rama de «actualización simple» (`sale-orders.service.ts:446-452`): cambia el estado sin devolver el stock ni los lotes (la guarda `CANNOT_REOPEN_RECEIVED_ORDER` de las compras no tiene equivalente) y un segundo `POST /:id/ship` descuenta otra vez. Solo ADMIN, solo con una petición a mano (la interfaz no lo ofrece); por eso no es Alto. Falta un test.
- **Área 12 (infraestructura):** `docker-compose.yml` publica también el puerto 3000 del backend en el host (`BACKEND_HOST_PORT`), de modo que se puede saltar nginx; contraseña de la base `postgres` por defecto en el compose de desarrollo; `COOKIE_SECURE=false` fijo en la pila local (documentado). `Stockly-F/nginx.conf` sirve en el puerto 80 sin TLS ni cabeceras (cabeceras en Hipótesis 1).
- **Documentación:** `README.md:235` dice «por IP» para los límites, lo que no es cierto detrás de nginx (P-02-03); `legal.md §2.1` y `README.md:234` deben reflejar lo que decida P-02-01.
