# Contexto de trabajo — al 2026-10-07

Lo que hace falta saber para retomar Stockly en frío y que no está en el código: el estado, las
trampas del entorno que ya costaron un fallo y las decisiones que una sesión nueva podría deshacer
por reflejo. El trabajo pendiente está en [ROADMAP.md](ROADMAP.md) y el mapa del resto de
documentos, en [README-proyecto.md](README-proyecto.md).

---

## 1. Arrancar en una máquina nueva

Los pasos están en [README-proyecto.md](README-proyecto.md). Lo que esos pasos no dicen:

- **Los `.env` no viajan en git** y sus valores se pasan a mano. Bastan cuatro variables en el
  backend (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`) y una en el frontend.
- **El puerto de PostgreSQL no es el mismo en todos los equipos** —anda entre 5432 y 5433—. Si
  `verify` falla al conectar, es lo primero que hay que mirar, y el valor bueno es el del `.env`
  local, no el de ningún documento.
- **La base de tests nace vacía** y la suite entera falla por eso, con mensajes que hablan del
  esquema y no de la lógica. Ver §4.
- **Si `node_modules` viene de otro equipo**, pnpm quiere purgarlo y aborta sin TTY
  (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Con `CI=true` en el entorno,
  `pnpm install --frozen-lockfile` lo recrea sin preguntar.
- **El alias `git buscar` hay que activarlo en cada clon** (§5), y los navegadores de Playwright se
  instalan aparte, una vez: `pnpm exec playwright install chromium`.

---

## 2. Tres decisiones que gobiernan el trabajo

**`pnpm verify`, en local y en la CI.** Es la puerta de calidad de cada repositorio. Se ejecuta en
local antes de cada push y GitHub Actions la repite ([ADR 0008](adr/0008-integracion-continua.md));
en el frontend, además con el E2E. El workflow llama al mismo script: si se le añade un paso
propio, la CI y el portátil empiezan a pedir cosas distintas. El detalle, en
[CONTRIBUTING.md](../CONTRIBUTING.md).

**Los docs viven en `Stockly-B/docs/`** aunque cubran los dos repositorios: la carpeta que los
contiene no está bajo control de versiones, y alojarlos en el backend es lo que hace que viajen.
Las rutas `Stockly-F/src/...` que aparecen en ellos se refieren al repositorio hermano.

**Toda tarea cerrada se anota en el ROADMAP**, con cifras reales. Si algo del criterio de
aceptación no se pudo comprobar, se dice en lugar de darlo por bueno.

---

## 3. Estado

Medido el 2026-10-07 en este equipo, con `pnpm verify` y el E2E:

| | Backend | Frontend |
|---|---|---|
| `pnpm verify` | ✅ exit 0 | ✅ exit 0 |
| Tests | **1197** en 60 archivos | **755** en 71 archivos *(+1 omitido)* |
| Cobertura de sentencias | 96.46 % *(suelo 85 %)* | 77.86 % *(suelo 45 %)* |
| Lint | — *(no existe: `pnpm check`)* | 0 errores, 0 avisos |
| Dependencias de producción | 159, sin avisos | 114, sin avisos |
| E2E (Playwright) | — | **29 pasados**, 1 omitido, en `chromium` y `Mobile Chrome` |

**Tareas: 131 de 139.** Los Tiers 0 a 4 —la remediación de la auditoría del 2026-08-04— están
cerrados, y del Tier 5, funcionalidad de negocio, 13 de 15. Quedan `T5-14` (varios almacenes) y
`T5-15` (lotes y caducidad), que solo se abren con un caso de uso real. El Tier 6 —el mostrador y el
documento de venta: lo que SistemaVenta hace y Stockly no— se abrió el 2026-10-05 con diez tareas,
de las que están cerradas de `T6-01` a `T6-04`; las tres decisiones de producto que lo gobiernan están al principio de ese tier, en
el ROADMAP.

Cuatro cosas que conviene saber antes de tocar nada:

- **Cerrada no es comprobada del todo.** `T4-17`, el recorrido con lector de pantalla, se descartó
  sin ejecutarse. El listón verificado es teclado más árbol de accesibilidad
  ([accesibilidad.md](accesibilidad.md)).
- **Las fichas son pistas, no descripciones verificadas.** Siete describían mal su propio problema
  —la causa, el alcance o el remedio— y están marcadas en el índice del ROADMAP. Medir antes de
  arreglar, y medir otra vez después.
- **Varias decisiones se tomaron en contra de la opción evidente**, y por eso hay nueve
  [ADR](adr/). Antes de simplificar algo que parezca complicado de más, se lee la suya.
- **Un árbol de dependencias limpio no se queda limpio solo.** `verify` ya amaneció en rojo dos
  veces por avisos publicados sin que nadie tocara nada; el patrón para resolverlo está en
  [dependencias.md §2](dependencias.md).

**El suelo de cobertura se ha quedado muy por debajo de lo real** (85/72/87/87 en `jest.config.js`
y 45/50/33/46 en `vite.config.ts`, contra 96/85/97/97 y 78/81/67/80). Es lo único que impide que la
cobertura se erosione, y a esa distancia no impide nada: al subirla hay que subir el umbral.

---

## 4. Trampas del entorno, ya pagadas

*Cada una costó un fallo antes de entenderse. No hace falta redescubrirlas.*

### La base de tests (`Stockly_test`)

- **`verify` no la migra.** `jest.setup.js` deriva su nombre de `DATABASE_URL`, pero `verify` solo
  migra la de desarrollo. Tras **cada** migración nueva hay que llevarla ahí:
  `DATABASE_URL=<la de Stockly_test> pnpm exec prisma db push`.
- **`migrate deploy` no sirve para ella**: falla con P3005 o por una migración antigua marcada
  como fallida. Se sincroniza con `db push`.
- **El desfase no avisa: se disfraza de fallo del cambio recién hecho.** Cientos de tests en rojo
  con «la tabla X no existe» o «no existe el tipo `public.Role`». Antes de investigar un fallo
  masivo, mirar si el mensaje habla del esquema. Para ver qué falta:
  `DATABASE_URL=<…> pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  (en Prisma 7 ya no existe `--from-url`).
- **`db push` no ejecuta el SQL de las migraciones**, solo lleva el esquema. Lo que viva únicamente
  en un archivo de migración no llega: `pg_trgm` hay que crearla a mano, una vez
  (`CREATE EXTENSION IF NOT EXISTS pg_trgm` en esa base), o el push falla con «no existe la clase
  de operadores gin_trgm_ops».
- **Un índice único nuevo hace que `db push` pida `--accept-data-loss`** aunque la columna esté
  vacía —pasó otra vez con `sale_orders.number`, `T6-04`—. Si la migración es aditiva, se aplica su propio SQL:
  `DATABASE_URL=<…> pnpm exec prisma db execute --file prisma/migrations/<carpeta>/migration.sql`.
- **Prisma 7 pide consentimiento explícito si quien lo invoca es un agente**: hay que pasarle
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` con el texto literal de la autorización.
- **Cada archivo de Jest crea su propio pool.** Por eso en `test` las conexiones inactivas se
  cierran al segundo (`shared/lib/prisma.ts`): con 30 s se agotaba el `max_connections`.

### Los tests del backend

- **Los listados paginados responden `res.body.data.data`**, con `meta` al lado.
- **En `NODE_ENV=test` no se comprueba el CSRF.** Contra un servidor de verdad, un `POST` o un
  `PATCH` a mano necesita la cabecera `x-csrf-token` con el valor de la cookie `csrfToken`.
- **No borrar productos**: los de otros bloques tienen movimientos y la clave foránea lo impide.
  Se limpia lo propio.
- **El formato multipart no se puede probar por HTTP**: `upload.middleware` está mockeado, así que
  multer nunca corre. La normalización de `tagIds` se valida contra el esquema.
- **Zod 4:** `z.ZodRawShape` es de solo lectura. Un esquema dinámico se construye con
  `Record<string, z.ZodTypeAny>` y un bucle.
- **Un `return` en el nivel superior de un `.js` rompe la cobertura, no los tests**: Node lo
  admite, babel no al instrumentar. Síntoma: `pnpm test` en verde y `test:coverage` en rojo,
  señalando el `require` del test. El cuerpo va dentro de una función.
- **Un test no escribe en el árbol.** El primer guardián de frescura del contrato regeneraba el
  archivo que vigilaba: fallaba una vez, se arreglaba solo y parecía un fallo intermitente.
- **`pnpm audit --json` sin registro puede informar de cero vulnerabilidades.** Lo que distingue
  la auditoría que no se hizo de la que salió limpia es la clave `error` del JSON, no el código de
  salida ([dependencias.md §4](dependencias.md)).

### El E2E

- **Resiembra la base de desarrollo.** `e2e/global-setup.ts` ejecuta `pnpm db:seed` contra la
  `DATABASE_URL` de `Stockly-B/.env`, y el seed la vacía antes de sembrar. Con datos que se quieran
  conservar, antes `pnpm db:backup`. El propietario autorizó resembrar cuando haga falta.
- **Un servidor huérfano en el 3000 lo rompe, y la culpa es del limitador.** `reuseExistingServer`
  reutiliza lo que escuche, y solo los servidores que arranca Playwright llevan
  `RATE_LIMIT_MAX`. Síntomas: 429 a mitad de pasada —esperas agotadas, listas vacías— o
  `Timed out waiting 120000ms from config.webServer`. Lo mismo pasa con los servidores levantados
  a mano, **y con una pasada parcial de Playwright cortada o lanzada desde un guion**
  (`playwright test -g …`): el 2026-10-07 dejó los dos servidores vivos y la pasada completa
  siguiente dio 27 fallos de 30. Antes de investigar un fallo, mirar el puerto:
  `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,5173 }`.
- **Si el 3000 es un `pnpm dev` abierto a propósito, no hace falta cerrarlo.** Se levanta otra pareja
  en otros puertos y Playwright la reutiliza: el backend con
  `PORT=3100 FRONTEND_URL=http://localhost:5174 RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=1000`,
  Vite en el 5174 con el proxy de `/api` apuntando al 3100 —el destino está fijo en
  `vite.config.ts`, así que hace falta una configuración temporal que lo cambie con `mergeConfig`— y
  la pasada con `E2E_BASE_URL=http://localhost:5174 E2E_API_URL=http://localhost:3100`. Así se pasó
  el 2026-10-07. La base es la misma: se resiembra igual.
