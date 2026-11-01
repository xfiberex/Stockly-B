# Auditoría · Stockly · 2026-10-31

> Re-auditoría. La anterior es la del 2026-08-04 ([historico/INFORME-AUDITORIA.md](../../historico/INFORME-AUDITORIA.md)), cuyas 139 tareas están cerradas. Fase 1 hecha en cuatro sesiones, del 2026-10-31 al 2026-11-01. El punto de control de todo el trabajo es [trabajo/progreso.md](trabajo/progreso.md).

## 0. Alcance acordado

- **Commits auditados**, los dos en `main` y con el árbol limpio:
  - `Stockly-B` (backend): `8fccbd460b3d8244ebca608c02e09e77fa162eeb`;
  - `Stockly-F` (frontend): `424e39746036d3753651e8756a83bbe5b04afc4b`.
  - La carpeta que los contiene no es un repositorio. La auditoría vive en `Stockly-B/docs/auditoria/`, por la convención del proyecto: la documentación de los dos repos está en `Stockly-B/docs/`.
  - Rutas del informe: `src/…` es el backend; `Stockly-F/…` es el frontend.
- **Áreas incluidas:** 1 Código · 2 Seguridad · 3 Rendimiento · 5 Accesibilidad · 7 Arquitectura, datos y resiliencia · 8 QA y testing · 12 DevOps.
- **Áreas excluidas:**
  - 4 SEO: no aplica (aplicación privada tras el login, ya declarada no indexable en T3-12);
  - 14 IA: no aplica (el producto no integra modelos de lenguaje);
  - 6 UI/UX, 9 Refactorización, 10 Redacción, 11 Documentación y 13 Legal: opcionales no elegidas. **La 13 se recomienda antes del primer despliegue:** hay datos personales, y `docs/legal.md` §2 ya lista lo pendiente.
- **Profundidad:** rápida. Solo puntúan Crítico y Alto. La revisión se dirigió por riesgo: dinero, stock, autenticación y roles, entradas del exterior y lo nuevo de los Tiers 5 y 6.
- **Fuera del código revisado:**
  - `node_modules/`, `dist/`, `coverage/` y los lockfiles (estos, salvo para el análisis de dependencias);
  - `.agents/`, `.claude/` y `.codegraph/`, salvo lo que ejecutan;
  - el código generado de Prisma (`src/generated/prisma`) y `Stockly-F/src/shared/contratos/api.generated.ts`, que es copia de `src/contratos/api.ts`;
  - `docs/historico/`;
  - las migraciones que no necesitó el área 7.
- **Tamaño:** unas 74.000 líneas sin código generado, de ellas unas 32.000 de tests.

**Verificación por área**

| Área | Verificación | Qué se ejerció o por qué no |
|---|---|---|
| 1 Código | solo estática | Acordado |
| 2 Seguridad | estática y ejecución | API local con el build de producción y la base aislada: registro y lectura de clientes, limitadores con `X-Forwarded-For`, cuerpo gzip, cabeceras, cookies y CORS |
| 3 Rendimiento | solo estática | La traza del navegador no se hizo (sin el servidor de DevTools acordado y fuera de los flujos críticos). La carga quedó fuera en la Fase 0 |
| 5 Accesibilidad | estática y ejecución parcial | Mostrador completo con teclado y árbol de accesibilidad (Playwright, build de producción). Sin lector de pantalla real; el resto de pantallas no se recorrió |
| 7 Arquitectura | estática y ejecución | Carreras de P-07-01 con el bloqueo retenido, esquema real tras `migrate deploy` y disparador diferido |
| 8 QA y testing | estática y ejecución | Suites de los dos repos en la línea base; E2E completo en la base aislada |
| 12 DevOps | solo estática | `docker compose build` y `config` no se ejecutaron (fuera de los flujos críticos). Estado de la CI con `gh`, solo lectura |

**Muestreo.** Cada archivo de `trabajo/hallazgos/` dice qué se leyó entero, qué por muestra y qué no se abrió.
- **Entero:** lo que mueve stock y dinero (`src/shared/lib/stock.ts`, `lotes.ts` y los servicios de ventas, compras, conteos y transferencias), la autenticación, los middlewares, la matriz de permisos, los Dockerfile, los compose, `nginx.conf` y las pantallas de Mostrador, Transferencias, Almacenes y Caducidades.
- **Sin abrir:** `reports.abc.ts`, `reports.pdf.ts`, `load/`, `swagger*.ts`, la mayoría de los componentes del frontend y el cuerpo de la mayoría de los 148 archivos de test, de los que se revisaron la estructura y las aserciones.

**Superficie (área 2): 114 de 114 puntos de entrada revisados**, con la matriz de autorización completa:
- 113 rutas HTTP o Swagger de [trabajo/superficie.md](trabajo/superficie.md) y un comando de consola;
- 0 rutas con autorización ausente y 0 sin determinar;
- las 97 claves de `permitir(...)` coinciden con la tabla `PERMISOS`.

**Modelos**

| Encargo | Subagente | Modelo · esfuerzo |
|---|---|---|
| Línea base e inventario de la superficie | `recolector-datos` | Haiku 5.5 · low |
| Áreas 2 y 7 | `auditor-area` | Sonnet 5.5 · high |
| Áreas 1, 3, 5, 8 y 12 | `auditor-area` | Sonnet 5.5 · medium |
| Verificación independiente: tres encargos, 12 hallazgos | `verificador-hallazgos` | Sonnet 5.5 · high |
| Fase 0, ejecución, consolidación e informe | conversación principal | Opus 5.5 |

- **Único relanzamiento:** el área 2 tuvo una segunda pasada acotada a las dependencias, con el mismo modelo, porque la línea base no existía cuando terminó la primera.
- **Lo que no se cumplió del plan:** el servidor `chrome-devtools-auditoria` acordado no cargó en las sesiones abiertas desde VS Code. La parte de navegador se hizo con el Playwright 1.61.1 que ya trae `Stockly-F`, sin telemetría ni instalación nueva.

**Supuestos** (de la Fase 0, sin objeción del usuario):
- Herramienta interna de inventario y punto de venta para un comercio con sucursales, con 4 roles (ADMIN, USER, WAREHOUSE y SELLER).
- Sin versión publicada ni usuarios reales. Escala de referencia: la de las pruebas de carga del proyecto (100.000 productos y 330.000 órdenes).
- Despliegue previsto con Docker Compose (PostgreSQL 17, backend y nginx). Sin despliegue real que observar.
- Jurisdicción no declarada; los ejemplos usan ITBIS y RD$.
- Navegadores recientes. Se verificó solo en Chromium.
- Producto en español e inglés; informe en español.

## 1. Resumen ejecutivo

**Veredicto de release:** bloqueado

El núcleo está bien construido:
- autorización por función desde una única matriz, revisada en 114 de 114 puntos de entrada;
- sesión con cookies `httpOnly`, rotación del refresh y CSRF;
- el stock se escribe en un solo sitio, y la base lo vigila con un disparador diferido, que la ejecución confirmó;
- 1.652 tests en el backend, 911 en el frontend y 42 escenarios E2E.

Las 139 tareas de la auditoría anterior siguen cerradas, sin regresiones. Pero hay seis defectos que conviene cerrar antes del primer despliegue, y uno lo bloquea. Casi todos nacen de lo añadido en los Tiers 5 y 6 o de la configuración de despliegue.

