# Línea base · Stockly-B

- Fecha: 2026-10-31 12:31 (hora local)
- Directorio: /c/Users/User/Desktop/Cursos y Proyectos/08 - Proyectos con el Stack PERN/Stockly - Gestor de Inventario Profesional/Stockly-B

## Git
- Commit auditado: 8fccbd460b3d8244ebca608c02e09e77fa162eeb
- Rama: main
- Árbol de trabajo: 1 archivo(s) con cambios sin commit (la auditoría los incluye)
- Último commit: 2026-10-10 · feat(lotes): lotes y fechas de caducidad, con salida por orden de caducidad
- Commits totales: 110
- Autores distintos (12 meses): 2
- Remoto origin: https://github.com/xfiberex/Stockly-B.git

## Stack detectado (por archivos presentes)
- Node.js / JavaScript (package.json)
- TypeScript
- Contenedores (Docker / Compose)
- CI: GitHub Actions
- Migraciones de base de datos
- Plantilla de variables de entorno
- Dependencias clave en package.json raíz: @prisma/client express prisma 

## Documentos del proyecto
- README.md (272 líneas)
- CLAUDE.md (99 líneas)
- CHANGELOG.md (296 líneas)
- LICENSE (661 líneas)
- CONTRIBUTING.md (193 líneas)
- Auditorías previas en docs/auditoria/:
  - 2026-10-31

## Tamaño
- Archivos versionados: 605
- Por extensión (las 15 más frecuentes):
  - .md: 224
  - .ts: 220
  - .py: 43
  - .sql: 32
  - .js: 13
  - .yml: 8
  - .json: 8
  - .yaml: 2
  - .gitignore: 2
  - .toml: 1
  - .sh: 1
  - .prisma: 1
  - .example: 1
- Líneas en archivos de código, sin el código generado (usa esta cifra para el tamaño de presupuesto.md): 37151
- Archivos de código más grandes:
  - src/contratos/api.ts (líneas: 1759)
  - prisma/seed.ts (líneas: 1160)
  - src/tests/lotes.test.ts (líneas: 1017)
  - src/swagger.paths.ts (líneas: 976)
  - src/tests/varios-almacenes.test.ts (líneas: 956)
  - src/modules/products/product.service.ts (líneas: 875)
  - src/modules/reports/reports.service.ts (líneas: 762)
  - src/tests/products.test.ts (líneas: 627)
  - src/tests/auth.test.ts (líneas: 625)
  - src/modules/sale-orders/sale-orders.service.ts (líneas: 598)
- Código generado (excluido del tamaño): 10545 líneas en 76 archivos. Revísalo solo si el alcance lo pide (p. ej. migraciones en el área 7).

## Hotspots (archivos más modificados en los últimos 12 meses)
- docs/CONTEXTO.md (cambios: 70)
- docs/ROADMAP.md (cambios: 68)
- CHANGELOG.md (cambios: 50)
- README.md (cambios: 34)
- prisma/schema.prisma (cambios: 33)
- package.json (cambios: 29)
- src/contratos/api.ts (cambios: 27)
- CLAUDE.md (cambios: 27)
- src/swagger.paths.ts (cambios: 22)
- src/modules/products/product.service.ts (cambios: 21)
- src/modules/sale-orders/sale-orders.service.ts (cambios: 20)
- prisma/seed.ts (cambios: 19)
- src/modules/products/product.controller.ts (cambios: 17)
- docs/README-proyecto.md (cambios: 17)
- src/modules/products/product.types.ts (cambios: 15)

## Scripts de package.json (raíz)
- dev: nodemon src/server.ts
- prebuild: node -e "require('fs').rmSync('dist',{recursive:true,force:true})"
- build: tsc && tsc-alias
- check: tsc --noEmit && tsc --noEmit -p tsconfig.seed.json
- start: node dist/server.js
- db:migrate: prisma migrate dev
- db:generate: prisma generate
- db:seed: prisma db seed
- db:studio: prisma studio
- db:reset: prisma migrate reset && prisma db seed
- db:backup: node scripts/backup.js
- db:restaurar: node scripts/restaurar.js
- resumen:enviar: tsx src/cli/resumen-semanal.ts
- test: jest --runInBand --forceExit --detectOpenHandles
- test:watch: jest --watch --runInBand
- test:coverage: jest --coverage --runInBand --forceExit
- smoke: node scripts/smoke.js
- auditoria: node scripts/auditoria.js
- carga:sembrar: node load/sembrar.js
- carga:consultas: node load/consultas.js
- carga:ejecutar: node load/ejecutar.js
- contratos:generar: node scripts/generar-contratos.js
- verify: pnpm exec prisma generate && pnpm exec prisma migrate deploy && pnpm run check && pnpm run test:coverage && pnpm run build && pnpm run smoke && pnpm run auditoria

## Monorepo
- Herramientas: pnpm-workspaces
- Paquetes o proyectos fuera de la raíz: 0
  - 

## Pruebas
- Archivos que parecen de prueba: 69

## Workflows de CI
- .github/workflows/verify.yml

## Herramientas disponibles en esta máquina
- git: git version 2.55.0.windows.3
- node: v22.23.2
- npm: 11.12.0
- pnpm: 12.4.1
- dotnet: 10.0.400
- python: no se encontr� Python; ejecutar sin argumentos para instalar desde el Microsoft Store o deshabilitar este acceso directo desde Configuraci�n > Aplicaciones > Configuraci�n avanzada de aplicaciones > Alias de ejecuci�n de aplicaciones.
- docker: Docker version 29.7.2, build a7dcaa6
- gh: gh version 2.98.0 (2026-08-20)
- claude: presente