- **El 5173 puede tenerlo otro proyecto.** Síntoma: pruebas buscando textos «que no existen».
  Se ve mirando el `<title>` de `http://localhost:5173`. Sin matar el ajeno, se pasa en otro
  puerto, moviendo las dos variables: `E2E_BASE_URL` y `FRONTEND_URL` (o el backend rechaza por
  CORS y parece la API caída).
- **Si los servidores están en uso y no se pueden parar**, otro par: backend con `PORT=3100`,
  `FRONTEND_URL=http://localhost:5174`, `RATE_LIMIT_MAX=100000` y `AUTH_RATE_LIMIT_MAX=1000`; un
  Vite en el 5174 con el proxy a `localhost:3100`; y `E2E_BASE_URL`/`E2E_API_URL` apuntando a ellos.
- **Los dos proyectos corren en paralelo contra la misma base.** Un test que pulse «el primero de
  la lista» opera sobre lo que creó el otro. La cura es nombrar, no serializar: **si un test
  necesita `.first()`, casi siempre falta un nombre accesible.** Una pasada interrumpida deja
  órdenes y productos `E2E-*` a medias.
- **Tras un clic de navegación la página no ha cambiado todavía.** React Router navega en un
  `startTransition` y las rutas son `lazy()`: medir el título o el foco justo después da el estado
  anterior. Se espera a que la página esté pintada (`getByRole("heading", …)`).