Los cinco más graves:
1. **AUD-001 · Crítico.** El registro abierto da a cualquiera una cuenta `USER` que lee los datos personales de todos los clientes y todas las ventas. Reproducido.
2. **AUD-005 · Alto.** Las ventas no tienen máquina de estados bajo bloqueo. Dos envíos o dos cancelaciones simultáneos descuentan o devuelven el stock dos veces, y `PATCH` acepta `SHIPPED → PENDING`. Reproducido.
3. **AUD-002 · Alto.** Detrás de nginx, los limitadores llevan un solo contador para todos: 10 logins anónimos fallidos dejan sin acceso a todo el comercio durante 15 minutos. Reproducido.
4. **AUD-003 · Alto.** El seed, que la documentación manda ejecutar para desplegar, crea administradores con contraseña pública y vacía la base sin ninguna guarda.
5. **AUD-006 · Alto.** Un test con fecha fija tiene en rojo la puerta `pnpm verify` del backend desde el 2026-10-24. La puerta `auditoria` de los dos repos también está en rojo, por avisos de dependencias publicados después del 2026-10-11 (AUD-004 y las observaciones de Seguridad).

Lo demás encontrado es Medio o Bajo y no puntúa en una auditoría rápida. Va como observación sin ID en el apartado 3, con su corrección.

## 2. Puntuación por área

| Área | Nota | Profundidad · modelo | Anterior | Δ (completo, parcial o no comparable) | Verificación | Justificación |
|---|---|---|---|---|---|---|
| 1 · Código | 10 | rápida · Sonnet medium | 7,0 | no comparable | solo estática | Sin Crítico ni Alto. Tres observaciones de Medio a Bajo (orden con un producto desactivado y criterios del panel) |
| 2 · Seguridad | 2,5 | rápida · Sonnet high | 7,5 | no comparable | ejecución, estática | Un Crítico y tres Altos abiertos (AUD-001 a AUD-004); el Crítico pone un tope de 4 |
| 3 · Rendimiento | 10 | rápida · Sonnet medium | 6,0 | no comparable | solo estática | El panel contra el pool, ya conocido, quedó en Medio tras la verificación. Sin traza ni carga |
| 5 · Accesibilidad | 10 | rápida · Sonnet medium | 6,0 | no comparable | ejecución parcial, estática | Sin barreras que impidan completar una tarea. El foco no visible en la navegación y el foco perdido tras vender son Medio |
| 7 · Arquitectura | 7 | rápida · Sonnet high | 5,5 | no comparable | ejecución, estática | Un Alto abierto (AUD-005); el esquema y el disparador funcionan como dicen |
| 8 · QA y testing | 7 | rápida · Sonnet medium | 6,0 | no comparable | ejecución, estática | Un Alto abierto (AUD-006). Suites amplias y E2E de los Tiers 5 y 6 en verde |
| 12 · DevOps | 10 | rápida · Sonnet medium | 3,0 | no comparable | solo estática | El compose de producción sin TLS ni cookies seguras quedó en Medio tras la verificación; la pila se construye y tiene CI |

**Por qué el Δ no es comparable.** La auditoría anterior fue exhaustiva y no registra el modelo, y esta es rápida: solo cuenta Crítico y Alto. Un 10 aquí significa «sin Crítico ni Alto», no «sin defectos». La mejora real desde el 2026-08-04 está en el apartado 8.

## 3. Hallazgos

Ordenados por área y por severidad. Los IDs empiezan en AUD-001: el ROADMAP del proyecto conserva el esquema `T{tier}-{n}` para las tareas cerradas.

### AUD-001 · El registro abierto da a cualquiera una cuenta `USER` que lee los datos personales de todos los clientes y las ventas
**Área:** Seguridad · **Severidad:** Crítico · **Confianza:** Confirmado · **Verificación:** ejecución, estática · **Esfuerzo:** Bajo
**Ubicación:** `src/modules/auth/auth.routes.ts:19` (registro público, sin aprobación); `src/modules/auth/auth.service.ts:15-43` (crea `role: "USER"`; el login solo exige el correo verificado, `:84`); `src/contratos/api.ts:119-120` (`GET /customers` y `/:id` para `TODOS`), `:125,127,129` (ventas y comprobante), `:77` (`cost-history`), `:158-162` (informes) y `:174` (`GET /settings/business`); `Stockly-F/src/routes/index.tsx:60` (página de registro). Evidencia: [evidencias/ejecucion-api.json](evidencias/ejecucion-api.json), bloque `p0201`.
**Estado:** nuevo. Junta dos decisiones escritas que nadie combinó: el registro público como `USER` (T1-22, `README.md:234`, `docs/CONTEXTO.md:272`) y que `USER` lea clientes y ventas (T5-06, T6-06, `docs/legal.md:42-44`). T1-22 sigue resuelta: el registro no da ADMIN.
**Problema:**
- Cualquiera que reciba un correo puede crearse una cuenta: no hay aprobación, ni lista de dominios, ni un interruptor que cierre el registro.
- La cuenta nace `USER`, y `USER` está en el grupo `TODOS`, que lee:
  - los clientes con nombre, correo, teléfono, documento de identidad y notas;
  - todas las ventas, con los datos del cliente y el correo del empleado que las creó;
  - los comprobantes en PDF;
  - los costes, el histórico de costes y los márgenes;
  - los datos fiscales del negocio.
**Impacto:**
- En cuanto el despliegue sea alcanzable desde Internet (un comercio con varias sucursales lo necesita) y tenga clientes reales, cualquiera obtiene en minutos la agenda completa de clientes, con su documento de identidad, y el historial de ventas: es exposición masiva de datos personales (A01:2025 Broken Access Control; OWASP API1 y API5:2023; protección de datos según la jurisdicción).
- Es Crítico porque es el criterio literal de la rúbrica («explotable con cualquier cuenta, con exposición de datos personales») y está reproducido.
- La verificación independiente lo dejó en Alto porque aún no hay datos reales, pero anotó que la rúbrica pide Crítico. En una auditoría previa al primer despliegue, eso es lo que debe bloquear el release.
- CVSS v4.0 orientativo: `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N`.
**Evidencia:** 2026-11-01, en la base aislada, contra el build de producción:
- `POST /auth/register` con una cuenta nueva deja la fila creada con `role USER` y `isVerified false` (responde 500 porque el correo de prueba no sale; ver la observación de Arquitectura).
- Sin verificar, el login da 403 `EMAIL_NOT_CONFIRMED`. Tras marcar `isVerified`, que equivale a pulsar el enlace del correo, el login da 200, y `GET /customers`, `GET /sale-orders` y `GET /settings/business` dan 200.
- Con la cuenta `USER` del seed, del mismo rol:
  - los 4 clientes salen con `document`, `email`, `name`, `phone` y `notes`;
  - las 9 ventas (6 del seed y 3 de la prueba de AUD-005) salen con `customerDocument`, `customerEmail`, `customerPhone` y `createdByEmail`;
  - el comprobante da 200 (`application/pdf`).
- La verificación independiente no encontró ninguna mitigación en otra capa ([trabajo/verificacion.md](trabajo/verificacion.md)).
**Solución propuesta:** hay que tomar una decisión de producto y anotarla en `docs/CONTEXTO.md` §6. Las salidas, de la más barata a la más fina:
1. **Cerrar el registro público:**
   - el alta pasa a ser solo por invitación (`POST /users`, que ya existe);
   - `POST /auth/register` queda detrás de `REGISTRATION_ENABLED`, apagado por defecto, y la página se oculta.
