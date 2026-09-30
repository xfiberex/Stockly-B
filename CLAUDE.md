# Stockly — Backend

API REST del sistema de inventario. El frontend vive en un repositorio hermano, `Stockly-F`, que se clona al lado de este.

```
01-Stockly/
├── Stockly-B/   ← este repositorio
└── Stockly-F/
```

## Documentación viva

Está en [`docs/`](docs/), y cubre **los dos repositorios**:

| Archivo | Qué es |
|---|---|
| [docs/CONTEXTO.md](docs/CONTEXTO.md) | **Empieza aquí al retomar el proyecto.** Estado actual, decisiones vivas, trampas del entorno ya pagadas y por dónde seguir |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 129 tareas con dependencias, progreso y métricas. La fuente de verdad del trabajo pendiente |
| [docs/operaciones.md](docs/operaciones.md) | Copia de seguridad, restauración y reversión, y **la versión de PostgreSQL del compose** (§9). Léelo **antes** de tocar una migración desplegada o de subir la imagen de la base |
| [docs/dependencias.md](docs/dependencias.md) | Vulnerabilidades y licencias de las dependencias de producción, y cómo funciona la puerta de `pnpm auditoria`. Léelo **antes** de añadir una dependencia |
| [docs/rendimiento.md](docs/rendimiento.md) | Mediciones con 100 000 productos: índices antes/después, latencias bajo carga y los cuellos conocidos. Léelo **antes** de tocar una consulta de listado |
| [docs/accesibilidad.md](docs/accesibilidad.md) | Lighthouse y recorrido de teclado sobre la aplicación desplegada, y **lo que no se comprobó** |
| [docs/INFORME-AUDITORIA.md](docs/INFORME-AUDITORIA.md) | Los hallazgos que justifican cada tarea. **Congelado a propósito:** está escrito en presente y describe el 2026-08-04, no el estado actual |
| [docs/README-proyecto.md](docs/README-proyecto.md) | Arranque desde cero de los dos repositorios |
| [docs/adr/](docs/adr/) | Decisiones de arquitectura no obvias: por qué algo está hecho así antes de simplificarlo |
| [Stockly-F/docs/design-system.md](../Stockly-F/docs/design-system.md) | Lectura previa a tocar cualquier pantalla. Varias de sus reglas ponen `pnpm verify` en rojo |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Puerta de calidad, convención de commits y qué anotar al cerrar una tarea |
| [CHANGELOG.md](CHANGELOG.md) | Registro de cambios de los dos repositorios |

Vive aquí porque la carpeta que contiene ambos repositorios no está bajo control de versiones. Las rutas del tipo `Stockly-F/src/...` que aparecen en esos documentos se refieren al repositorio hermano.

**Al cerrar una tarea, anótala en el ROADMAP** (marca la casilla, añade fila en Progreso y actualiza las métricas). Ese registro es lo que sobrevive entre sesiones y entre equipos.

## Verificación: `pnpm verify`, en local y en la CI

La puerta de calidad es un comando, el mismo en el portátil y en GitHub Actions ([ADR 0008](docs/adr/0008-integracion-continua.md), 2026-09-28, desde que los repositorios son públicos; sustituye a la 0005, que la había descartado). **Se ejecuta en local antes de cada commit**: la CI lo repite, no lo sustituye. El workflow ([.github/workflows/verify.yml](.github/workflows/verify.yml)) llama al mismo script y no reproduce sus pasos — si algún día se le añade un paso propio, la CI y el portátil empiezan a pedir cosas distintas:

```bash
pnpm verify
```

Encadena `prisma generate → prisma migrate deploy → check → test:coverage → build → smoke → auditoria`.

El paso `auditoria` ([scripts/auditoria.js](scripts/auditoria.js), T4-07) rompe la compilación ante una vulnerabilidad **alta o crítica** en dependencias de producción o ante una licencia fuera de la lista permitida. **Sin red avisa y deja pasar** —«no se puede saber» no es «hay un problema»—; `pnpm auditoria --estricto` convierte ese aviso en fallo, que es la forma de usarlo antes de publicar. La comprobación de licencias no necesita red y no tiene excusa: sale del lockfile.

**La imagen de producción se poda en el `build`** (T4-14). [`scripts/podar-produccion.js`](scripts/podar-produccion.js) corta los peers opcionales de `@prisma/client` —`prisma` y `typescript`, que pnpm instala solos aunque nadie los enlace— y barre todo lo que deja de ser alcanzable desde los enlaces de la raíz. **Es una regla, no una lista**, y por eso no hay que tocarlo al subir de versión de Prisma. Dos cosas que parecen equivalentes y no lo son, las dos medidas: podar en un `RUN` posterior al `install` **no encoge la imagen** —la capa de abajo viaja igual— y podar por lista deja fuera las transitivas. Las migraciones ya no van en el `CMD`: las aplica el servicio `migrate` del compose, que termina antes de que arranque el backend.