- **Un fallo de Playwright puede nombrar un elemento que no tiene nada que ver**: solo es lo que
  había bajo las coordenadas. Se mide la geometría antes de creerse el mensaje.
- **Medir un color justo después de un clic da el de antes**: `transition-colors` dura
  150–200 ms. Se espera o se mira una captura. Y se mide con `locator.evaluate()`, no con un
  `querySelectorAll` que puede caer en la navegación duplicada.
- **Un *transport* de pino cuesta caro con el E2E delante**: subió la pasada de 36 a 66 s. Por eso
  `logger.ts` solo usa `pino-pretty` si `process.stdout.isTTY`.
- **Antes de acusar al código de una tarea, comparar con `git stash` en la misma máquina.** Evitó
  dos diagnósticos equivocados y destapó un `pnpm dev` olvidado que falseaba la medición.

### Tests de componentes (Vitest y jsdom)

- **jsdom no aplica las clases de Tailwind**: la navegación de escritorio y la de móvil están las
  dos en el DOM y los enlaces salen duplicados. Se acota con `within` (`#mobile-menu`).
- **Un `Proxy` como mock de módulo cuelga la suite** sin un solo error: responde a `then` y el
  `import()` no resuelve nunca. Los componentes se enumeran.
- **Tailwind solo genera las utilidades escritas en el código.** Una contraprueba con una clase
  que no aparece en ningún archivo no mide nada.

