# Verificación independiente (paso 1.4) · 2026-10-31

Subagente `revision:verificador-hallazgos`, con Sonnet · high.

- **Qué recibió por hallazgo:** la afirmación, la ubicación, la severidad propuesta y la evidencia, sin el razonamiento del auditor, más la ruta de `rubricas.md`.
- **Límites:** solo lectura, sin tests, bases de datos ni contenedores.
- **Consultas externas:** los avisos de seguridad, con `gh api /advisories/<id>`, que solo envía el identificador.
- **Sin ejecución todavía:** la verificación en ejecución (1.3) va después y puede subir la confianza de lo que reproduzca.

## Resumen

| ID | Propuesta | Veredicto | Severidad resultante | Confianza resultante | Queda para la ejecución |
|---|---|---|---|---|---|
| P-02-01 | Alto · Alta | Confirmado | Alto | Alta | Registrar una cuenta, confirmar el correo y pedir `GET /customers` |
| P-02-02 | Alto · Alta | Confirmado | Alto | Alta | Nada |
| P-02-03 | Alto · Media | Confirmado | Alto | Alta (sube) | 11 logins fallidos desde una IP y uno válido desde otra, que debe recibir 429 |
| P-02-101 | Alto · Media | Confirmado | Alto | Alta (sube) | Opcional: tumbar el backend local con un cuerpo gzip con bytes de más |
| P-02-102 | Alto · Media | Rebajado | Medio | Media | Nada: medido en memoria |
| P-02-103 | Alto · Media | Rebajado | Medio | Alta (de que la versión está afectada) | Nada |
| P-12-01 | Alto · Alta | Rebajado | Medio | Alta (hechos); impacto de criterio | Opcional: `docker compose … config` |
| P-03-01 | Alto · Media | Rebajado | Medio | Media | Fuera de lo acordado: `pg_stat_activity` durante la carga, con `max: 10` frente a `max: 20` |
| P-07-01 | Alto · Alta | Confirmado | Alto | Alta | Dos envíos simultáneos de la misma orden y dos cancelaciones simultáneas de una enviada |
| P-08-01 | Alto · Alta | Confirmado (causa precisada) | Alto | Alta | Opcional: la suite con el reloj en una fecha anterior al 2026-10-24 |
| P-08-02 | Alto · Alta | Rebajado | Medio | Alta | Nada: la falta de prueba se demuestra leyendo |
| P-05-01 | Alto · Alta (de la ejecución) | Rebajado | Medio | Alta | Opcional: tema oscuro y menú móvil |

Ninguno descartado, así que no hay nada para *Descartados tras verificación* ni para los falsos positivos de `CONTEXTO.md`.

## Notas para la consolidación (conversación principal)

- **P-02-01: decidir la severidad final con la rúbrica.**
  - El verificador dice que la rúbrica pediría Crítico (cualquier cuenta, datos personales) y lo deja en Alto porque no hay despliegue ni datos reales y la red del despliegue no está fijada.
  - Las dos mitades son decisiones escritas: el registro abierto como `USER` (`README.md:234`, `docs/CONTEXTO.md:272`) y que `USER` lea clientes y ventas (comentarios de `api.ts`, T5-06, T6-06 y `docs/legal.md:42-44`). La combinación, no.
  - En la solución, ofrecer las dos salidas: cerrar el registro o limitar lo que lee `USER`.
- **P-02-02:** el verificador ancla el borrado en `prisma/seed.ts:70-92` y el seed en `prisma.config.ts:10`, no en `:85-90` ni en `:9`. Usar sus líneas.
- **P-02-03:** la confianza sube a Alta. Para reproducirlo sin nginx, basta el backend local: varios logins con distintos `X-Forwarded-For` caen en el mismo cubo si la clave es la IP del socket.
- **P-02-101:** la solución es subir `body-parser` a 2.4.0 (el rango `^2.2.1` de express lo admite) o poner `inflate: false`. Las pruebas en ejecución de P-02-102 y P-02-103 ya no hacen falta.
- **Rebajados a Medio** (P-02-102, P-02-103 y P-12-01). En rápida no puntúan: pasan a observaciones del informe, sin ID, cada uno con su corrección.
  - P-02-102: subir `zod` a 4.6.7. Se cita junto a los arrays sin `.max()` del área 3.
  - P-02-103: subir `vite` a 8.2.4. Citar también GHSA-698v-4r3x-3vcv (Medio).
  - P-12-01:
    - una superposición `prod` que fije `COOKIE_SECURE` y `FRONTEND_URL` por variable;
    - una sección de TLS en `docs/operaciones.md`;
    - cerrar o limitar el puerto 3000.