2. **Si el registro abierto debe quedar,** la cuenta nace sin acceso (`isActive: false` o un rol sin permisos) hasta que un ADMIN la apruebe.
3. **Recortar lo que lee `TODOS`:** `GET /customers*` y los campos de cliente de las ventas, solo para quien vende o administra.

En cualquier caso, actualizar `docs/legal.md` §2.1 y `permisos.test.ts`.
**Criterio de aceptación:** se cumple una de las dos condiciones, y un test de integración la fija:
- una cuenta recién registrada y verificada recibe 403 en `GET /customers`, `GET /sale-orders` y `GET /reports`;
- o `POST /auth/register` responde 404 o 403 con el interruptor apagado.

### AUD-002 · Detrás de nginx, los limitadores cuentan a todos los usuarios en un solo contador: 10 logins anónimos bloquean el acceso de todo el comercio
**Área:** Seguridad · **Severidad:** Alto · **Confianza:** Confirmado · **Verificación:** ejecución, estática · **Esfuerzo:** Bajo
**Ubicación:** `src/app.ts:16-84`, `src/shared/middlewares/rateLimiter.middleware.ts:27-69` y `Stockly-F/nginx.conf:34-41`. En detalle:
- `src/app.ts:16-84`: no hay `app.set("trust proxy", …)`;
- `src/shared/middlewares/rateLimiter.middleware.ts`: el límite global en `:27-35` (100 cada 15 min), `authStrictLimiter` en `:52-59` (10 cada 15 min en login, recuperación y reset) y el de registro en `:62-69` (5 por hora);
- `Stockly-F/nginx.conf:34-41`: `proxy_pass` hacia el backend.

Evidencia: [evidencias/ejecucion-api.json](evidencias/ejecucion-api.json), bloque `p0203`.
**Estado:** nuevo. `README.md:235` documenta «100 cada 15 min por IP; 10 en login»: con el proxy que entrega el propio proyecto, no es por IP.
**Problema:**
- `express-rate-limit` cuenta por `req.ip`, sin `keyGenerator`.
- Sin `trust proxy`, `req.ip` es la dirección del socket, que en la pila del compose siempre es la de nginx. Todas las peticiones de todos los clientes caen en el mismo contador, y `X-Forwarded-For` se ignora.
**Impacto:**
- Cualquiera, sin cuenta, deja a todo el comercio sin iniciar sesión ni recuperar la contraseña durante 15 minutos con 10 peticiones, y puede repetirlo. Lo mismo con el registro: 5 por hora para todo el sitio.
- El cupo global de 100 peticiones cada 15 minutos se reparte entre todas las personas del comercio. Unas pocas trabajando a la vez llegan al 429 en uso normal.
- La defensa contra fuerza bruta, que es el único control del login (no hay bloqueo por cuenta), no distingue al atacante.
- CVSS v4.0 orientativo: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N`.
**Evidencia:** 2026-11-01, contra un backend local con los límites por defecto y `NODE_ENV=production`:
- 11 `POST /auth/login` fallidos, cada uno con un `X-Forwarded-For` distinto (`203.0.113.1` a `.11`): diez 401 y **429** en el undécimo;
- después, un login **válido** con `X-Forwarded-For: 198.51.100.7`: **429** `RATE_LIMITED` y `Retry-After: 900`.
**Solución propuesta:**
- `app.set("trust proxy", <saltos>)` configurable por `TRUST_PROXY`, con el número de proxies del despliegue (1 con nginx). Nunca `true` a secas, que dejaría falsificar la cabecera.
- Un test con `X-Forwarded-For` que lo fije.
- Opcional: limitar también el login por cuenta (el correo normalizado).
- Relacionado: el puerto 3000 publicado deja llegar al backend sin pasar por nginx (observación de DevOps).
**Criterio de aceptación:**
- dos clientes con distinto `X-Forwarded-For`, a través de nginx, tienen contadores separados;
- 10 fallos desde una IP no bloquean el login desde otra;
- un test lo comprueba.

### AUD-003 · El seed que la documentación manda ejecutar para desplegar crea administradores con contraseña pública y vacía la base sin ninguna guarda
**Área:** Seguridad · **Severidad:** Alto · **Confianza:** Alta · **Verificación:** estática · **Esfuerzo:** Medio
**Ubicación:** `prisma/seed.ts:70-150,1147-1151`, `prisma.config.ts:10` y la documentación del despliegue. En detalle:
- `prisma/seed.ts:70-92`: borra todas las tablas, `users` incluida;
- `prisma/seed.ts:100-150`: dos ADMIN y una cuenta por rol, verificadas, con las contraseñas que publica `README.md:250-254` (`Admi…`, `User…`, `Alma…` y `Vend…`);
- `prisma/seed.ts:1147-1151`: las imprime;
- `prisma.config.ts:10`: `seed: "tsx prisma/seed.ts"`;
- documentación del despliegue: `README.md:258-260`, `docs/README-proyecto.md:89-90` y `docs/CONTEXTO.md:272` («nadie es administrador hasta ejecutar `pnpm db:seed`»).
**Estado:** nuevo. Efecto colateral de T1-22: desde que el registro no da ADMIN, la única vía documentada para tener el primer administrador es el seed de demostración.
**Problema:**
- El seed no mira `NODE_ENV` ni la base de destino, y no pide confirmación (el `grep` de `NODE_ENV`, `production` y `process.env` en el archivo sale vacío).
- Borra toda la base antes de sembrar.
- Deja dos administradores con contraseñas escritas en el README y en el código de un repositorio público.
- Ningún documento pide cambiarlas después ni borrar las cuentas de demostración.
**Impacto:**
- Una instalación que siga la documentación queda con dos cuentas ADMIN cuyas credenciales conoce cualquiera que lea el repositorio: lectura y escritura de todo, alta de usuarios y exportaciones (A07:2025, credenciales por defecto).
- Repetir el comando por error sobre una base con datos la destruye. Durante esta auditoría hubo que comprobar a mano que `DATABASE_URL` apuntaba a la base aislada antes de sembrar.
- Es Alto y no Crítico porque el paso es manual y aún no hay despliegue.
- CVSS v4.0 orientativo: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N`.
**Evidencia:** lectura del seed y de los tres documentos citados, confirmada por la verificación independiente ([trabajo/verificacion.md](trabajo/verificacion.md)). El `Dockerfile` no mete el seed en la imagen `runner`, pero se puede lanzar desde la etapa `migrator`.
**Solución propuesta:**
1. El seed se niega a correr con `NODE_ENV=production` o con una `DATABASE_URL` que no sea local, salvo con `--forzar`.
2. Un comando aparte, `admin:crear` (o `ADMIN_EMAIL` y `ADMIN_PASSWORD` por entorno), que cree solo el primer ADMIN con contraseña propia y sin vaciar nada.
3. README, `docs/README-proyecto.md`, `docs/operaciones.md` y `docs/CONTEXTO.md` explican el despliegue con ese comando.
4. Opcional: el seed genera contraseñas al azar y las muestra una vez.
**Criterio de aceptación:**
- con `NODE_ENV=production`, `pnpm db:seed` aborta sin tocar la base;
- existe un comando documentado y probado para crear el primer ADMIN;
- ningún documento de despliegue manda ejecutar el seed de demostración.