### CSS y navegador

- **Un `overflow-x-auto` ensancha el viewport de diseño en Chrome de Android**, y todo lo
  `position: fixed` se dimensiona contra él: un `fixed inset-0` medía 663 px en una pantalla de
  393. La cura es `contain: paint` en el contenedor (`desbordes.test.ts` lo vigila). No funcionan
  `body{overflow:hidden}`, `html{overflow-x:hidden}` ni quitar el ancho mínimo de la tabla.
- **Tailwind incrusta el color de las sombras**: redefinir `--shadow-overlay` en otro bloque no
  hace nada y no se nota. Los dos valores van dentro del token, con `light-dark()`.
- **`ring-offset-2` rellena el hueco de blanco**, no lo deja transparente: un halo en tema oscuro.
  Va con `ring-offset-surface` (`tokens.test.ts`).
- **El tema no se puede aplicar desde `main.tsx`**: un módulo es diferido y el navegador ya pintó.
  Va en un script en línea y bloqueante en `<head>`.

### Docker

- **Dos procesos pueden atarse al mismo puerto en Windows** y las conexiones van al que no es: con
  un PostgreSQL local en el 5432, el del compose se publica ahí sin error y `localhost:5432` sigue
  llegando al local. Síntoma: `AuthenticationFailed` contra una base que Docker da por sana. Para
  eso está `POSTGRES_HOST_PORT`.
- **La pila del compose no se siembra sola.** El servicio `migrate` aplica las migraciones, pero
  nadie ejecuta el seed: el login responde 401 y parece un fallo de credenciales.
- **Docker crea como directorio vacío el origen de un *bind mount* que no existe**, y la pila de
  observabilidad levanta con el objetivo caído ([operaciones.md §8](operaciones.md)).

### Windows y la consola

- **PowerShell 5.1 destroza el UTF-8**: `Get-Content | … | Set-Content` lee en ANSI y reescribe
  con doble codificación (`—` → `â€"`). Los archivos se editan con las herramientas de edición.
- **Los finales de línea no son uniformes**: hay archivos en CRLF y archivos en LF. Un reemplazo
  de varias líneas escrito con `\n` no encuentra nada en los primeros y **falla en silencio**.
- **`process.exit()` aborta libuv** si hay un proceso hijo cerrándose, y devuelve un código sin
  sentido aunque la comprobación haya pasado. `scripts/smoke.js` espera el `exit` del hijo y usa
  `process.exitCode`.