## Encargo 1 · seguridad y DevOps (7 hallazgos)

Modelo: Sonnet 5.5 (`claude-sonnet-5-5`) · high. Respuesta del subagente, con el formato ajustado y las contraseñas enmascaradas.

### P-02-01 · Confirmado (Alto) · confianza resultante: Alta

**Comprobado:**
- `auth.routes.ts:19` solo pone el limitador y `validate`.
- `auth.service.ts:15-43` crea `role: "USER"` sin aprobación, y `:84` solo exige el correo verificado.
- En `api.ts` están en `TODOS`: `GET /customers` y `/:id`, `GET /sale-orders` y `/:id/receipt`, `cost-history`, los informes y `GET /settings/business`.
- `Stockly-F/src/routes/index.tsx:60` monta `register`.
- Las dos mitades son decisiones escritas:
  - el registro público como `USER`: `README.md:234` y `docs/CONTEXTO.md:272`;
  - que `USER` lea clientes y ventas: comentarios de `api.ts`, ROADMAP T5-06 y T6-06, y `docs/legal.md:42-44`.
- Ningún documento justifica la combinación: cualquiera que confirme un correo propio ve los datos personales de todos los clientes. No hay interruptor de registro.
- No hay mitigación en otra capa: ni aprobación, ni lista blanca de dominios, ni VPN documentada.

**Motivo:** la combinación «registro abierto» y «`USER` lee clientes y ventas» no está decidida como tal en ningún documento.
- Por la rúbrica sería Crítico: cualquier cuenta, datos personales.
- Se queda en Alto porque no hay despliegue ni datos reales y el alcance de red del despliegue no está fijado.
- Si el despliegue va a Internet abierto, Alto es el mínimo defendible.

### P-02-02 · Confirmado (Alto) · confianza resultante: Alta

**Comprobado:**
- `prisma/seed.ts:70-92` borra todas las tablas, `user` incluida, sin guarda.
  - El `grep` de `NODE_ENV`, `production` y `process.env` en el archivo sale vacío.
  - No rechaza ningún nombre de base.
- `:100-150` crea dos ADMIN y las cuentas de los demás roles, todas con `isVerified: true`. Las contraseñas son las que publica `README.md:250-254` (`Admi…`, `User…`, etc.).
- `:1147-1151` las imprime, y `prisma.config.ts:10` fija `seed: "tsx prisma/seed.ts"`.
- Tres documentos mandan ejecutar el seed en un despliegue nuevo, y ninguno pide cambiar después las contraseñas:
  - `README.md:258-260`;
  - `docs/README-proyecto.md:89-90`;
  - `docs/CONTEXTO.md:272`: «nadie es administrador hasta ejecutar `pnpm db:seed`».
- El `Dockerfile` no mete el seed en la imagen `runner`. Se puede lanzar desde la etapa `migrator` (el `builder`, con todo el código): queda como paso manual del operador.

**Motivo:** seguir el procedimiento documentado deja administradores con contraseña pública y, si se repite con datos, vacía la base. Está documentado y nadie sopesó ese efecto, así que no es una decisión asumida. Se queda en Alto porque el paso es manual y no hay despliegue.

### P-02-03 · Confirmado (Alto) · confianza resultante: Alta