### AUD-004 · `body-parser` 2.3.0 tiene un aviso alto de denegación de servicio, con el parser global antes de la autenticación (GHSA-27r3-jxmh-p828)
**Área:** Seguridad · **Severidad:** Alto · **Confianza:** Media · **Verificación:** estática, ejecución · **Esfuerzo:** Bajo
**Ubicación:** `package.json` (transitiva de `express@5.2.1`, con rango `^2.2.1`; instalada `body-parser@2.3.0`); `src/app.ts:66-68` (`express.json` y `express.urlencoded`, globales y con `inflate` activado). Evidencia: [evidencias/ejecucion-api.json](evidencias/ejecucion-api.json), bloque `p02101`.
**Estado:** nuevo. `docs/dependencias.md` §1 declaraba 0 avisos el 2026-10-05. El aviso es posterior.
**Problema:**
- El aviso (CVE-2026-111181; CVSS 3.1 de 7,5, `AV:N/PR:N/A:H`) afecta a `>=2.0.0 <2.4.0` y se corrige en 2.4.0, que el rango de express ya admite.
- Lo describe así: un cuerpo con `Content-Encoding` y bytes de más tras un marco válido emite un error sin escuchador, y el proceso cae.
- El parser se monta para todas las rutas, antes de la autenticación y de los limitadores.
**Impacto:**
- Si el aviso se cumple en esta instalación, una petición anónima tumba el único proceso del API. `restart: unless-stopped` lo levanta, pero cada reinicio pone a cero los limitadores.
- Además, es una de las causas que mantienen en rojo la puerta `auditoria` de `pnpm verify`.
**Evidencia:**
- El aviso, la versión instalada y el código de `lib/read.js` coinciden (verificación independiente, con `gh api /advisories`).
- **En ejecución no se reprodujo.** Contra un backend local se enviaron dos cargas: bytes sueltos tras un gzip válido, y un segundo miembro gzip truncado. Las dos respondieron 400, y el proceso siguió vivo 1,5 s después.
- Por eso la confianza baja a Media: el disparador exacto no está confirmado.
**Solución propuesta:**
- `pnpm update body-parser` en `Stockly-B`, o subir `express` a `^5.3.0`. Si el lockfile no la resuelve, un `override` en `pnpm-workspace.yaml` (`body-parser: ^2.4.0`) con su condición de retirada, como pide `docs/dependencias.md` §2.
- En la misma tanda, `pnpm update zod multer` en el backend y `pnpm update zod vite follow-redirects` en el frontend, para que `auditoria` vuelva a verde (observaciones de Seguridad).
- Opcional: `inflate: false`, si ningún cliente envía cuerpos comprimidos (la SPA no lo hace).
**Criterio de aceptación:** `pnpm why body-parser` muestra 2.4.0 o posterior, `pnpm audit --prod` ya no lista GHSA-27r3-jxmh-p828, y el paso `auditoria` de los dos repos sale con 0.

### AUD-005 · Las ventas no tienen máquina de estados bajo bloqueo: dos envíos o dos cancelaciones simultáneos mueven el stock dos veces, y `PATCH` acepta `SHIPPED → PENDING`
**Área:** Arquitectura · **Severidad:** Alto · **Confianza:** Confirmado · **Verificación:** ejecución, estática · **Esfuerzo:** Medio
**Ubicación:** `src/modules/sale-orders/sale-orders.service.ts`:
- `update`, `:418-452`: lee el estado en `:419` con `findUnique`, fuera de la transacción y sin bloqueo; `:441-443` y la rama simple de `:446-452`, que acepta cualquier estado;
- la cancelación, `:456-497`;
- `despachar`, `:181-236`, que termina con un `saleOrder.update` con `where: { id }`, sin condición de estado;
- `delete`, `:530-536`.

Además: `sale-orders.validator.ts:56` admite `PENDING` en `PATCH`. Contraste: `src/modules/purchase-orders/purchase-orders.service.ts:37-41` (`bloquearOrden`, `FOR UPDATE`) y `:186-188` (`CANNOT_REOPEN_RECEIVED_ORDER`). Evidencia: [evidencias/ejecucion-api.json](evidencias/ejecucion-api.json), bloque `p0701`.
**Estado:** nuevo, con antecedente. Es la misma clase de defecto que T0-03, que cerró `SHIPPED → CANCELLED` (sigue resuelta) y no la máquina completa. Compras ya lo corrigió en T5-04 con `bloquearOrden`, con un comentario que describe este mismo fallo. Recoge también la transición `SHIPPED → PENDING` que señaló el área 2.
**Problema:**
- `update` decide con el estado que leyó antes de abrir la transacción.
- `despachar` y la cancelación bloquean las filas de los productos, no la de la orden, y no vuelven a mirar el estado.
- Una segunda petición espera su turno y repite el efecto.
- Ninguna restricción de la base lo detiene. `stock_cuadra` solo exige que el total sea la suma de los niveles, y `sale_order_item_lots` no tiene índice único.
**Impacto:**
- El stock y el coste dejan de reflejar la realidad en el flujo principal de ventas, sin error y sin que la base lo detecte.
- El doble envío lo alcanza una cuenta de almacén: dos personas que pulsan «enviar» a la vez, dos pestañas o un reintento de red.
- La transición a `PENDING` requiere una petición a mano de un ADMIN.
- No es Crítico porque exige simultaneidad o una acción de ADMIN, y es recuperable con un ajuste.
**Evidencia:** 2026-11-01, en la base aislada, con órdenes de 2 unidades de un producto con lotes. El bloqueo de la fila del producto se retuvo desde otra conexión hasta que las dos peticiones esperaban, la técnica de `recepcion-parcial.test.ts:300`.

| Caso | Respuestas | Stock total | Efecto |
|---|---|---|---|
| Dos `POST /:id/ship` de la misma `PENDING` | 200 y 200 | 92 → 88 | Descuenta 4 por una orden de 2, con dos movimientos `OUT` y dos filas de lote |
| Dos `PATCH CANCELLED` de una `SHIPPED` | 200 y 200 | 86 → 90 | Devuelve 4 por una orden de 2: el stock queda inflado |
| `PATCH PENDING` sobre una `SHIPPED` y otro envío | 200, 200 y 200 | 90 → 88 → 88 → 86 | `PENDING` no devuelve nada, y el segundo envío descuenta otra vez |

No hay test de envío simultáneo de una misma orden, de doble cancelación ni de `PENDING` sobre `SHIPPED`. El de `permisos.test.ts:200-210` es secuencial.
**Solución propuesta:** que `update` y `delete` abran una sola transacción que empiece bloqueando la orden y lea el estado ya bloqueado, como `bloquearOrden` en compras, con las transiciones válidas en un solo sitio:
```ts
const TRANSICIONES = { PENDING: ["PENDING", "SHIPPED", "CANCELLED"], SHIPPED: ["CANCELLED"], CANCELLED: [] } as const;

return prisma.$transaction(async (tx) => {
    const [orden] = await tx.$queryRaw<Array<{ status: SaleOrderStatus }>>`
        SELECT status FROM sale_orders WHERE id = ${id} FOR UPDATE`;
    if (!orden) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
    if (dto.status && dto.status !== orden.status && !TRANSICIONES[orden.status].includes(dto.status)) {
        throw new HttpError(409, "Transición de estado no permitida", "INVALID_STATUS_TRANSITION");
    }
    // …envío, cancelación o actualización simple, con `orden` leída bajo bloqueo
});
```
- Conservar `ORDER_ALREADY_SHIPPED` y `CANNOT_MODIFY_CANCELLED_ORDER`: la segunda petición los recibe en vez de repetir el efecto.
- El código nuevo se da de alta en `CODIGOS_DE_ERROR`, con sus traducciones.
- En el mismo cambio, un `.max()` en `items` de `POST /sale-orders` (observación de Rendimiento).
**Criterio de aceptación:** tests con la carrera forzada, que comprueben que:
- dos envíos simultáneos de la misma orden dan un 200 y un 400, con el stock descontado una vez y una fila por línea en `sale_order_item_lots`;
- dos cancelaciones de una enviada devuelven el stock una vez;
- `PATCH { status: "PENDING" }` sobre una `SHIPPED` da 409 y no mueve nada;
- un envío contra una cancelación de la misma `PENDING` acaba enviado con descuento o cancelado sin él, nunca mezclado.