**La prueba de carga (`load/`, T4-08) no está en `verify` y no debe estarlo:** tarda minutos, necesita Docker y sus números dependen de la máquina. Se lanza a mano con `pnpm carga:sembrar` → `pnpm carga:consultas` / `pnpm carga:ejecutar`, siempre contra `Stockly_carga`, una base aparte que los guiones recrean. Desde T5-09 el generador siembra también costes, ventas y compras con recepciones, así que las consultas de informes se miden con datos.

El paso `smoke` ([scripts/smoke.js](scripts/smoke.js)) arranca `dist/server.js` de verdad y consulta `/api/v1/health`. No es redundante con `build`: `tsc` no reescribe los alias `@/`, así que un build que compila puede seguir sin arrancar — es exactamente el fallo que costó la tarea T0-01. Usa `SMOKE_PORT` (3100 por defecto) para no chocar con el `dev`.

Requisitos para que `verify` pase:

- **PostgreSQL accesible** y `DATABASE_URL` apuntando a él. Sirve Docker (`docker compose up db -d`, desde este directorio) o un PostgreSQL instalado en la máquina — el puerto varía según el equipo, ajústalo en el `.env`.
- **Las cuatro variables imprescindibles** en `.env`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` y `FRONTEND_URL`. Desde T1-26, Cloudinary y SMTP son opcionales de verdad: sin ellas el servidor arranca y solo la función correspondiente responde 503.
- `prisma generate` **antes** de `check` y `build`: el cliente se emite en `src/generated/prisma`, que está en `.gitignore`.

`jest.setup.js` reescribe el nombre de la base de `DATABASE_URL` a `Stockly_test`. Los tests nunca tocan la base de desarrollo. **`verify` no migra `Stockly_test`**: tras una migración nueva, en local se lleva con `DATABASE_URL=…/Stockly_test pnpm exec prisma db push` (esa base no tiene el historial de migraciones al día; `migrate deploy` falla ahí por una migración antigua marcada como fallida). En los tests el pool cierra las conexiones inactivas al segundo (`shared/lib/prisma.ts`): cada archivo de Jest crea su propio pool, y con 30 s se acumulaban hasta agotar el `max_connections` de PostgreSQL.

**En la CI**, esa base nace vacía en cada ejecución y el workflow la crea y la migra antes de `verify`. El repositorio es público: permisos de solo lectura, acciones **fijadas por SHA** (se suben a mano, resolviendo la etiqueta con `gh api repos/<acción>/commits/<etiqueta>`) y `pull_request`, nunca `pull_request_target`. **Un cambio de contrato se sube primero aquí**: la CI del frontend clona el `main` de este repositorio para comprobar que su copia está al día.

## Convenciones

- Gestor de paquetes: **pnpm 12.4.1** (fijado en `packageManager` y en el `Dockerfile`, en los dos repositorios). No usar npm ni yarn. Se subió desde 11.2.2 el 2026-08-09 —las versiones `<11.8.0` arrastraban avisos de path traversal y de ejecución de lifecycle scripts— y a la 12 el 2026-09-28. pnpm 12 **rechaza ajustes desconocidos** en `pnpm-workspace.yaml`.
- **Una transitiva vulnerable que su dueño fija a versión exacta se sube con `overrides`** en `pnpm-workspace.yaml`, no esperando a una versión nueva del paquete que la trae. Cada línea es deuda y lleva escrito cuándo retirarla. Ver [docs/dependencias.md](docs/dependencias.md) §2.
- Comentarios y documentación **en español**, como el resto del código.
- **`.agents/` y `.claude/` se versionan a propósito** (T3-06): el proyecto se trabaja desde varias máquinas y el tooling viaja con él. Son la mayoría de los archivos rastreados, así que para buscar en el código conviene excluirlos: `git buscar X` —tras activar una vez `git config --local include.path ../.gitconfig-stockly`— o `git grep X -- ":!.agents" ":!.claude"`.
- Nunca versionar credenciales reales. El `.env` está ignorado y debe seguir así: una fuga de este tipo ya obligó a reescribir el historial del repositorio (tarea T0-06).
- **El spec de OpenAPI no se escribe a mano** (T4-02). `components.schemas` lo genera [`src/swagger.esquemas.ts`](src/swagger.esquemas.ts) desde el contrato y los validadores, con `z.toJSONSchema()` de Zod 4 —**no hace falta `zod-to-openapi`**, aunque la ficha lo pidiera—. Las **rutas** de [`src/swagger.paths.ts`](src/swagger.paths.ts) sí siguen escritas: no se deducen de un esquema.
- **Quién puede llamar a cada ruta está en una sola tabla, `PERMISOS`, en el contrato** (T5-13). Una ruta nueva se protege con `permitir("<MÉTODO> <ruta>")` y necesita su fila; **no escribas una lista de roles al lado** (`requireRole(...)`), que es justo lo que `permisos.test.ts` detecta. Ese test recorre las rutas montadas en `MONTAJES` (`src/routes/index.ts`) y falla si una no tiene fila, si usa la de otra o si algún rol recibe 403 donde su fila no lo dice. El frontend lee la misma tabla con `usePuede()`.
- **Un error que se lance debe llevar código** (T4-04): `new HttpError(status, "mensaje en español", "CODIGO", { params })`, con el código dado de alta en `CODIGOS_DE_ERROR` del contrato. El `message` sigue siendo lo que ve quien consulta la API sin interfaz; el `code` es lo que permite al frontend enseñar la frase en el idioma del usuario, y los `params` son los huecos —una frase con los valores ya metidos no se puede traducir—. Un código nuevo sin traducción rompe la suite del frontend en cuanto se regenera el contrato. Ver [ADR 0007](docs/adr/0007-i18n-propio.md).
- **Ningún texto de correo se escribe en `nodemailer.ts`** (T4-12). Sale de [`src/shared/i18n/correos.es.ts`](src/shared/i18n/correos.es.ts) —el catálogo de referencia— y `correos.en.ts` es un `Record` sobre sus claves, así que **una frase sin traducir no compila**. Cada función de envío recibe un `idioma` **obligatorio y sin valor por defecto**: con uno, un envío que se olvide de pasarlo compilaría y saldría en español. De dónde sale ese idioma no es lo mismo en todos: el **registro** lo toma de `Accept-Language` —único correo hacia alguien que aún no tiene fila— y el resto de `users.idioma`, porque las alertas no tienen ninguna petición detrás.
- **Ningún listado se devuelve entero** (T4-15). Todo `findMany` que sirva a un endpoint de lectura lleva `parsePagination` + `meta`, y **sus filtros van en el `where`, no en el cliente**: filtrar en el navegador sobre una página filtra lo traído, y el resultado depende de en qué página estabas — sin error y sin aviso. Lo mismo vale para las exportaciones, que van por lotes con `enviarExportacion` aunque parezcan pequeñas: el histórico de **un solo producto** puede pesar más que el catálogo entero, y ese fue justamente el endpoint que se dio por resuelto sin serlo.
- **Antes de subir `work_mem` u otro parámetro del servidor, reescribe la consulta** (T4-16). Medido en la de rotación del dashboard: el ajuste daba ×3.3 y la reescritura ×20 **con el valor de fábrica**. `work_mem` se reserva **por conexión y por nodo de ordenación**, así que subirlo para tapar una consulta multiplica por todo lo demás lo que el servidor puede pedir. Y cuidado con `GROUP BY` sobre una **expresión** —`TO_CHAR(fecha,'YYYY-MM')`—: PostgreSQL no tiene estadísticas de ella, estima muchos grupos, descarta el `HashAggregate` y ordena la tabla entera para devolver veinte filas. Las mediciones, en [docs/rendimiento.md](docs/rendimiento.md) §5.
- **El seed no es un montón de `create`, es un libro mayor.** [`prisma/seed.ts`](prisma/seed.ts)
  construye los movimientos de **todos** los orígenes en un solo sitio y con la regla del código
  de producción —recibir una orden de compra es entrada, enviar una de venta es salida, lo
  pendiente y lo cancelado no mueven nada— y **cierra exactamente en el stock del catálogo**,
  fallando si algún saldo baja de cero. Antes cada bloque inventaba su parte y la suma del
  histórico de un producto no daba su stock. Dos cosas al tocarlo: una tabla nueva en el esquema
  se añade **también a `limpiar()`** —las claves foráneas son `SetNull` o `Cascade`, así que
  olvidarla no da error, solo deja huérfanos entre siembras—, y `pnpm check` lo comprueba con
  [`tsconfig.seed.json`](tsconfig.seed.json), porque el `tsconfig.json` principal solo mira
  `src/**/*` y por eso nada detectó que el seed había dejado de describir el esquema.
- **La forma de las respuestas de la API se declara una sola vez**, en [`src/contratos/api.ts`](src/contratos/api.ts) (T4-01). `Stockly-F` compila contra una copia literal de ese archivo. Al cambiarlo: `pnpm contratos:generar` y commitear en **los dos** repositorios. Ese archivo **solo puede importar `zod`** —es lo que permite copiarlo—, y sus enums se repiten a propósito, vigilados contra `$Enums` por un test. Ver [ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md).