**Comprobado:**
- El `grep -rniE "trust.?proxy"` sale vacío en `src/`, los compose, `.env.example`, los README y `nginx.conf`. `app.ts` no define `trust proxy`.
- `rateLimiter.middleware.ts` no usa `keyGenerator`. En `express-rate-limit@8.6.2` instalado (`index.cjs:832-837`), la clave por defecto es `request.ip`.
- Con `trust proxy` desactivado, en Express 5 `req.ip` es la dirección del socket. Detrás de nginx (`nginx.conf:34-41`, `proxy_pass http://backend:3000`) siempre es la de nginx.
- La librería avisa de la cabecera `X-Forwarded-For` (`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, `:399-402`), pero no cambia la clave.
- Ningún limitador usa `skipSuccessfulRequests`, así que los logins válidos también cuentan.
- En el compose, que es la ruta de despliegue prevista, la SPA llega a la API por nginx. El 3000 publicado es una vía lateral.

**Motivo:** hay un solo contador para todos.
- Diez peticiones a `/auth/login` en 15 minutos dejan sin acceso a todo el comercio, y el límite global de 100 también se comparte.
- Es una denegación de servicio anónima y, con varios usuarios, también un fallo funcional.
- La confianza sube de Media a Alta porque la lectura del código es inequívoca.
- No se ejecutó. Queda en ejecución: 11 logins fallidos y un login válido desde otra IP, que debería recibir 429.

### P-02-101 · Confirmado (Alto) · confianza resultante: Alta

**Comprobado:**
- `gh api advisories/GHSA-27r3-jxmh-p828`: el identificador existe y coincide con el paquete.
  - CVE-2026-111181, severidad alta, CWE-248, CVSS 3.1 de 7,5 (`AV:N/PR:N/A:H`).
  - Afecta a `body-parser` `>=2.0.0 <2.4.0`; corregido en 2.4.0 (y en 1.20.9).
- Qué describe el aviso:
  - un cuerpo con `Content-Encoding` (por ejemplo gzip) y bytes de más tras un marco válido hace que el decodificador emita un error sin escuchador, y el proceso muere;
  - no exige autenticación ni una ruta válida, solo un `Content-Type` que el parser trate (JSON o urlencoded);
  - la solución alternativa es `inflate: false`.
- Instalada `body-parser@2.3.0`, dentro del rango.
- En el `lib/read.js` instalado, `contentstream` (`:184-205`) crea el flujo de descompresión con `req.pipe(stream)` y solo lo rechaza con `inflate === false`. La rama de error de `getBody` (`:117-135`) solo cubre el fallo del parser.
- `app.ts:66-68` monta `express.json` y `express.urlencoded` con `inflate` por defecto (activado), globales y antes de la autenticación y las rutas.
- El `grep` de `uncaughtException` y `unhandledRejection` en `src/` sale vacío, y `nginx.conf` no filtra el `Content-Encoding` de las peticiones.
- Mitigación parcial: `restart: unless-stopped` (`docker-compose.yml:79`). Pero una petición cada pocos segundos lo mantiene caído, y cada reinicio pone a cero los contadores de los limitadores.
- No se ejecutó: la caída del proceso no está reproducida.

**Motivo:** una sola petición anónima tumba el backend.
- Es Alto y no Crítico porque no hay pérdida de datos y el reinicio la acota.
- La confianza sube a Alta porque el aviso, el rango y el código instalado coinciden.
- La corrección es subir a 2.4.0, que el rango `^2.2.1` de express admite, o `inflate: false`.

### P-02-102 · Rebajado a Medio · confianza resultante: Media

**Comprobado:**
- `gh api advisories/GHSA-mrhx-c7xc-m3w5`: el identificador existe y coincide con 4.4.3.
  - CVE-2023-54404, severidad alta. Afecta a `zod` `< 4.6.6`; corregido en 4.6.6.
  - Describe el agotamiento de memoria con un array grande sin límite de longitud, porque se acumula un issue por cada elemento que falla.
- Topes de cuerpo: `app.ts:65-68` lo limita a 100 kB (`LIMITE_GENERAL`); solo `/products/import` admite 5 MB (`:64`).
- Los cinco validadores señalados validan `req.body` con `safeParse` en `validate.middleware.ts`. Sus rutas exigen `ADMIN`, o `ADMIN` y `WAREHOUSE`, y ninguna está al alcance de un `USER` ni de una cuenta recién registrada:
  - `PATCH /products/bulk-stock`: `ALMACEN`;
  - `POST /purchase-orders`: `SOLO_ADMIN`;
  - `POST /sale-orders`: `SOLO_ADMIN`;
  - `POST /stock-transfers` y `POST /inventory-counts`: `ALMACEN`.
- Medición en memoria con el `zod` instalado y `node -e`: un cuerpo de 99 kB con `bulkStockSchema` y 33.000 elementos `{}` da 66.000 issues, unos 72 MB de heap transitorio y unos 300 ms de CPU síncrona. Con ese tope no se puede agotar la memoria.
- El tope de 100 kB y el análisis síncrono impiden acumular memoria entre peticiones, y el límite de 100 peticiones cada 15 minutos acota el bloqueo del bucle de eventos.

**Motivo:** el aviso es real y la versión está afectada. Pero con el tope de cuerpo, el rol exigido y la medición, el coste por petición es de unos 300 ms de CPU y 72 MB transitorios, no un agotamiento de memoria. Es una actualización de dependencia (a 4.6.7), no un Alto.

### P-02-103 · Rebajado a Medio · confianza resultante: Alta (de que la versión está afectada)

**Comprobado:**
- `gh api advisories/GHSA-587h-7wmj-h5pm`: el identificador existe y 8.2.1 está dentro del rango.
  - CVE-2026-112942, CWE-77, CVSS 4.0 de 7,5 (`AT:P`, `UI:A`).
  - El aviso es de `launch-editor`, que `vite` incorpora. Afecta a `vite` `>=8.2.0 <=8.2.3`; corregido en 8.2.4.
  - Solo afecta a aplicaciones que corren en Windows: describe cómo saltarse `fs.existsSync` con una ruta que acaba en `\..:1:1`.
- La inyección de comandos completa necesita además el fallo de `%` de GHSA-698v-4r3x-3vcv (Medio), que también cubre `vite` 8.2.x y exige entrada controlada por el atacante.
- Código instalado (`Stockly-F/node_modules/.pnpm/vite@8.2.1…/chunks/node.js`):
  - `:26570` monta `/__open-in-editor`;
  - `:11324` es `if (!fs$6.existsSync(fileName)) return;`;
  - el `escapeCmdArgs` de `:11345` no escapa `%`;
  - la comprobación de rutas UNC (`:11321`) no cubre este caso.
- `vite.config.ts:39` (`host: true`) y `:43` (`allowedHosts` con túneles) dejan el servidor de desarrollo al alcance de la red local y de los túneles.
- En producción no hay `vite`. Según `Stockly-F/Dockerfile`, solo está en la etapa `builder`; la imagen final es `nginx:alpine` con `dist/`. Que `@tailwindcss/vite` esté en `dependencies` no lo cambia.

**Motivo:** solo afecta al servidor de desarrollo en un equipo Windows, mientras corre `pnpm dev` y alguien alcanza el puerto (red local o una página maliciosa). Es un riesgo real para el equipo de quien desarrolla, no para el producto desplegado. Se arregla subiendo a 8.2.4. Es Medio, no Alto.

### P-12-01 · Rebajado a Medio · confianza resultante: Alta en los hechos; el impacto es de criterio

**Comprobado:**
- `docker-compose.yml`:
  - `:93-95` fija `COOKIE_SAMESITE: lax`, `COOKIE_SECURE: "false"` y `FRONTEND_URL: http://localhost:${FRONTEND_HOST_PORT:-8080}`;
  - `:80-81` publica el puerto 3000.
- `docker-compose.prod.yml:26-34` solo exige las credenciales de la base, cierra el puerto de PostgreSQL y fija `NODE_ENV`. No toca las cookies, `FRONTEND_URL` ni el 3000.
- `environment:` gana a `env_file`: el compose anula el `FRONTEND_URL` del `.env`.
- `nginx.conf` solo escucha en el puerto 80 y no tiene ningún bloque TLS.
- `auth.controller.ts:26-27`: sin esas variables, en producción `COOKIE_SECURE` vale `true` y `SameSite`, `none`. Solo el compose anula el valor seguro, como documenta `README.md:95`.
- El `grep -rniE` de TLS, https, certificado, caddy, traefik y reverse sale vacío en `docs/operaciones.md`, `docs/README-proyecto.md` y los README. `docs/CONTEXTO.md` tampoco tiene sección de TLS.
- El comentario de `docker-compose.yml:89-92` dice que «en un despliegue real detrás de HTTPS se quitan las dos líneas y vuelven los valores por defecto».
  - Es un paso manual que obliga a editar el archivo base: la superposición de producción no puede deshacerlo.
  - No menciona `FRONTEND_URL`, que también hay que cambiar.
- `app.ts` usa `helmet()` por defecto (helmet 8.3.0 en `node_modules`), que con HTTPS debería emitir `Strict-Transport-Security`. No se comprobó en ejecución.
- Separación de pesos:
  - la cookie sin `Secure`, sola, pesa poco si hay HTTPS delante: el refresh sigue siendo `HttpOnly`, `SameSite=lax` y de ruta restringida (ADR 0003), y HSTS ayuda. Su riesgo real es el paso a HTTP en un primer contacto o en una red hostil;
  - la falta de TLS en la pila pesa más, porque contraseñas y cookies viajarían en claro. Pero dónde termina el TLS depende del proveedor, que aún no se ha elegido, y el propio compose dice que la pila «local» no lo lleva.

**Motivo:** se baja a Medio.
- El estado seguro depende de un paso manual, pero ese paso está señalado en el código.
- El defecto roto se nota: los enlaces de los correos apuntarían a `localhost`.
- Es un fallo de configuración y documentación, no un defecto explotable hoy, y no hay despliegue.
- Queda como tarea de configuración:
  - una superposición `prod` que fije `COOKIE_SECURE` y `FRONTEND_URL` por variable;
  - una sección de TLS en `docs/operaciones.md`;
  - cerrar o limitar el puerto 3000.
- Si el responsable da más peso al nombre «producción» de la superposición que al comentario, el Alto sería discutible, pero el verificador no lo sostiene.

## Encargo 2 · rendimiento, arquitectura y QA (4 hallazgos)

2026-11-01. Lanzado con Sonnet 5.5 (`claude-sonnet-5-5`) · high; el subagente se declaró «esfuerzo bajo», que no es el parámetro con que se lanzó. 26 herramientas, 3 min, 76.298 tokens. Solo lectura, sin tests ni bases de datos. Respuesta con el formato ajustado.

### P-03-01 · Rebajado a Medio · confianza resultante: Media

**Comprobado:**
- La estructura es real: `reports.service.ts:309-317` y `:325-469` arrancan 3 consultas de margen y un `Promise.all` de 10, más `comprometidoPorProducto` en `:493`, unas 14 sentencias por petición. `prisma.ts:11` tiene `max: 10` y `:19`, `connectionTimeoutMillis: 5_000`. El panel no tiene caché (la de `reports.abc.ts` es de la clasificación ABC).
- `docs/rendimiento.md` §15 (`:637-660`) dice que las consultas que ganó `getSummary` en T5-02 y T6-09, «juntas y con diez usuarios a la vez saturan la base». Dice «la base», no el pool, y no aísla la causa. Una petición suelta tarda 300 ms; diez a la vez, 1,5 s de media.
- Los umbrales se superan por poco (panel 2,18-2,31 s frente a 2 s; escritura 1,12-1,34 s frente a 1 s), con **0 % de errores** en todas las pasadas.
- La salvedad de las dos máquinas solo afecta a la comparación con §6. El «antes» y el «después» de T5-14 son de la misma máquina y el mismo día.
- La carga es de peor caso: `load/movimientos.js:41-43`, 10 usuarios virtuales con `ramping-vus` y sin pausas (`git grep sleep` en `load/` sale vacío). Son 10 clientes pidiendo el panel sin parar, no 10 personas.
- Ya conocido: `docs/ROADMAP.md:61-75`, fila «Sin tarea», que también dice que esas filas «no son un defecto pendiente».

**Motivo:** la rúbrica pone «rendimiento fuera de umbral» como ejemplo de Medio. Es latencia con 0 % de errores, sobre carga sintética sin pausas y sin usuarios reales, y ya está documentada. La subida a Alto se apoyaba en que el cuello fuera el pool, y eso es inferencia.

### P-07-01 · Confirmado (Alto) · confianza resultante: Alta

**Comprobado:**
- `sale-orders.service.ts:419-425` lee `existing` con `findUnique`, sin transacción ni bloqueo, y con ese estado calcula `beingShipped` y `beingCancelled` (`:439-443`).
- `despachar` (`:181-236`) no vuelve a leer el estado. `bloquearProductos` (`:193`) bloquea filas de `products`, no la orden. Termina con `saleOrder.update({ where: { id: orden.id } })` sin condición de estado. En READ COMMITTED, la segunda transacción espera el bloqueo del producto y, al soltarlo, descuenta otra vez y duplica `saleOrderItemLot.createMany` (`:225`).
- La cancelación (`:456-497`) sigue el mismo patrón, y `delete` (`:530-536`) comprueba `SHIPPED` fuera de la transacción.
- `sale-orders.validator.ts:56` admite `PENDING`; sobre una `SHIPPED` entra en la rama simple (`:446-452`), que no devuelve stock.
- Sin mitigación en la base: los únicos índices únicos relacionados son `sale_orders.number` y `lots(productId, code)`; `sale_order_item_lots` solo tiene índices no únicos (`20261010180000_t5_15…/migration.sql:47-48`), y `stock_cuadra` (`20261010120000…:123-155`) solo exige que el total sea la suma de los niveles.
- Contraste: `purchase-orders.service.ts:37-41` (`bloquearOrden`) se corrigió en T5-04 con un comentario que describe este mismo fallo.
- Sin tests: `permisos.test.ts:200-210` («enviarla dos veces no descuenta dos veces») es secuencial; `sale-orders.test.ts:97-123` y `:250-267` no ejercen órdenes concurrentes; los `Promise.all` de `venta-de-mostrador.test.ts:238,251` y `varios-almacenes.test.ts:370` son de ventas nuevas y transferencias.
- `POST /:id/ship` y `PATCH` llaman al mismo `update` (`sale-orders.controller.ts:80,95`). Sin idempotencia ni bloqueo en ninguna capa.

**Motivo:** el mismo defecto que el proyecto ya corrigió en compras. Con una cuenta de almacén corrompe stock y movimientos en un flujo principal. No es Crítico porque exige simultaneidad o la petición a mano de un ADMIN.

### P-08-01 · Confirmado (Alto) · confianza resultante: Alta

**Comprobado:**
- `moneda.test.ts:163-168` crea la única venta enviada con `shippedAt` 2026-09-24; el comentario de `:160-162` dice que debe entrar en el margen.
- `reports.service.ts:77` y `:98` usan `NOW()` de PostgreSQL. `reports.pdf.ts:298` solo pinta la tabla de margen si hay `byCategory` o `revenueWithoutCost`: con la venta fuera de la ventana desaparecen sus importes, y quedan los 8 del `received 8`.
- Descartada la otra explicación, la «base compartida» que apuntaba `linea-base.md:296`: `beforeAll` hace `cleanDb()`, y el test del informe por periodo (`:219+`, con `from` y `to`) no falla. `git grep` de `useFakeTimers` y `setSystemTime` en `src/tests` sale vacío.
- La CI (`verify.yml`, en cada `push` a `main` y en cada `pull_request`) pasó el 2026-10-11, dentro de la ventana.

**Motivo:** la causa es la del auditor. En el límite con Medio, pero se sostiene Alto: ADR 0008 hace de `pnpm verify` la puerta única, el fallo es determinista y ya está activo, y bloquea el 100 % de los cambios del backend sin relación con ellos. En contra: no hay defecto de producto y se corrige en minutos. Precedente en el propio proyecto: `margen.test.ts:169` usa una fecha relativa (`hace40`).

### P-08-02 · Rebajado a Medio · confianza resultante: Alta

**Comprobado:**
- El hecho es exacto: `rateLimiter.middleware.ts:49-70`, montaje en `auth.routes.ts:19,21,22,26,27`, global solo fuera de `test` (`app.ts:71-78`).
- `git grep -i "RateLimit|limiter|limitador|429|RATE_LIMITED|AUTH_RATE_LIMIT_MAX"` en `src/tests`, `scripts`, `package.json` y `.github`: solo `limite-de-sondeo.test.ts`, que no importa los limitadores de la autenticación ni comprueba el montaje real. El E2E solo sube los techos (`playwright.config.ts:47-49`).
- No hay otra defensa contra la fuerza bruta (`git grep` de `lockedUntil` y `failedAttempts` sale vacío): el limitador es el único control del login.

**Motivo:** el ejemplo de la rúbrica es «ruta crítica sin ninguna prueba», y el login y el registro sí tienen pruebas. Lo que no la tiene es el montaje de un middleware estándar. Es una brecha con probabilidad baja y sin fallo activo.

## Encargo 3 · accesibilidad, encontrado en ejecución (1 hallazgo)

2026-11-01. Sonnet 5.5 (`claude-sonnet-5-5`) · high. 9 herramientas, 1 min, 36.111 tokens. Solo lectura, más la captura de `evidencias/`.

| ID | Propuesta | Veredicto | Severidad resultante | Confianza resultante | Queda para la ejecución |
|---|---|---|---|---|---|
| P-05-01 | Alto · Alta | Rebajado | Medio | Alta | Opcional: tema oscuro y menú móvil |

### P-05-01 · Rebajado a Medio · confianza resultante: Alta

**Comprobado:**
- Los cinco sitios (`App.tsx:178` y `:236`, `clasesDeItemDeMenu.ts:21`, `CampanaDeAvisos.tsx:155` y `DropdownButton.tsx:70`) usan solo `focus-visible:border-border` y `focus-visible:outline-none`, sin anillo ni sombra.
- No hay otro indicador: ningún `:focus-visible` global en `index.css` ni otra hoja de estilos en `src/`, y el enlace no activo no cambia de color ni de subrayado. El proyecto sí pinta un anillo bueno en otros sitios (`SettingsPage.tsx:107` y `OpcionesSegmentadas.tsx:59`, con `ring-accent`).
- La captura lo confirma: «Productos», enfocado, es idéntico a «Categorías» y «Marcas».
- Contraste: 1,23:1 en claro y 1,47:1 en oscuro, anotado en `index.css:91` y en `design-system.md:103`.
- Ninguna decisión escrita lo acepta:
  - `CONTEXTO.md:491` e `itemDeMenu.test.tsx:28-40` deciden *cuándo* aparece el borde (`focus-visible` y no `focus`), no que baste como indicador.
  - `theme.test.ts:233-237` exige al borde 1,2:1 como delimitador de superficie, no como foco.
  - T2-16 y T2-18 (`accesibilidad.md:172-173`) tratan de Escape, del retorno del foco y del anuncio de ruta.
- Mitigaciones parciales: el enlace de salto (`App.tsx:361`, T2-11) cubre 2.4.1 pero no 2.4.7, y T2-18 deja el foco en `#contenido` tras cambiar de ruta.

**Motivo:** el defecto es real e incumple 2.4.7 y 1.4.11 (AA). La rúbrica reserva Alto para barreras que impiden completar una tarea, y pone en Medio el «incumplimiento WCAG AA que no bloquea la tarea». La tarea se completa; falla la señal visual. App interna y sin usuarios.

**Corrección mínima (esfuerzo Bajo):**
- `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` en `index.css`, quitando `focus-visible:outline-none` de los cinco sitios;
- o el anillo local de `SettingsPage.tsx:107`. `--color-accent` da 3,8:1 en claro y 6,7:1 en oscuro; falta comprobarlo sobre `surface-muted`;
- que `itemDeMenu.test.tsx` exija el anillo;
- y anotar en `design-system.md` que `--color-border` no sirve como indicador de foco.

### Notas del encargo 2 para la consolidación

- **P-08-01:** corregir en el informe la sospecha de `linea-base.md:296` («datos de la base compartida»): la causa es la ventana de 30 días.
- **P-03-01:** como observación, ya la cubre la fila «Sin tarea» del ROADMAP; no necesita ID.
- **P-07-01:** citar T5-04 de compras como antecedente corregido del mismo patrón.
- **P-08-02:** citarlo junto a P-02-03, que sí confirma en ejecución que el limitador funciona montado (si la prueba lo reproduce).