### AUD-006 · `moneda.test.ts` depende del reloj: desde el 2026-10-24, la puerta `pnpm verify` del backend está en rojo sin que haya ningún defecto en la aplicación
**Área:** QA y testing · **Severidad:** Alto · **Confianza:** Alta · **Verificación:** test, estática · **Esfuerzo:** Bajo
**Ubicación:** `src/tests/moneda.test.ts:163-168,216` y `src/modules/reports/reports.service.ts:77,98`. En detalle:
- `src/tests/moneda.test.ts:163-168`: la única venta enviada del test, con `shippedAt` fijo en el 2026-09-24;
- `src/tests/moneda.test.ts:216`: `expect(importes().length).toBeGreaterThan(8)`;
- origen: `src/modules/reports/reports.service.ts:77` (`DIAS_DE_MARGEN = 30`) y `:98` (`so."shippedAt" >= NOW() - make_interval(days => …)`).
**Estado:** nuevo. Corrige la sospecha que anotó la línea base, que atribuía el fallo a los datos de una base compartida: el test limpia la base antes de empezar.
**Problema:**
- La sección de margen del PDF cuenta las ventas de los últimos 30 días según `NOW()` de PostgreSQL. La única venta del test tiene fecha fija.
- Desde el 2026-10-24 (el 2026-09-24 más 30 días) la venta queda fuera, la sección sale vacía y el PDF trae 8 importes en vez de más de 8.
- Es el único test que lee `NOW()` de la base. Los demás con fechas inyectan el día a la función, y `useFakeTimers` no cambiaría el reloj de PostgreSQL.
**Impacto:**
- `pnpm verify` del backend y el job `verify` de la CI fallan en cada push y PR desde el 2026-10-24.
- ADR 0008 hace de esa puerta la única del proyecto, así que queda bloqueado cualquier cambio del backend, sin relación con él.
- La costumbre de convivir con un rojo conocido es lo que acaba tapando uno real.
- Está en el límite con Medio porque no hay defecto de producto. Se mantiene en Alto porque el fallo está activo, es determinista y bloquea toda la integración.
**Evidencia:**
- La línea base, tras migrar `Stockly_test` con la autorización del usuario, da 1 fallo de 1.652, `received 8` ([trabajo/linea-base.md](trabajo/linea-base.md), «Repetición del backend»).
- La CI pasó este mismo commit el 2026-10-11, dentro de la ventana.
- El test del informe por periodo, que usa `from` y `to` explícitos, pasa.
**Solución propuesta:**
- Que la venta de la sección de margen sea relativa al reloj: por ejemplo, una segunda venta con `shippedAt: new Date(Date.now() - 2 * 86_400_000)`, como hace `margen.test.ts:169` con `hace40`.
- La del 24 de septiembre se queda para el informe por periodo.
- No bajar el umbral del `8`.
**Criterio de aceptación:** `moneda.test.ts` pasa con el reloj del sistema un año por delante y 60 días por detrás, sigue exigiendo más de 8 importes con `RD$`, y `pnpm verify` del backend vuelve a verde, junto con AUD-004.

### Observaciones debajo del umbral (Medio y Bajo, sin ID)

En profundidad rápida no puntúan ni tienen tarea. Son lo que apareció por el camino, no un barrido: una pasada exhaustiva las convertiría en hallazgos. Las que vienen de un hallazgo provisional rebajado por la verificación independiente llevan su ID provisional.

