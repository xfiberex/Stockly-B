# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Versión exacta: corepack rechaza rangos semver y el build no es reproducible con @latest
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

# pnpm-workspace.yaml lleva la lista `allowBuilds`; sin él pnpm aborta con
# ERR_PNPM_IGNORED_BUILDS al no poder ejecutar los scripts de instalación de Prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# prisma.config.ts resuelve env("DATABASE_URL") al cargarse y .dockerignore excluye .env,
# así que `prisma generate` necesita un valor en build. No se usa para conectar: la URL
# real llega por entorno en tiempo de ejecución.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL

# Genera el cliente Prisma y compila TypeScript (tsc + tsc-alias resuelve los alias @/)
RUN pnpm exec prisma generate
RUN pnpm build

# ── Stage 2: Migrador ─────────────────────────────────────────────────────────
#
# T4-14 — **aplicar migraciones y servir peticiones son dos trabajos distintos**, y hasta
# ahora los hacía la misma imagen: el `CMD` era `prisma migrate deploy && node dist/server.js`,
# así que el CLI de Prisma tenía que viajar en la imagen de producción. Con él viajaban su
# árbol entero y `@prisma/studio-core` —una interfaz gráfica de 42 MB, medidos— que un
# servidor no abre jamás.
#
# Esta etapa **es el `builder`**, que ya tiene el CLI, el esquema y las migraciones. No añade
# ni un byte a la imagen que corre en producción: se usa como contenedor de inicialización,
# vive lo que tarda `migrate deploy` y termina. Ver el servicio `migrate` del compose.
FROM builder AS migrator

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── Stage 3: Dependencias de producción, podadas ──────────────────────────────
#
# T4-14 — **el árbol de producción no es el que se declara.** `@prisma/client` declara
# `prisma` y `typescript` como *peers opcionales*, y pnpm los instala solos: el CLI entero se
# materializa en el almacén virtual aunque `prisma` esté en `devDependencies` y nadie lo
# enlace ni lo ejecute. Con él llegan, medidos dentro de la imagen:
#
#   @prisma/studio-core   42 MB   una interfaz gráfica, con su árbol de diagramas
#                                 (`elkjs`, `@visx/*`, `robust-predicates`) — y de aquí sale
#                                 la **única EPL-2.0** del proyecto
#   effect                34 MB   vía @prisma/config
#   typescript            24 MB   peer de tipos: el servidor corre JavaScript compilado
#   @electric-sql/pglite  23 MB   un PostgreSQL para el navegador, vía @prisma/dev
#   @prisma/dev           18 MB   se llama «dev»
#
# Todo eso cuelga del CLI, comprobado con `pnpm why`. Lo poda
# [`scripts/podar-produccion.js`](scripts/podar-produccion.js), que **corta los dos peers y
# barre lo que deja de ser alcanzable** en vez de enumerar paquetes: una lista escrita a mano
# envejece con cada versión de Prisma y deja fuera las transitivas —la primera versión de esta
# poda recortaba tamaño pero dejaba 292 entradas de 313—.
#
# Va **en el mismo `RUN` que la instalación**, que es la única forma de que lo borrado no se
# quede viajando en una capa inferior.
#
# **No se evita con `auto-install-peers=false`** a propósito: esa opción se registra en el
# lockfile, así que cambiaría también la resolución de desarrollo y de los tests. Esto solo
# toca la imagen.
FROM node:22-alpine AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/podar-produccion.js ./scripts/

RUN pnpm install --frozen-lockfile --prod && node scripts/podar-produccion.js

# ── Stage 4: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Ya no se instala nada aquí, así que **tampoco hace falta pnpm** (T4-14): el arranque es
# `node dist/server.js` a secas. Un gestor de paquetes menos en la imagen de producción.

# El árbol de producción llega ya podado desde la etapa `deps`. **Se copia y no se instala
# aquí, y eso importa:** borrar en un `RUN` posterior no encoge la imagen ni un byte —la capa
# que trajo los archivos sigue viajando debajo—. Medido: la primera versión de esta poda
# ahorró 0 MB por hacerla en su propio `RUN`.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copia build y archivos necesarios
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/src/generated ./src/generated
# Node lo lee para resolver `type` y `main`; sin él, la resolución de módulos cambia.
COPY --chown=node:node package.json ./

# **El `chown -R /app` que había aquí se retiró y no es cosmética:** `RUN chown` reescribe
# los metadatos de todo el árbol y eso **duplica los 300 MB de `node_modules` en una capa
# nueva**. Los `COPY --chown` de arriba ya dejan los archivos a nombre de `node`, y con el
# arranque en `node dist/server.js` nadie escribe dentro de `/app`.

# La imagen `node` ya trae el usuario `node` (uid 1000). Sin esto, el proceso
# corre como root: una ejecución arbitraria de código dentro del contenedor
# tendría todos los privilegios sobre él.
USER node

EXPOSE 3000

# Solo arranca. Las migraciones las aplica el servicio `migrate` **antes** de que este
# contenedor exista (T4-14), y el compose lo espera con `service_completed_successfully`.
#
# Que estuvieran en el mismo `CMD` no era solo cuestión de tamaño: con varias réplicas, cada
# una lanzaba `migrate deploy` a la vez contra la misma base.
CMD ["node", "dist/server.js"]