- **La contraseña de `DATABASE_URL` lleva una `@` sin codificar**: Prisma la admite y libpq no.
  Los guiones de copia lo resuelven; a mano, va como `%40` ([operaciones.md §7](operaciones.md)).

---

## 5. Cosas que dependen de ti, no del código

- **Activar el alias de búsqueda en cada clon.** `.agents/` y `.claude/` se versionan a propósito
  y son la mayoría de los archivos rastreados; sin el alias, buscar en el código devuelve sobre
  todo documentación de tooling. Una vez por repositorio:
  `git config --local include.path ../.gitconfig-stockly`. Después, `git buscar X` y
  `git buscar-archivos X`.
- **En un despliegue nuevo nadie es administrador hasta ejecutar `pnpm db:seed`.** El registro
  público crea siempre usuarios `USER`. Para promover a alguien, `PATCH /api/v1/users/:id/role`
  desde una cuenta que ya sea ADMIN.
- **El ensayo de restauración es mensual y lleva sin anotarse desde el 2026-08-12**
  ([operaciones.md §5](operaciones.md)). Una copia que no se ha restaurado no es una copia.
- **No hay ninguna versión publicada.** Los repositorios están sin etiquetar y sus `package.json`
  no coinciden (`1.0.0` y `0.0.0`); al cortar la primera hay que reconciliarlos y fechar el
  [CHANGELOG](../CHANGELOG.md).
- **Antes de tener usuarios reales o de cobrar**, lo pendiente de [legal.md §2](legal.md).
- **Un escáner de secretos avisará de la credencial filtrada, y será un falso positivo.** Está en
  el historial de `Stockly-F` (merge `4254582`), se rotó el 2026-08-10 y no queda en el árbol.
  Sigue pendiente, sin urgencia, pedir a GitHub Support que recolecte el commit huérfano `55efe3b`.

---

## 6. Decisiones vivas: lo que no conviene deshacer

*El poso de las tareas cerradas: lo que costó una medición y una sesión nueva podría revertir por
reflejo. El relato de cada una está en el [histórico](historico/ROADMAP-2026-10-05.md).*

### El contrato de la API

- **La forma de las respuestas se declara una sola vez**, en `src/contratos/api.ts`. El frontend
  compila contra una copia literal (`pnpm contratos:generar`), que se commitea en los dos
  repositorios. Por qué se copia y no se publica como paquete: [ADR 0006](adr/0006-contrato-copiado-entre-repositorios.md).
- **Ese archivo solo puede importar `zod`**: es lo que permite copiarlo. Sus enums se repiten a
  propósito y `contratos.test.ts` los compara con `$Enums`.
- **`price` y los `unitPrice` son `Importe`, o sea `string | number`**: los `Decimal` de Prisma se
  serializan como cadena, y `/reports` es la excepción. Para convertir, `aNumero()`. Estrecharlo a
  `number` es volver a la mentira que costó la tarea.
- **El spec de OpenAPI se deriva de ahí**: `components.schemas` lo genera `swagger.esquemas.ts`
  con `z.toJSONSchema()` de Zod 4 —no hace falta `zod-to-openapi`—, y las peticiones con
  `io: "input"`, porque los validadores usan `z.coerce` y lo que aceptan no es lo que producen.
  Las **rutas** de `swagger.paths.ts` sí se escriben a mano.
- **Quién puede llamar a cada ruta está en una sola tabla, `PERMISOS`**, en el contrato. El backend
  protege con `permitir("<MÉTODO> <ruta>")` y el frontend enseña botones con `usePuede()`.
  `permisos.test.ts` recorre las rutas montadas y falla si una no tiene fila, usa la de otra o
  responde distinto de lo que dice. **Una lista de roles escrita junto a una ruta** es justo lo que
  detecta, y lo que dejó `WAREHOUSE` sin poderse asignar.