| Área | Sev. | Observación | Ubicación | Corrección sugerida |
|---|---|---|---|---|
| Seguridad | Medio | P-02-102, rebajado: `zod` 4.4.3 (GHSA-mrhx-c7xc-m3w5). Con el tope de 100 kB y los roles exigidos cuesta unos 300 ms de CPU y 72 MB transitorios por petición, medido en memoria | `package.json` de los dos repos; arrays sin `.max()` en `src/modules/products/product.validator.ts:147-155` y en los validadores de órdenes, transferencias y conteos | `pnpm update zod` (4.6.7) y `.max()` en esos arrays |
| Seguridad | Medio | P-02-103, rebajado: `vite` 8.2.1. `/__open-in-editor` del servidor de desarrollo en Windows (GHSA-587h-7wmj-h5pm, más GHSA-698v-4r3x-3vcv), con `host: true` y túneles. Afecta al equipo de quien desarrolla, no a producción | `Stockly-F/vite.config.ts:39,43` | `pnpm update vite` (8.2.4); no abrir túneles con `pnpm dev` |
| Seguridad | Medio | `multer` 2.4.0 y `follow-redirects` 1.16.0: no explotables aquí, pero mantienen en rojo la puerta `auditoria` | `trabajo/hallazgos/02-seguridad-dependencias.md` | `pnpm update multer` (backend) y `pnpm update follow-redirects` (frontend) |
| Seguridad | Medio | La rotación del refresh no es atómica: carrera entre `findFirst` y `update`. Puede dar un cierre de sesión espurio, o dejar que un token robado se use a la vez que el legítimo sin disparar la alarma | `src/modules/auth/auth.service.ts:100-164` | `updateMany` condicional sobre el hash anterior, dentro de una transacción |
| Seguridad | Medio-Bajo | Para una pasada exhaustiva: `PUT /auth/me`, parser de 5 MB, enumeración de cuentas, JWT válido tras el logout hasta caducar, cambio de rol sin auditoría y tope de `bulk-stock` | `trabajo/hallazgos/02-seguridad.md` | Ver el archivo |
| DevOps | Medio | P-12-01, rebajado: `docker-compose.prod.yml` hereda `COOKIE_SECURE=false`, `SameSite=lax`, un `FRONTEND_URL` local y el 3000 publicado, y la pila no tiene TLS. El paso manual está en un comentario | `docker-compose.yml:80-81,89-95`; `docker-compose.prod.yml:26-34`; `Stockly-F/nginx.conf` | Una superposición `prod` que fije cookies y `FRONTEND_URL` por variable, una sección de TLS en `docs/operaciones.md` y el 3000 cerrado o limitado |
| DevOps | Medio | La puerta `auditoria` está roja y la CI no se ejecuta desde el 2026-10-11. No hay `schedule` ni Dependabot o Renovate; las alertas de Dependabot y el secret scanning están desactivados y `main` no tiene protección | `.github/workflows/verify.yml:9-13` (los dos repos) | Ejecución semanal programada, alertas de Dependabot y secret scanning activados, protección de `main` |
| DevOps | Medio | nginx sirve la SPA sin cabeceras de seguridad (CSP, `nosniff`, `frame-ancestors`, `Referrer-Policy`, HSTS). La API sí las tiene (helmet, comprobado en ejecución) | `Stockly-F/nginx.conf:9-47` | `add_header … always` con las mismas políticas |
| DevOps | Medio | `proxy_read_timeout` vale 60 s por defecto, frente a los 120 s de la transacción de cierre de un conteo, y axios no tiene `timeout` | `src/modules/inventory-counts/inventory-counts.service.ts:29`; `Stockly-F/src/shared/api/axios.ts:15-20` | Subir `proxy_read_timeout` en `/api` y dar un `timeout` a axios por encima del plazo |
| DevOps | Medio | Las imágenes base no llevan versión ni digest. `X-Forwarded-For` se puede inyectar por el 3000 publicado (ver AUD-002) | `Stockly-F/Dockerfile:25`; `Dockerfile:2,45,67` | Fijar las imágenes por digest y cerrar el 3000 |
| DevOps | Bajo | `migrator` y nginx corren como root; no hay `.dockerignore` de `.git` y `docs` en el backend; el compose base trae `postgres/postgres` por defecto; el `runner` no tiene `HEALTHCHECK` | `Dockerfile:36`; `docker-compose.yml` | Ver `trabajo/hallazgos/12-devops.md` |
| Rendimiento | Medio | P-03-01, rebajado y ya conocido (fila «Sin tarea» del ROADMAP): el panel lanza unas 14 consultas concurrentes contra un pool de 10. Medición del proyecto: p(95) de 2,2 s frente a 2 s, con 0 % de errores. No se sabe si el cuello es el pool o la CPU | `src/modules/reports/reports.service.ts:309-493`; `src/shared/lib/prisma.ts:11` | Caché con petición única en vuelo, consultas del catálogo unidas, y medir antes y después (`docs/rendimiento.md` §15) |
| Rendimiento | Medio | `bulkUpdateStock` abre una transacción por línea con `Promise.all` y sin tope: unas mil líneas ocupan todo el pool | `src/modules/products/product.service.ts:813-832` | `.max(200)` y lotes de 5 |
| Rendimiento | Medio | `POST /sale-orders` no tiene `.max()` en `items`: cientos de líneas pueden agotar los 5 s de la transacción del envío | `src/modules/sale-orders/sale-orders.validator.ts:21` | El mismo tope que el mostrador, junto con AUD-005 |
| Arquitectura | Medio | El registro responde 500 si el correo falla, pero deja la cuenta creada; un reintento recibe 409. La invitación sí retira la cuenta. Visto en ejecución | `src/modules/auth/auth.service.ts:30,42`; contraste en `src/modules/users/users.service.ts:96-97` | Retirar la cuenta, o responder 201 con un aviso de reenvío |
| Arquitectura | Medio | No hay ningún `CHECK` en la base. `products.stock >= 0`, `receivedQuantity <= quantity` y los importes positivos solo los protege el código. El de `stock_levels` se descartó a propósito (T5-14) | `prisma/migrations/`; confirmado en el esquema real | `CHECK` en lo que no tenga stock heredado negativo |
| Arquitectura | Medio | Cloudinary borra la imagen vieja antes de subir la nueva y de confirmar el cambio, y una subida huérfana se queda si el alta falla | `src/modules/products/product.service.ts:380-381,478` | Subir, confirmar y borrar después |
| Arquitectura | Medio | SMTP sin tiempos de espera propios: valen los de Nodemailer (hasta 10 min de socket), y el registro y la invitación esperan el envío | `src/shared/lib/nodemailer.ts:59-65` | `connectionTimeout`, `greetingTimeout` y `socketTimeout` explícitos |
| Arquitectura | Medio | Sin clave de idempotencia en la venta de mostrador, la recepción parcial, el cierre de transferencias ni la invitación. Solo protege el botón de la interfaz | `src/modules/sale-orders/`, `purchase-orders/` y `stock-transfers/` | Clave de idempotencia en esas mutaciones |
| Arquitectura | Bajo | Ninguna mutación invalida `["reports"]`: el panel puede enseñar cifras de antes de una venta durante 60 s | Hooks de `Stockly-F/src/modules/*/hooks` | Invalidar `["reports"]` en las mutaciones de stock |
| Código | Medio | Una orden `PENDING` con un producto desactivado después se puede enviar y cobrar. Solo el mostrador lo rechaza, y no hay decisión escrita | `src/modules/sale-orders/sale-orders.service.ts:141,181-236,373-378` | `INACTIVE_PRODUCT_SALE` también en `create` y `despachar`, o decidir y anotar que se honra |
| Código | Medio-Bajo | Criterios del panel: el valor incluye almacenes desactivados y lotes caducados, y excluye productos inactivos que conservan stock | `src/modules/reports/reports.service.ts:353-389,438` | Decidir el criterio y decirlo en la tarjeta |
| Accesibilidad | Medio | P-05-01, de la ejecución y rebajado: el foco de teclado de la barra lateral, la cabecera y los menús no se ve. Es un borde de 1 px en `--color-border` (1,23:1), sin anillo. Incumple WCAG 2.4.7 y 1.4.11 (AA) en todas las pantallas, sin impedir la tarea | `Stockly-F/src/App.tsx:178,236`; `Stockly-F/src/shared/lib/clasesDeItemDeMenu.ts:21`; `Stockly-F/src/modules/notifications/components/CampanaDeAvisos.tsx:155`; `Stockly-F/src/shared/components/DropdownButton.tsx:70`; `Stockly-F/src/index.css:91`. Captura: [evidencias/ejecucion-a11y-foco-navegacion.png](evidencias/ejecucion-a11y-foco-navegacion.png) | `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`, sin `outline-none`; que `itemDeMenu.test.tsx` exija el anillo |
| Accesibilidad | Medio | Mostrador, confirmado en ejecución: tras «Registrar venta» el foco cae en `body` (20 Tab hasta «Nueva venta»), y el aviso `role="status"` se inserta ya con su contenido | `Stockly-F/src/modules/sale-orders/components/MostradorPage.tsx:139-168` | Región viva presente desde el inicio, y foco en el aviso o en el encabezado |
| Accesibilidad | Medio | Al añadir una línea no hay mensaje propio, solo se relee el total. Confirmado en Mostrador | `Stockly-F/src/modules/sale-orders/components/MostradorPage.tsx:86-96`; `Stockly-F/src/modules/stock-transfers/components/TransfersPage.tsx:51-60` | Región `aria-live` con «X añadido, cantidad N» |
| Accesibilidad | Medio | El foco se pierde tras dar de baja un lote. Los errores salen como toast de 3 s | `Stockly-F/src/modules/reports/components/CaducidadesPage.tsx:25-47`; `Stockly-F/src/shared/components/Modal.tsx:84`; `Stockly-F/src/main.tsx:16` | Devolver el foco a la tabla; errores persistentes o toast más largo |
| Accesibilidad | Bajo | `Modal` pisa el `autoFocus` del primer campo; `Input` no marca `required` | `Stockly-F/src/shared/components/Modal.tsx:77-78`; `Stockly-F/src/shared/components/Input.tsx` | Ver `trabajo/hallazgos/05-accesibilidad.md` |
| QA y testing | Medio | P-08-02, rebajado: los limitadores de la autenticación no tienen ningún test. Montados funcionan (prueba de AUD-002), pero quitarlos deja la suite en verde | `src/shared/middlewares/rateLimiter.middleware.ts:49-70`; `src/modules/auth/auth.routes.ts:19-27` | Test con `NODE_ENV=development` y un `AUTH_RATE_LIMIT_MAX` bajo, como `csrf.test.ts` |
| QA y testing | Medio | El E2E en paralelo, contra el servidor de desarrollo y en este equipo Windows, es frágil: 8 de 39 caídas por esperas de 5 s y una red suspendida. Las 8 pasan al repetirlas, 3 de ellas solo con `--workers=1` | `Stockly-F/playwright.config.ts` (`fullyParallel`, dos proyectos, `pnpm dev`) | E2E local contra el build (`vite preview`), o `workers` según la máquina |
| QA y testing | Bajo | `jest.config.js` no define `collectCoverageFrom`: un módulo que ningún test cargue no baja el porcentaje | `jest.config.js` | `collectCoverageFrom: ["src/**/*.ts", …]` |

