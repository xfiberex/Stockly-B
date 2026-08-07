# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Versión exacta: corepack rechaza rangos semver y el build no es reproducible con @latest
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

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

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

# Solo dependencias de producción — `prisma` está entre ellas porque el CMD
# ejecuta `prisma migrate deploy` al arrancar el contenedor
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copia build y archivos necesarios
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/src/generated ./src/generated
COPY --from=builder --chown=node:node /app/prisma ./prisma
# schema.prisma declara el datasource sin `url`: la URL vive en prisma.config.ts
COPY --from=builder --chown=node:node /app/prisma.config.ts ./

# `pnpm install` corre como root y deja node_modules y su caché a nombre de root.
# El proceso solo necesita leerlos, pero prisma y pnpm escriben en /app/.cache y
# similares, así que se cede el árbol entero al usuario sin privilegios.
RUN chown -R node:node /app

# La imagen `node` ya trae el usuario `node` (uid 1000). Sin esto, el proceso
# corre como root: una ejecución arbitraria de código dentro del contenedor
# tendría todos los privilegios sobre él.
USER node

EXPOSE 3000

# Aplica migraciones pendientes y arranca
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/server.js"]