- **Un error que se lance lleva código**: `new HttpError(status, "mensaje", "CODIGO", { params })`,
  dado de alta en `CODIGOS_DE_ERROR`. El `message` en español es para quien llama a la API sin
  interfaz; lo que se pinta sale del código. Uno nuevo sin traducción rompe la suite del frontend.

### Datos y consultas

- **Ningún listado se devuelve entero.** Todo `findMany` de lectura lleva `parsePagination` y
  `meta`, y **sus filtros van en el `where`**: filtrar en el navegador filtra solo la página
  traída, sin error y sin aviso. En pantalla, los recuentos salen de `meta.total`, cambiar un
  filtro vuelve a la página 1 y un gráfico que dibuja una página lo dice.
- **Un selector tampoco se llena con «todos»**: el servidor recorta cualquier `limit` a 100 y el
  resto deja de poder elegirse, sin error. Elegir un producto o un cliente es buscar en el servidor
  (`BuscadorDeProducto`, `BuscadorDeCliente`), y solo se ofrece lo recién traído: de la opción
  sale el disponible con el que la venta valida la cantidad.
- **Las exportaciones van por lotes** (`enviarExportacion`) aunque parezcan pequeñas: el histórico
  de un solo producto puede pesar más que el catálogo entero. `buildCsv` ya no lo llama ningún
  endpoint; se conserva como oráculo del test que compara las dos rutas byte a byte.
- **Las descargas van por axios** (`descargarDeLaApi`), nunca por un enlace: el navegador ignora
  `download` entre orígenes y con la sesión caducada se guardaría el error.
- **Antes de subir `work_mem`, reescribir la consulta**: en la de rotación el ajuste daba ×3.3 y
  la reescritura ×20 con el valor de fábrica. Y cuidado con `GROUP BY` sobre una expresión
  —PostgreSQL no tiene estadísticas de ella y ordena la tabla entera— y con una ventana con
  `EXCLUDE`, que es cuadrática. Cortar el cliente no para la consulta: hace falta
  `pg_cancel_backend` ([rendimiento.md](rendimiento.md) §5 y §11).
- **El seed es un libro mayor, no un montón de `create`**: construye los movimientos de todos los
  orígenes con la regla de producción y cierra exactamente en el stock del catálogo. Una tabla
  nueva se añade **también a `limpiar()`** —olvidarla no da error, deja huérfanos—, y `pnpm check`
  lo comprueba con `tsconfig.seed.json`.
- **Migraciones solo hacia adelante**: una desplegada no se edita ni se borra
  ([operaciones.md §6](operaciones.md)).
- **El símbolo de la moneda es un ajuste, y nunca se escribe a mano.** En el servidor,
  `formatearImporte(n, simbolo)` lo exige sin valor por defecto, como el `idioma` de los correos, y
  lo da `settingsService.moneda()`. En la interfaz `formatearImporte` sigue siendo una función pura:
  el símbolo vive en `shared/lib/moneda.ts`, lo fija `useNegocio` y `ProtectedRoute` no pinta hasta
  tenerlo. Los ejes de los gráficos usan `conSimboloDeMoneda`. Un test en cada repositorio busca
  un `$` pegado a una interpolación.
- **El símbolo es libre, pero solo lo que el PDF sabe imprimir.** La Helvetica de PDFKit dibuja
  `₡` o `₱` con ancho cero y sin error. La regla está en el contrato
  (`motivoSimboloDeMonedaInvalido`) y `moneda.test.ts` la mide contra la fuente: ampliarla sin
  incrustar otra fuente deja importes sin moneda.
- **El logo del negocio vive en `app_settings`, fuera de `SETTINGS_CATALOG`**, y por eso el `PATCH`
  no puede escribir su URL: solo la pone `PUT /settings/logo`, con lo que devuelve Cloudinary. Meterla
  en el catálogo «por simetría» abre la puerta a que el servidor pida cualquier dirección (`T6-07`).