Mejoras de pruebas que no corrigen un defecto (en rápida no se abren propuestas):
- `eslint-plugin-jsx-a11y` y axe en `e2e/`;
- un test basado en propiedades para el reparto FEFO de `bajarNivel` (`src/shared/lib/stock.ts:164-221`).

## 4. Orden de ataque recomendado

1. **AUD-006 y AUD-004**, con las actualizaciones de dependencias de las observaciones. Son correcciones de minutos y devuelven a verde `pnpm verify` y la CI, que el resto de tareas necesita para cerrarse según `CONTRIBUTING.md`.
2. **AUD-001.** Bloquea el release. Primero la decisión de producto (cerrar el registro o recortar lo que lee `USER`), anotada en `docs/CONTEXTO.md`. El cambio es pequeño.
3. **AUD-005.** Es la integridad del stock en el flujo principal. Esfuerzo medio, y la plantilla de la prueba ya existe en compras (`recepcion-parcial.test.ts:300`).
4. **AUD-002.** Una línea de configuración más un test. Imprescindible antes de desplegar detrás de nginx.
5. **AUD-003.** Antes del primer despliegue: el comando del primer ADMIN y la documentación que lo usa.
6. **Antes del primer despliegue**, además: la pasada del área 13 (Legal) y las observaciones de DevOps (TLS, cookies, cabeceras de nginx, el 3000).

El plan ejecutable está en [ROADMAP.md](../../ROADMAP.md).

## 5. Puntos fuertes

- **Autorización por función, uniforme y comprobada.**
  - 97 rutas con `permitir("MÉTODO /ruta")` desde la única tabla `PERMISOS`.
  - El rol se lee de la base en cada petición.
  - `permisos.test.ts` recorre cada fila con los 4 roles y una petición real: una ruta nueva sin decidir su rol rompe la suite.
- **Sesión:**
  - cookies `httpOnly` y refresh rotado con detección de reuso, guardado como hash SHA-256 (ADR 0002);
  - cookie de refresh con la ruta restringida (ADR 0003), comprobado en ejecución;
  - CSRF de doble envío con una lista explícita de rutas exentas;
  - el reset revoca las sesiones.
- **Cabeceras y CORS de la API**, comprobados en ejecución: helmet con CSP, HSTS, `nosniff`, `Referrer-Policy` y COOP/CORP, y CORS con origen fijo, que no refleja el de quien pregunta.
- **El stock se escribe en un solo sitio, y la base lo vigila.**
  - `src/shared/lib/stock.ts` bloquea por id y descuenta con una sola sentencia condicional.
  - `stock_cuadra`, diferido al `COMMIT`, convierte una escritura olvidada en un error y no en una deriva. Confirmado en el esquema real.
  - Los lotes no se pueden cruzar entre productos.
- **Compras, conteos y número de venta.**
  - Compras tiene la máquina de estados y el bloqueo que le faltan a las ventas.
  - El cierre y la cancelación de los conteos son idempotentes.
  - El contador de ventas no deja huecos.
  - El impuesto se congela por línea y se redondea en un solo sitio.
- **Entradas del exterior:**
  - firma de imágenes por *magic bytes*;
  - límites de cuerpo por ruta;
  - logo del negocio con host fijo, sin redirecciones, con 3 s y 2 MB;
  - ningún `$queryRawUnsafe` ni `Prisma.raw` en 94 usos de SQL;
  - errores sin trazas en producción, y un log que redacta cookies y `authorization`.
- **Pruebas:**
  - suites dedicadas a dinero, stock, lotes, concurrencia y permisos;
  - ningún test sin aserción ni `catch` vacío en 148 archivos;
  - el E2E cubre los flujos de los Tiers 5 y 6 sin reintentos;
  - cobertura del backend del 97 % de las sentencias.
- **Accesibilidad del Mostrador**, comprobada con teclado: un combobox ARIA 1.2 completo, orden de tabulación lógico, el modal del escáner con la trampa de foco bien resuelta, enlace de salto y `lang` dinámico.
- **Rendimiento medido, no supuesto:**
  - `docs/rendimiento.md` registra antes y después, incluidos sus propios incumplimientos;
  - el escáner y las gráficas van fuera de la ruta inicial;
  - 30 rutas con carga diferida.
- **Entrega:**
  - CI con acciones fijadas por SHA, `contents: read` y sin `pull_request_target`;
  - imagen del backend en varias etapas, sin root y con dependencias podadas;
  - el compose de producción exige credenciales y aplica las migraciones como servicio previo;
  - backups, restauración ensayada y alertas, documentados.
- **Dependencias con criterio:** de 27 avisos altos o críticos, 24 no son alcanzables y lo están justificados uno a uno. Los `overrides` llevan fecha y condición de retirada.

## 6. Descartados tras verificación

Ninguno. La verificación independiente revisó 12 hallazgos propuestos como Alto ([trabajo/verificacion.md](trabajo/verificacion.md)):
- confirmó 7;
- rebajó 5 a Medio (P-02-102, P-02-103, P-12-01, P-03-01 y P-08-02), que están en las observaciones;
- en la consolidación, P-02-01 subió a Crítico (AUD-001).

En la ejecución se refutó una observación del área 5: «Nueva venta» no deja el foco en `body`, sino en «Escanear».

## 7. Hipótesis por verificar

| Sospecha | Lo que la confirmaría |
|---|---|
| Carreras menores, solo de ADMIN: un `DELETE` de una compra `PENDING` concurrente con una recepción (`purchase-orders.service.ts:337-346`), y `desactivar` de un almacén mientras entra una venta o una recepción (`warehouses.service.ts:131-163`). Medio | La misma técnica de bloqueo retenido de AUD-005 |
| El disparador exacto de la caída de AUD-004: dos cargas no la reprodujeron | La carga del aviso GHSA-27r3-jxmh-p828 contra un backend de pruebas, antes y después de la 2.4.0 |
| P-03-01: el cuello del panel es el pool y no la CPU de PostgreSQL | `pnpm carga:ejecutar` con `pg_stat_activity`, y `max: 10` frente a `max: 20` |
| `bulkUpdateStock` con lotes: qué ve quien ajusta a mano un producto con varios lotes | Ejecutarlo en una base de pruebas con un producto con tres lotes |
| El panel con un almacén desactivado, y `caducidades?warehouseId=` con uno desactivado | Ejecución en una base de pruebas |
| `Stockly-F/src/modules/stock-transfers/components/TransfersPage.tsx:251`: el `aria-label` fijo («ver líneas de N») tapa el contenido visible de la fila (WCAG 4.1.2 y 2.5.3) | Árbol de accesibilidad con transferencias reales: el seed no trae ninguna |
| `Stockly-F/src/modules/products/components/BuscadorDeProducto.tsx:123-128`: Intro antes del *debounce* de 250 ms, con un escáner de pistola | Prueba con un lector de códigos de barras |
| E2E: la tasa del 18 % de T6-05 abre una ventana compartida con otros escenarios en paralelo; el seed restablece el lote caducado en una segunda ejecución | Varias pasadas seguidas del E2E en una base fija |
| `undici` en el frontend (vía `jsdom`): ningún test hace peticiones reales a Internet | Revisión test por test, o subir `jsdom` |
| `NODE_ENV=test` se admite fuera de Jest y apaga los limitadores. Bajo | Rechazarlo en `env.ts` si no hay `JEST_WORKER_ID` |
| No hay un backup programado frente al RPO de 24 h de `docs/operaciones.md` §2 | Revisar la tarea programada del despliegue cuando exista |

