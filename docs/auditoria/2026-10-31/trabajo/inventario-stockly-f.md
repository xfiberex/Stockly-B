# Línea base · Stockly-F

- Fecha: 2026-10-31 12:32 (hora local)
- Directorio: /c/Users/User/Desktop/Cursos y Proyectos/08 - Proyectos con el Stack PERN/Stockly - Gestor de Inventario Profesional/Stockly-F

## Git
- Commit auditado: 424e39746036d3753651e8756a83bbe5b04afc4b
- Rama: main
- Árbol de trabajo: limpio
- Último commit: 2026-10-10 · feat(lotes): pantalla de caducidades y lote en cada entrada de stock
- Commits totales: 129
- Autores distintos (12 meses): 2
- Remoto origin: https://github.com/xfiberex/Stockly-F.git

## Stack detectado (por archivos presentes)
- Node.js / JavaScript (package.json)
- TypeScript
- Framework web con configuración propia (Next, Nuxt, Vite, Astro, Svelte, Remix, Vue o Angular)
- Python
- Contenedores (Docker / Compose)
- CI: GitHub Actions
- Plantilla de variables de entorno
- Servidores MCP del proyecto (.mcp.json)
- Dependencias clave en package.json raíz: react react-dom 

## Documentos del proyecto
- README.md (210 líneas)
- CLAUDE.md (84 líneas)
- LICENSE (661 líneas)
- CONTRIBUTING.md (24 líneas)
- .claude/settings.json (13 líneas)

## Tamaño
- Archivos versionados: 832
- Por extensión (las 15 más frecuentes):
  - .md: 387
  - .ts: 151
  - .tsx: 125
  - .csv: 53
  - .py: 41
  - .json: 14
  - .txt: 7
  - .cjs: 7
  - .yml: 2
  - .js: 2
  - .gitignore: 2
  - .yaml: 1
  - .toml: 1
  - .svg: 1
  - .html: 1
- Líneas en archivos de código, sin el código generado (usa esta cifra para el tamaño de presupuesto.md): 37336
- Archivos de código más grandes:
  - src/shared/contratos/api.generated.ts (líneas: 1771)
  - e2e/flows.spec.ts (líneas: 1317)
  - src/shared/i18n/es.ts (líneas: 1268)
  - src/shared/i18n/en.ts (líneas: 1219)
  - src/modules/purchase-orders/components/PurchaseOrdersPage.tsx (líneas: 800)
  - src/modules/sale-orders/components/SaleOrdersPage.tsx (líneas: 763)
  - src/tests/lots/Lotes.test.tsx (líneas: 670)
  - src/modules/products/components/StockMovementsPage.tsx (líneas: 529)
  - src/App.tsx (líneas: 507)
  - src/tests/settings/SettingsPage.test.tsx (líneas: 438)
- Código generado (excluido del tamaño): 14125 líneas en 48 archivos. Revísalo solo si el alcance lo pide (p. ej. migraciones en el área 7).

## Hotspots (archivos más modificados en los últimos 12 meses)
- src/App.tsx (cambios: 38)
- src/shared/i18n/es.ts (cambios: 32)
- src/shared/i18n/en.ts (cambios: 32)
- src/modules/products/components/ProductTable.tsx (cambios: 29)
- src/shared/contratos/api.generated.ts (cambios: 27)
- src/routes/index.tsx (cambios: 26)
- README.md (cambios: 26)
- src/modules/products/components/StockMovementsPage.tsx (cambios: 25)
- src/tests/products/ProductTable.test.tsx (cambios: 23)
- src/modules/products/components/ProductsPage.tsx (cambios: 23)
- src/modules/products/api/product.api.ts (cambios: 22)
- src/modules/dashboard/components/DashboardPage.tsx (cambios: 22)
- e2e/flows.spec.ts (cambios: 22)
- CLAUDE.md (cambios: 22)
- src/modules/sale-orders/components/SaleOrdersPage.tsx (cambios: 21)

## Scripts de package.json (raíz)
- dev: vite
- build: tsc -b && vite build
- check: tsc -b
- lint: eslint .
- preview: vite preview
- test: vitest
- test:run: vitest run
- test:coverage: vitest run --coverage
- test:e2e:full: playwright test
- test:e2e:desktop: playwright test --project=chromium
- auditoria: node scripts/auditoria.js
- verify: pnpm run check && pnpm run lint && pnpm run test:coverage && pnpm run build && pnpm run auditoria

## Pruebas
- Archivos que parecen de prueba: 92
- Pruebas end-to-end web (Playwright o Cypress)

## Workflows de CI
- .agents/skills/playwright-best-practices/.github/workflows/validate-skill.yml
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