- **El número de venta sale de una fila de `counters`, no de una secuencia** (`T6-04`). Una
  secuencia no se deshace con la transacción y gastaría un número en cada venta rechazada con 409.
  `siguienteNumeroDeVenta` se llama **dentro** de la transacción que crea la orden y lo último antes
  de crearla. Los tests que crean ventas con Prisma piden el suyo a `numeroDeVenta()` de
  `helpers.ts`, que usa el mismo contador. Se escribe con `escribirNumeroDeVenta`, del contrato; las
  compras y los conteos siguen con el principio de su id.

### Textos, correos y avisos

- **Ningún texto de interfaz se escribe en un componente.** Sale de `shared/i18n/es.ts` con `t()`
  y `tn()`; `en.ts` es un `Record` sobre sus claves, así que una traducción que falte no compila.
  `literales.test.ts` falla ante una cadena escrita a mano y `catalogo.test.ts` ante una clave que
  ya no lee nadie. Las familias dinámicas (`error.*`, `auditoria.*`, `ajuste.*`) están exentas
  **una a una**. El porqué del motor propio: [ADR 0007](adr/0007-i18n-propio.md).
- **Tres cosas que parecen descuidos y no lo son:** las exportaciones salen siempre en español
  —un CSV es formato de intercambio—; los motivos de un movimiento son dato y solo se traduce la
  etiqueta; y los importes no cambian de formato. Las fechas sí siguen al idioma
  (`shared/lib/fechas.ts`).
- **Ningún texto de correo se escribe en `nodemailer.ts`**: sale de `shared/i18n/correos.es.ts`.
  Cada función de envío recibe un `idioma` **obligatorio y sin valor por defecto** —con uno, un
  envío que lo olvide compilaría y saldría en español—. El registro lo toma de `Accept-Language`;
  el resto, de `users.idioma`, que el frontend sincroniza con `useSincronizarIdioma`.
- **Los avisos no tienen planificador**: las compras atrasadas y la purga de leídos se resuelven
  al consultar el contador de la campana, como mucho cada cinco minutos por proceso
  (`mantenerSiToca`). Un aviso nuevo se añade en tres sitios: el enum `NotificationType`, su forma
  en `avisoSchema` y su frase en `presentar()` de `CampanaDeAvisos.tsx`.
- **Qué compra está «atrasada» se decide igual en dos sitios**, `reunirDatosDelResumen` y
  `notificationsService.mantener`: si cambia, cambia en los dos.
- **El backend tampoco tiene planificador para el resumen semanal**: lo envía un comando que se
  programa desde fuera ([operaciones.md §10](operaciones.md)).
- **Las alertas por correo no bloquean la respuesta**: se disparan sin esperar, y
  `esperarAlertasEnVuelo()` existe para que los tests puedan esperarlas.

### Diseño

La referencia es [`Stockly-F/docs/design-system.md`](../../Stockly-F/docs/design-system.md), y es
**lectura previa a tocar una pantalla**: varias de sus reglas ponen `pnpm verify` en rojo.

- **El modo oscuro es capa semántica, no clases `dark:`.** Cada token declara sus dos valores con
  `light-dark()`. No se invierte la paleta —los estados se aclaran y desaturan—, los rellenos son
  `bg-primary text-surface` y **nunca `text-white`**, y los gráficos usan `var(--color-chart-N)`.
- **Los ítems de menú son cajas delimitadas** y salen de `clasesDeItemDeMenu()` y
  `CLASES_PANEL_DE_MENU`. El borde se pinta en `focus-visible`, nunca en `focus` a secas, y el
  `gap-1` entre ítems no es estético: sin él los recuadros parecen solaparse.
- **La fila de la tabla de productos mide 48 px**, no los 36 del perfil denso: relleno, nombre y
  SKU ya los suman. Bajar es una decisión de producto.
- **Una tabla que se usa con el móvil en la mano no lleva `CLASES_TABLA`**: su ancho mínimo deja
  columnas tras un desplazamiento sin barra. Una pantalla de almacén se revisa a 393 px.