## 8. Re-auditoría

- **Nuevos:** AUD-001 a AUD-006, los seis.
- **Ya conocidos:** P-03-01, la fila «La prueba de carga ya no cumple sus umbrales» de «Sin tarea», queda como observación Medio sin ID. T4-17 (lector de pantalla) sigue sin hacerse.
- **Regresiones:** ninguna.
- **Cerradas en falso:** ninguna. Las tareas cerradas de las áreas auditadas se comprobaron en el código:

| Área | Tareas comprobadas | Resultado |
|---|---|---|
| Seguridad | T0-06, T0-07, T1-11, T1-12, T1-19, T1-20, T1-21, T1-22, T2-31, T2-32 y T2-33 | Siguen resueltas. T1-22 está en el origen de AUD-001 y AUD-003, sin ser una regresión |
| Arquitectura | T0-03, T0-04, T0-05, T2-07 y T2-25 | Siguen resueltas, ahora con almacenes y lotes. T0-03 cerró una transición; AUD-005 es la máquina completa |
| QA y testing | T0-05, T0-08, T1-04, T1-23, T1-24 y T2-19 a T2-24 | Siguen en pie y hacen lo que decían |

**Cómo cambió el proyecto desde el 2026-08-04.** La nota anterior de DevOps (3,0) era la de una imagen que no se construía y sin cadena de verificación. Ahora hay `pnpm verify` en local y en la CI, una pila completa y operaciones documentadas. Las notas no se comparan cifra a cifra: el apartado 2 explica por qué.

## 9. Línea base y herramientas

Detalle en [trabajo/linea-base.md](trabajo/linea-base.md). Se ejecutaron los pasos de `pnpm verify` uno a uno, con `prisma migrate status` (solo lectura) en lugar de `migrate deploy`.

| Repo | Paso | Resultado |
|---|---|---|
| Backend | `prisma generate`, `check`, `build` y `smoke` | Pasan |
| Backend | `test:coverage` | Con `Stockly_test` sin las migraciones T5-14 y T5-15: 1.360 fallos (entorno local). Tras aplicar su SQL, con la autorización del usuario: **1 fallo de 1.652** (AUD-006), en 193 s. Cobertura 97,15 / 88,82 / 97,96 / 97,88, sobre unos umbrales de 85 / 72 / 87 / 87 |
| Backend | `auditoria` | **Falla**: 3 avisos altos en producción. En el árbol completo, 2 críticos y 10 altos, de los que solo una causa es alcanzable (AUD-004) |
| Frontend | `check`, `lint` (0 avisos) y `build` (90 trozos) | Pasan |
| Frontend | `test:coverage` | 910 pasan y 1 se omite (911). Cobertura 80,84 / 84,93 / 71,23 / 83,02, sobre unos umbrales de 45 / 50 / 33 / 46 |
| Frontend | `auditoria` | **Falla**: 5 avisos altos en producción. En el árbol completo, 15 altos; alcanzables, `zod` y el servidor de desarrollo de `vite` |
| Los dos | E2E (2026-11-01, base aislada) | 39 escenarios pasan y 3 se omiten por diseño. La pasada en paralelo es frágil en este equipo (observación de QA) |
| Los dos | CI (`gh`, solo lectura) | `verify` en verde en las 10 últimas ejecuciones, la última el 2026-10-11; ninguna desde entonces |

**Versiones:** Node 22.23.2, pnpm 12.4.1, PostgreSQL 17.11, Prisma 7.9.1, TypeScript 6.0.3, Jest 30.4.1, Vitest 4.1.7, ESLint 10.4.0, Vite 8.2.1 y Playwright 1.61.1.

**Herramientas de análisis:**
- `pnpm audit`, acordado: envía al registro de npm los nombres y las versiones de las dependencias.
- `gh api /advisories/<id>`, para leer los avisos.
- **gitleaks no se ejecutó**: el clasificador de seguridad de la sesión bloqueó su descarga. En su lugar, un escaneo parcial con `git` ([trabajo/escaneo-secretos.awk](trabajo/escaneo-secretos.awk)), sin candidatos nuevos.
- Semgrep, no (no hay Python).
- **Ejecución:** el build de producción de la línea base contra la base aislada `stockly_auditoria`, creada, sembrada y borrada después. SMTP y Cloudinary con dominios `.invalid`, sin envíos reales. Scripts en [trabajo/ejecucion/](trabajo/ejecucion/), resultados en [trabajo/ejecucion.md](trabajo/ejecucion.md) y salidas en [evidencias/](evidencias/).
- **Estado del árbol:** antes y después de cada paso, `git status` de los dos repos solo muestra `Stockly-B/docs/auditoria/`.

## 10. Zonas no cubiertas

- **Áreas no auditadas:** 4, 6, 9, 10, 11, 13 y 14 (motivos en el apartado 0). Antes del primer despliegue hace falta, como mínimo, la **13 Legal**: los clientes llevan documento de identidad.
- **Profundidad rápida:** Medio y Bajo no se buscaron de forma sistemática. Las observaciones del apartado 3 son lo que apareció, no un inventario.
- **Secretos en el historial: cobertura parcial.** Sin gitleaks, el sustituto no detecta ni la credencial ya conocida y rotada del merge `4254582`. Hace falta gitleaks, o el secret scanning de GitHub, sobre el historial completo de los dos repos.
- **SAST:** sin Semgrep ni otro analizador estático de seguridad.
- **Ejecución no hecha:**
  - la traza de rendimiento del navegador;
  - `bulk-stock` con unas mil líneas y una orden con cientos;
  - `docker compose build` y `config`, y las cabeceras de nginx en marcha;
  - el cierre de un conteo de más de 60 s a través de nginx;
  - SMTP y Cloudinary lentos;
  - T5-14 y T5-15 sobre datos con historia;
  - la orden con un producto desactivado;
  - el contraste real en claro y en oscuro, `lang` tras cambiar de idioma y `prefers-reduced-motion`.
  - Motivos por entrada en [trabajo/ejecucion.md](trabajo/ejecucion.md).
- **Pruebas de carga y de estrés de concurrencia:** fuera de lo acordado (k6 no está instalado). La medición de referencia es la del proyecto, del 2026-10-10.
- **Navegadores y dispositivos:** solo Chromium, de escritorio y móvil emulado en el E2E. Sin Safari, Firefox, dispositivos reales ni lector de pantalla real (T4-17).
- **Despliegue real:** no existe. Nada se observó en producción.
- **Tooling de agentes:** unas 700 skills de terceros versionadas en `.agents/` y `.claude/`, superficie de inyección de instrucciones para quien use agentes en el repo, no revisadas una a una.
- **Muestreo:** lo no abierto de cada área, en su archivo de `trabajo/hallazgos/`.
- **Contraste con ISO/IEC 25010:2023.** Cubiertas, con la profundidad rápida: adecuación funcional (stock y ventas), eficiencia (solo estática), fiabilidad, seguridad y mantenibilidad (pruebas). Parcial o sin cubrir:
  - *compatibilidad*: un solo motor de navegador;
  - *capacidad de interacción*: área 6 fuera y área 5 parcial;
  - *flexibilidad*: el despliegue no se construyó;
  - *safety*: no aplica, porque el producto no controla nada físico.