- **Un modal puede abrirse encima de otro.** `Modal` lleva una pila: solo el de arriba atiende a
  Escape y al tabulador. Uno nuevo no necesita hacer nada, salvo **quedar fuera del `<form>`** del
  de abajo si lleva el suyo: el portal no corta los eventos de React, y su envío subiría.
- **Lo que se despliega dentro de un diálogo se trae a la vista** (`scrollIntoView`): el cuerpo
  del `Modal` tiene scroll propio y recorta lo que cuelgue de una fila baja.

### Accesibilidad

- **`<main id="contenido" tabIndex={-1}>` es un destino**: sin el `tabIndex` el enlace de saltar
  al contenido no mueve el foco. `AnuncioDeRuta` lo usa en cada cambio de ruta, manda
  `scrollTo(0, 0)` y enfoca con `preventScroll`; en `POP` no toca nada, para que atrás y adelante
  recuperen su posición.
- **Un desplegable de navegación no es un `menu`**: con ese rol los enlaces dejan de anunciarse
  como enlaces. `UserMenu` sí lo lleva, porque dentro hay un comando.
- **Al añadir una ruta hay que darle título** en `shared/lib/titulos.ts`, o `titulos.test.ts`
  falla: sin entrada se anunciaría «Página no encontrada».

### Compilación y despliegue

- **`smoke` no es redundante con `build`**: `tsc` no reescribe los alias `@/`, así que un build
  que compila puede no arrancar.
- **La imagen de producción se poda con una regla, no con una lista**
  (`scripts/podar-produccion.js`): corta los *peers* opcionales de `@prisma/client` y barre lo
  inalcanzable. Podar en un `RUN` posterior al `install` no encoge la imagen. Las migraciones las
  aplica el servicio `migrate` del compose, no el `CMD`.
- **La imagen de PostgreSQL del compose nunca va por debajo del servidor más nuevo que se use**:
  `pg_restore` solo va hacia adelante ([operaciones.md §9](operaciones.md)).
- **Una dependencia que se carga bajo demanda necesita su regla en `manualChunks`**: lo que no se
  nombra cae en `vendor`, que se descarga siempre. Tras añadir una librería pesada, mirar en
  `dist/index.html` qué trozos se precargan.
- **Hay observabilidad**: `pino` con `requestId` por petición, devuelto en `x-request-id`. Al
  depurar un fallo, ese identificador es lo primero que se pide.

### Negocio

- **Un código de barras tiene una regla y un tamaño mínimo.** Qué código es válido lo decide
  `motivoCodigoDeBarrasInvalido`, en el contrato. Las etiquetas no dibujan barras de menos de
  0,2 mm: con 0,15 el escáner no las leyó. El E2E imprime un SKU de 17 caracteres y lo vuelve a
  leer; es la prueba de que el límite se lee.
- **La asimetría al cancelar una venta es intencionada.** Una pendiente se cancela con un clic;
  una enviada abre un diálogo que dice cuántas unidades vuelven. Lo que se confirma es el
  movimiento de stock, y el recuento excluye los ítems sin `productId`.
- **La licencia es la AGPL-3.0-only** ([ADR 0009](adr/0009-licencia-agpl.md)). No hay que romper
  el enlace al código en «Acerca de Stockly», que es lo que pide su cláusula 13, ni aceptar una
  contribución externa sin acuerdo de cesión si se quiere conservar la doble licencia.

### Verificar un cambio de interfaz en el navegador

`pnpm dev` en los dos repositorios y entrar con `admin@stockly.app`. Si hace falta un estado que la
base no tiene —un producto agotado, una venta enviada—, se crea por la API con el token CSRF de la
cookie (`csrfToken` → cabecera `x-csrf-token`) **y se borra después**. Una venta ya enviada no se
puede borrar por la API: la limpieza pide un guion con el cliente de Prisma
(`pnpm exec tsx`, importando `./src/shared/lib/prisma`, que es quien tiene el adaptador).
