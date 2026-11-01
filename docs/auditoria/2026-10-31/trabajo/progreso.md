**Estado:** cerrada
**Commits:** sin decidir
**Rama de trabajo:** auditoria/2026-10-31 (la del informe; la de la Fase 2 se confirma al empezarla)

# Progreso · auditoría de Stockly · 2026-10-31

Punto de control para retomar con `/revision:auditoria continuar`, desde la carpeta raíz que contiene los dos repos. La carpeta de esta auditoría está en `Stockly-B/docs/auditoria/2026-10-31/`, no en la raíz.

## Alcance acordado (Fase 0, aprobado el 2026-10-31)

- **Re-auditoría.** La anterior es del 2026-08-04 (`Stockly-B/docs/historico/INFORME-AUDITORIA.md`, nota global 6,4). Sus 139 tareas, más las de los Tiers 5 y 6, están cerradas (`Stockly-B/docs/ROADMAP.md`).
- **Commits auditados** (los dos en `main` y con el árbol limpio):
  - `Stockly-B` (backend): `8fccbd460b3d8244ebca608c02e09e77fa162eeb`
  - `Stockly-F` (frontend): `424e39746036d3753651e8756a83bbe5b04afc4b`
  - La carpeta raíz que los contiene no es un repositorio.
- **Áreas incluidas:** 1 Código · 2 Seguridad · 3 Rendimiento · 5 Accesibilidad y semántica · 7 Arquitectura, datos y resiliencia · 8 QA y testing · 12 DevOps y configuración. Núcleo mínimo: 2, 7, 8 y 5.
- **Áreas excluidas:**
  - 4 SEO: no aplica. App privada tras login, ya declarada no indexable (T3-12).
  - 14 IA y agentes: no aplica. El producto no integra modelos de lenguaje (búsqueda en el código de los dos repos, 2026-10-31). El tooling de agentes versionado se mira en el área 12.
  - 6 UI/UX, 9 Refactorización, 10 Redacción, 11 Documentación y 13 Legal: opcionales no elegidas. La 13 maneja datos personales, pero no hay despliegue ni usuarios reales y `docs/legal.md` ya lista lo pendiente; se recomienda antes del primer despliegue.
- **Exclusiones de código:**
  - `node_modules/`, `dist/`, `coverage/` y lockfiles (estos, solo para el análisis de dependencias).
  - `.agents/`, `.claude/` y `.codegraph/`, salvo lo que ejecutan (`.claude/settings.json`, `.mcp.json`), que va al área 12.
  - Código generado: `src/generated/prisma`; `Stockly-F/src/shared/contratos/api.generated.ts` es copia literal de `Stockly-B/src/contratos/api.ts`, así que se audita el original.
  - `docs/historico/`: congelado, solo para comparar.
  - Migraciones SQL: solo las que necesite el área 7.
- **Profundidad:** rápida. Solo Crítico y Alto, dirigida por riesgo: dinero, stock, autenticación y roles, entradas del exterior y lo nuevo de los Tiers 5 y 6.
- **Tamaño:** unas 74.000 líneas sin código generado (≈32.000 de tests), «Grande» en `presupuesto.md`.

## Contexto (supuestos de la Fase 0, sin objeción del usuario)

- Herramienta interna de inventario y punto de venta para un comercio con sucursales. 4 roles: ADMIN, USER, WAREHOUSE y SELLER.
- Sin versión publicada ni usuarios reales. Escala de referencia: la de las pruebas de carga del proyecto (100.000 productos, 330.000 órdenes).
- Despliegue previsto con Docker Compose (PostgreSQL 17, backend y nginx con el frontend), sin proveedor. No hay despliegue real que observar.
- Jurisdicción no declarada (los ejemplos usan ITBIS y RD$). No se usa: el área 13 está fuera.
- Navegadores: no hay mínimo declarado. Se asumen las últimas versiones de Chrome, Edge, Firefox y Safari; se verifica en Chrome de escritorio y en móvil emulado. Safari real: no verificado.
- Producto en español e inglés; informe en español.

## Verificación en ejecución (acordada)

| Área | Verificación |
|---|---|
| 1 | Solo estática |
| 2 | En navegador (sesión 3): cabeceras, cookies, CORS y autorización entre cuentas |
| 3 | En navegador, sobre el build de producción (sesión 3). Prueba de carga con k6: fuera (no está instalado); se parte de la medición del proyecto del 2026-10-10 |
| 5 | En navegador (sesión 3), con la skill `chrome-devtools-mcp:a11y-debugging` |
| 7 y 8 | Suites del proyecto en la línea base; E2E en la base aislada (sesión 3) |
| 12 | `docker compose build` de las dos imágenes (sesión 3, arrancando Docker Desktop; sin levantar ni publicar nada) y estado de la CI con `gh`, solo lectura |

- **Base aislada:** `stockly_auditoria` en el PostgreSQL 17 local, migrada y sembrada, para el E2E y el navegador. Se borra al terminar. La base de desarrollo `stockly` no se toca.
- **Correo e imágenes:** SMTP y Cloudinary con valores `.invalid` en el entorno del proceso. `dotenv` no los pisa (`Stockly-B/src/config/env.ts:2`, `Stockly-B/src/server.ts:1`), así que el `.env` no se toca y no sale nada.
- **Navegador:** se añade un servidor `chrome-devtools-auditoria`, fijado y aislado, con `--scope local` (no escribe en los repos). Se usa tras reiniciar, en la sesión 3:
  `claude mcp add chrome-devtools-auditoria --scope local -- npx -y chrome-devtools-mcp@1.12.0 --isolated --no-usage-statistics --no-performance-crux`
- **Cuentas:** las del seed (al menos una por rol), en la base aislada. Credenciales solo en el chat.
- **Línea base:** los pasos de `pnpm verify` de cada repo, uno a uno. `prisma migrate status` (solo lectura) en lugar de `prisma migrate deploy`.

## Herramientas acordadas

- `pnpm audit`: sí. Envía nombres y versiones de las dependencias al registro de npm; los repos son públicos.
- gitleaks: binario oficial en la carpeta temporal de la sesión, checksum comprobado y `--redact`, sin instalarlo. Ya conocida: la credencial de `Stockly-F` rotada el 2026-08-10 (`docs/CONTEXTO.md` §5).
- Semgrep: no (no hay Python). Va a *Zonas no cubiertas*.
- Skills de apoyo: `dotnet-test:test-anti-patterns` (área 8) y `chrome-devtools-mcp:a11y-debugging` (área 5, en ejecución).

## Entregables y convenciones

- **Carpeta:** `Stockly-B/docs/auditoria/2026-10-31/`, por la convención del proyecto: la documentación de los dos repos vive en `Stockly-B/docs/`.
- **Entregables:** `Stockly-B/docs/ROADMAP.md`, `Stockly-B/docs/CONTEXTO.md` (hace de CONTEXT.md; no se crea otro) y `Stockly-B/CHANGELOG.md`, sin cambios en la Fase 1.
- **ROADMAP:** se conserva el esquema `T{tier}-{n}` y las 139 cerradas no se tocan. Las tareas nuevas van con `AUD-001` en adelante, en `## Tier 0 · Crítico` … `## Tier 4 · Propuestas`, más el bloque de índice. Siguiente ID libre: AUD-001.
- **Sin `HISTORICO.md`:** se conserva el esquema del proyecto (índice de cerradas en el ROADMAP y fichas en `docs/historico/`).
- **«Sin tarea» del ROADMAP:** lo que sea un defecto pasa a tarea AUD citando su origen; las decisiones de producto se quedan.
- **Notas para el paso 1.6:**
  - `validar.sh` toma `Stockly-B` como raíz y marca como ERROR un cambio en `docs/CONTEXTO.md`, porque solo admite `CONTEXT.md`. Es la excepción acordada: comprobar el `git status` de los dos repos a mano.
  - Ejecutarlo con `--roadmap Stockly-B/docs/ROADMAP.md`.
  - La guardia del plugin busca la auditoría subiendo desde el directorio de la sesión. Desde la raíz no la ve; desde `Stockly-B` sí, y entonces bloquea editar `CONTEXTO.md` en la Fase 1: pedir permiso al usuario en ese momento.

## Plan de uso

- **Plan:** Pro. `/usage` al aprobar (2026-10-31): sesión 12 %, semana 42 %. La Fase 0 se llevó ≈12 % de la sesión, si la ventana empezó con esta conversación.
- **Opción elegida:** la recomendada. 7 áreas en rápida, un subagente cada vez (los encargos de Haiku pueden ir juntos). Unas 19 unidades orientativas, sin calibración previa.
- **Sesiones:**
  1. 2026-10-31: línea base, inventario de superficie y áreas 2 y 7.
  2. Áreas 8, 1, 3 y 5.
  3. Área 12, verificación en ejecución (1.3), verificación independiente (1.4), informe y entregables (1.5 y 1.6).
- **Calibración:** pedir `/usage` al terminar el área 2. Si las tres sesiones no caben en lo que queda de semana, proponer recortar antes de seguir.

### Calibración (2026-10-31)

| Momento | Sesión | Semana | Trabajo hecho hasta entonces |
|---|---|---|---|
| Aprobación del alcance | 12 % | 42 % | Fase 0 |
| Tras la primera tanda | 42 % | 46 % | línea base (0,25), inventario (0,25) y área 2 (3) terminados; área 7 y dependencias en curso (≈1,2 de 3,5 estimado) |
| Inicio de la sesión 2 | 60 % | 48 % | nueva ventana ya gastada en un 60 % por otro uso; caben ≈3 unidades hasta el 80 %: áreas 1 y 12. El resto, a una sesión 3 |
| Sesión 2, tras el área 1 y con el 12 en curso | 65 % | 49 % | área 1 (2 u, 84.374 tokens) y parte del área 12. ≈2,5 % de sesión por unidad de Sonnet · medium, la mitad de lo calibrado (6,4 %, que incluía el arranque de la Fase 0). La ventana se reinicia a las 16:50 |
| Inicio de la sesión 3 | 72 % | 50 % | la misma ventana que la sesión 2, que se reinicia a las 16:50 |
| Sesión 4 (2026-11-01), al cierre | 44 % | 65 % | Ventana nueva (desde el 0 %). Encargos 2 y 3 del verificador, ejecución completa, consolidación, informe y entregables: ≈5 unidades, a ≈8,8 % de sesión por unidad. La mayor parte va en la conversación principal (Opus). La semana subió 6 puntos (0,14 por punto de sesión) |
| Sesión 3, tras el encargo 1 del verificador | 84 % | 52 % | 12 puntos. El encargo 1 (97.191 tokens de Sonnet · high) se llevó ≈4, a ≈25.000 tokens por punto. Los ≈8 restantes son de la conversación principal: orquestar, guardar la salida y actualizar el progreso. Se había estimado un 78 %: **la conversación principal cuesta el doble que el subagente** |

- **Recalculado en la sesión 2:** si el área 12 cierra hacia el 67 %, caben las áreas 3 (2 u) y 5 (1 u) antes del 80 % (≈8 %). La ejecución, el verificador y el informe (≈5 u, más caras porque van en la conversación principal) pasan a la sesión 3. La semana acabaría hacia el 55 %.

- **Semana por punto de sesión:** 4 ÷ 30 ≈ 0,13. Una sesión entera de 5 h ≈ 13 % de la semana.
- **Sesión por unidad:** 30 ÷ ≈4,7 unidades ≈ **6,4 %**, incluido el gasto de la conversación principal. Equivale a ≈15 unidades por sesión, frente a las ~8 supuestas.
- **Tokens por unidad:**
  - Sonnet · high: 279.079 ÷ 3 ≈ 93.000 (área 2).
  - Haiku: 73.084 ÷ 0,25 y 122.393 ÷ 0,25, unos 290.000 a 490.000 por unidad; son baratos por token.
  - Sonnet · medium: sin dato todavía.
- **Lo que falta:** ≈14,8 unidades ≈ 95 % de una sesión. Restos del área 7 y de dependencias ≈2,3; áreas 8, 1, 3, 5 y 12 = 7,5; ejecución 2; verificador 1; informe 2.
- **Tokens por unidad, tras el área 8:**
  - Sonnet · medium: 127.375 ÷ 2 ≈ **64.000**.
  - Sonnet · high: 93.000 (área 2) y 77.600 (área 7), de media ≈ 85.000. **Factor high ≈ 1,3** (supuesto 1,5).
  - Haiku: ≈290.000–490.000 tokens por unidad; a 1/20 del precio de Sonnet, **factor de coste ≈ 0,25–0,4** (supuesto 0,25).
- **Plan recalculado: 2 sesiones en vez de 3.**
  - Esta sesión: adelantar las áreas 8 y 1 hasta ~80 %.
  - Sesión 2: áreas 3, 5 y 12, verificación en ejecución, verificador, informe y entregables.
  - La semana acabaría hacia el 60–65 %. Se avisó al usuario.

### Reparto de modelos

| Encargo | Subagente | Modelo · esfuerzo previsto | Modelo real | Unidades | Tokens | Notas |
|---|---|---|---|---|---|---|
| Línea base | recolector-datos | Haiku · low | Haiku 5.5 | 0,25 | 73.084 | 32 herramientas, 18 min. Revisada: cumple el encargo; sin cambios en archivos versionados |
| Inventario de superficie | recolector-datos | Haiku · low | Haiku (según el encargo) | 0,25 | 122.393 | 18 herramientas, 6 min. 113 filas, comprobado: 112 declaraciones de rutas y 97 claves de `permitir` |
| Área 2 | auditor-area | Sonnet · high | Sonnet 5.5 · high | 3 | 279.079 | 87 herramientas, 9,5 min. Revisada: formato y anclas correctos; matriz 114 de 114 |
| Área 2 · dependencias (SCA) | auditor-area | Sonnet · high | Sonnet · high | 0,5 (real ≈1,3) | 117.816 | 42 herramientas, 7 min. Segunda pasada acotada: la línea base no existía cuando terminó la primera. Salida `02-seguridad-dependencias.md`, IDs desde P-02-101 |
| Área 7 | auditor-area | Sonnet · high | Sonnet · high | 3 | 232.854 | 51 herramientas, 7 min. Revisada: P-07-01 con anclas, contraste con compras, solución y criterio |
| Área 8 | auditor-area | Sonnet · medium | Sonnet · medium | 2 | 127.375 | 32 herramientas, 3,5 min, con la skill `dotnet-test:test-anti-patterns`. Revisada: P-08-01 confirmado contra el código (`moneda.test.ts:171` y `reports.service.ts:98`) |
| Área 1 | auditor-area | Sonnet · medium | Sonnet 5.5 · medium | 2 | 84.374 | 14 herramientas, 1,6 min. Revisada: 0 C · 0 A; conclusiones del encargo en «Debajo del umbral». Sin escalado: las transferencias con lotes ya las leyó entero el área 7 (Sonnet · high) |
| Área 3 | auditor-area | Sonnet · medium | Sonnet 5.5 · medium | 2 | 93.880 | 21 herramientas, 2,4 min. Revisada: el origen de P-03-01 está comprobado (`ROADMAP.md:61-75`, fila «La prueba de carga ya no cumple sus umbrales»; `rendimiento.md` §15, «El hallazgo») |
| Área 5 | auditor-area | Sonnet · medium | Sonnet 5.5 · medium | 1 | 86.894 | 18 herramientas, 1,4 min. Revisada: 0 C · 0 A. No leyó `design-system.md` ni `CONTEXTO.md` §6, pero no calificó nada que dependa de ellos |
| Área 12 | auditor-area | Sonnet · medium | Sonnet 5.5 · medium | 0,5 (real ≈1) | 67.523 | 16 herramientas, 2,1 min, con `gh` de solo lectura. Revisada: anclas de P-12-01 comprobadas en la conversación principal (`docker-compose.yml:89-95`, `docker-compose.prod.yml`, `auth.controller.ts:26-27`) |
| Verificar Alto · encargo 1 (seguridad y DevOps: 7) | verificador-hallazgos | Sonnet · high | Sonnet 5.5 · high | 0,6 (real ≈1,1) | 97.191 | Sesión 3. 27 herramientas, 3,8 min. 4 confirmados y 3 rebajados a Medio. Consultó los avisos con `gh api` y midió `zod` en memoria con `node -e`. Salida en `trabajo/verificacion.md` |
| Verificar Alto · encargo 2 (P-03-01, P-07-01, P-08-01 y P-08-02) | verificador-hallazgos | Sonnet · high | Sonnet 5.5 · high (se declaró «bajo») | ≈0,7 | 76.298 | Sesión 4. 26 herramientas, 3 min. 2 confirmados (P-07-01, P-08-01) y 2 rebajados a Medio (P-03-01, P-08-02). Salida en `trabajo/verificacion.md` |
| Verificar Alto · encargo 3 (P-05-01, de la ejecución) | verificador-hallazgos | Sonnet · high | Sonnet 5.5 · high | ≈0,4 | 36.111 | Sesión 4. 9 herramientas, 1 min. Rebajado a Medio |
| Fase 0, 1.3, consolidación e informe | principal | Opus 5.5 | Opus 5.5 | | | Fase 0 ≈ 12 % de la sesión. La ejecución y el informe, en la sesión 4, sin `/usage` medido |

## Estado de las áreas

| Área | Estado | Archivo |
|---|---|---|
| 2 | terminada. C 0 · A 6: P-02-01 a P-02-03 y P-02-101 a P-02-103 | `trabajo/hallazgos/02-seguridad.md` y `trabajo/hallazgos/02-seguridad-dependencias.md` |
| 7 | terminada. C 0 · A 1: P-07-01, que funde la nota SHIPPED→PENDING del área 2 | `trabajo/hallazgos/07-arquitectura.md` |
| 8 | terminada. C 0 · A 2: P-08-01 (test con fecha de caducidad: puerta del backend en rojo desde el 2026-10-24) y P-08-02 (limitadores de autenticación sin pruebas) | `trabajo/hallazgos/08-qa-testing.md` |
| 1 | terminada (sesión 2). C 0 · A 0 | `trabajo/hallazgos/01-codigo.md` |
| 3 | terminada (sesión 2). C 0 · A 1: P-03-01 (el panel lanza unas 15 consultas a la vez sobre un pool de 10 compartido con las escrituras; la regresión «Sin tarea» del 2026-10-10 sigue en el código) | `trabajo/hallazgos/03-rendimiento.md` |
| 5 | terminada (sesión 2), solo estática. C 0 · A 0 | `trabajo/hallazgos/05-accesibilidad.md` |
| 12 | terminada (sesión 2). C 0 · A 1: P-12-01 (el compose de producción hereda `COOKIE_SECURE=false`, `SameSite=lax`, `FRONTEND_URL` local y el 3000 publicado; sin TLS) | `trabajo/hallazgos/12-devops.md` |

## Línea base: lo que hay que saber

- **Frontend:** todo en verde. check, lint (0 avisos), 910 tests (1 omitido), cobertura 80,84 / 84,93 / 71,23 / 83,02 y build.
- **Backend, solo el entorno de este equipo:**
  - `Stockly_test` y la base de desarrollo `stockly` no tienen las migraciones T5-14 y T5-15. `prisma migrate status` y `diff-base-tests.sh` dan 172 líneas pendientes. Por eso fallan 1.360 de 1.652 tests y la cobertura no llega a los umbrales.
  - **Línea base del backend que se usa:** la CI, que pasó `pnpm verify` completo con el mismo commit (`8fccbd4`) el 2026-10-11.
  - Repetirla en local exige aplicar el SQL de las dos migraciones a `Stockly_test` (procedimiento de `CLAUDE.md`). Pendiente de que el usuario lo autorice.
- **`pnpm audit` deja en rojo el paso `auditoria` de los dos repos hoy:** backend en producción 3 altos; frontend en producción 5 altos. En total, 2 críticos y 10 altos en el backend, y 15 altos en el frontend. Triaje en la pasada de dependencias del área 2.

## Destino de «Para otras áreas», hipótesis y pendientes de ejecución

**Área 2, «Para escalar»** (último escalón: la conversación principal):
1. Concurrencia e idempotencia del stock → **encargo del área 7** (punto 1 de «Te toca»).
2. Rotación de refresh no atómica (`auth.service.ts:100-164`). Leído en la conversación principal: carrera real entre `findFirst` y `update`. Efecto: cierre de sesión espurio con dos refrescos a la vez, o un token robado usado a la vez que el legítimo sin disparar la alarma. Exige robar una cookie httpOnly con ruta restringida y acertar la ventana: **Medio como mucho**, fuera de la profundidad rápida. Se anota para una pasada exhaustiva.
3. Clientes creados por un SELLER al vender (`sale-orders.service.ts:82-106`). Leído en la conversación principal: decidido (T5-06, T6-06); `upsert` con `update: {}` no sobrescribe un cliente existente, y los campos pasan por el validador de la venta. **Sin hallazgo.**
4. SQL compuesto de los informes. El área 2 comprobó que no hay `Prisma.raw` ni `$queryRawUnsafe`, y las plantillas etiquetadas parametrizan cada valor. **Sin hallazgo de inyección**; el rendimiento es del área 3.

**Área 2, «Para otras áreas»:**
- `PATCH /sale-orders/:id`, de SHIPPED a PENDING, sin devolver el stock → **encargo del área 7** (punto 2 de «Te toca»), y área 1 si queda como defecto de lógica.
- Área 12: el compose publica el 3000 del backend, la contraseña `postgres` por defecto en el compose de desarrollo, y nginx sin TLS ni cabeceras → **encargo del área 12** (sesión 3).
- Documentación: `README.md:235` («por IP») y `legal.md` §2.1 → dentro de las soluciones de P-02-03 y P-02-01 (el área 11 está fuera).

**Área 2, «Hipótesis por verificar»:**
1. Cabeceras de la SPA en nginx → sesión 3, en ejecución.
2. `NODE_ENV=test` admitido fuera de Jest → apartado 7 del informe (Bajo).
3. Refresh no atómico → resuelto arriba (punto 2).

**Área 2, «Pendiente de verificar en ejecución»:** las 8 entradas de su archivo van a la lista de la sesión 3. P-02-03 sube a Confirmado si la prueba lo reproduce.

**Área 2 · dependencias (SCA)** (`02-seguridad-dependencias.md`): C 0 · A 3, todos con confianza Media.
- P-02-101 `body-parser` 2.3.0, P-02-102 `zod` 4.4.3 y P-02-103 `vite` 8.2.1 (servidor de desarrollo en Windows).
- Los otros 24 avisos no son alcanzables y están justificados en el archivo.
- **Para el verificador (sesión 2):** el auditor no leyó el texto de los GHSA. Consultarlos con `gh api /advisories/<GHSA>` (solo lectura, base pública de GitHub) para subir o bajar la confianza.
- **«Para otras áreas»:** puerta de `auditoria` en rojo desde avisos posteriores al 2026-10-11, y no hay revisión periódica de dependencias visible → **encargo del área 12** (sesión 2).
- **«Pendiente de verificar en ejecución»** (3 pruebas en entorno de pruebas: gzip con bytes de más, array de unos 30.000 elementos, `/__open-in-editor`) → lista de la sesión 2, solo si el verificador no lo resuelve.

**Área 7** (`07-arquitectura.md`):
- **«Para escalar»** (último escalón: la conversación principal):
  1. Prueba de estrés de concurrencia y orden de bloqueos. No se puede resolver leyendo. El auditor revisó el orden a mano y no vio ciclos → *Zonas no cubiertas* (sin prueba de estrés), salvo lo que se reproduzca de P-07-01 en la sesión 2.
  2. Test de propiedades para `bajarNivel`. No hay defecto encontrado: mejora de pruebas → observación del informe, sin ID (en rápida no se abren propuestas).
  3. Informes sobre varios almacenes y lotes → **encargo del área 1** (corrección) y **área 3** (rendimiento).
- **«Hipótesis por verificar»:**
  - Carreras menores, solo de ADMIN: `delete` de compras y `desactivar` de almacén → se verifican junto a P-07-01 en la sesión 2. Si no, apartado 7 (Medio).
  - `bulkUpdateStock` con lotes → sesión 2, en ejecución, si da tiempo. Si no, apartado 7.
  - Orden de venta PENDING con un producto inactivo → **encargo del área 1** (¿defecto o decisión?).
- **«Pendiente de verificar en ejecución»** → lista de la sesión 2:
  - Reproducir P-07-01 con el bloqueo retenido.
  - Esquema tras `migrate deploy`: `stock_cuadra`, `NULLS NOT DISTINCT` y `counters`.
  - Disparador diferido.
  - Cierre de un conteo grande a través de nginx.
  - SMTP y Cloudinary caídos o lentos.
  - T5-14 y T5-15 sobre datos con historia → probablemente *Zonas no cubiertas*, por coste.
- **«Para otras áreas»:**
  - Bloqueo del contador durante todo `despachar` (decisión de T6-04) y `bulkUpdateStock` → **área 3**.
  - `proxy_read_timeout` de nginx de 60 s frente a la transacción de cierre de 120 s, y axios sin `timeout` → **área 12**.
  - SELLER crea clientes al vender → ya resuelto (sin hallazgo).
  - `bulkUpdateStock` ocupa el pool → **área 3**.
- **Debajo del umbral** (observaciones del informe, sin ID): sin `CHECK` en la base; Cloudinary borra antes de confirmar; SMTP sin timeouts propios; sin claves de idempotencia; axios sin `timeout`; `["reports"]` sin invalidar; anchura de la transacción de cierre.

**Área 8** (`08-qa-testing.md`):
- **«Para otras áreas»:** las contraseñas del seed están también en `Stockly-F/e2e/helpers.ts` → se funde en **P-02-02** como «también afecta a».
- **«Hipótesis por verificar»** → apartado 7 del informe, salvo que el E2E de la sesión 2 las resuelva:
  - la ventana del 18 % del E2E (T6-05) compartida con escenarios en paralelo;
  - la idempotencia del seed para el lote caducado;
  - la CI del frontend clona `Stockly-B@main` (decidido, ADR 0006);
  - `jest.config.js` sin `collectCoverageFrom`.
- **«Para escalar»:** nada.
- **Relación entre hallazgos:** P-08-02 (limitadores sin pruebas) y P-02-03 (limitadores sin `trust proxy`) comparten módulo, pero no causa. Se consolidan como hallazgos distintos, con referencia cruzada.

**Área 1** (`01-codigo.md`, sesión 2):
- **Encargos del área 7:** la orden PENDING con un producto desactivado se puede despachar y cobrar, y no hay ninguna decisión escrita que lo respalde (candidato Medio, confianza Alta) → se funde con la hipótesis 3 del área 7 en una sola observación del informe, sin ID (en rápida no puntúa). Los informes con varios almacenes y lotes no cuentan doble; quedan dos incoherencias de criterio del panel (Medio-Bajo) → observaciones del informe.
- **«Para escalar»:**
  - Transferencias con lotes → ya cubiertas por el área 7, que leyó enteros `stock-transfers.service` y `lotes.ts`. Sin relanzar.
  - ABC y PDF con productos inactivos → *Zonas no cubiertas* (solo lectura de informes; como mucho Medio).
- **«Hipótesis por verificar»** (panel con un almacén desactivado; `caducidades?warehouseId=` con un almacén desactivado) y **«Pendiente de verificar en ejecución»** (despachar una PENDING con producto desactivado; panel frente a caducidades) → lista de la verificación en ejecución. Si no da tiempo, apartado 7 del informe.
- **«Para otras áreas»:** la regla de inactivos (área 7) va fundida arriba; el aviso del panel sobre qué incluye el valor es de UX (área 6, fuera) → *Zonas no cubiertas*.

**Área 12** (`12-devops.md`, sesión 2):
- **P-12-01, nota para el verificador:** el propio `docker-compose.yml:89-92` dice que «en un despliegue real detrás de HTTPS se quitan las dos líneas». El paso está documentado en un comentario, pero `docker-compose.prod.yml` no lo aplica, y sin las variables el backend tomaría `secure` y `SameSite=None` (`auth.controller.ts:26-27`). Que el verificador pondere si un paso manual comentado rebaja la probabilidad, y si lo grave es la cookie o la falta de TLS.
- **Estado de la CI (gh):** un workflow `verify` por repo, 10 de 10 en verde, el último del 2026-10-11 y nada después. Acciones por SHA, `contents: read` y sin `pull_request_target`. En `Stockly-B` (público) están desactivados las alertas de Dependabot, sus actualizaciones de seguridad y el secret scanning, y `main` no tiene protección de rama → observaciones del área 12. El secret scanning se cita en P-02-02 como «también afecta a».
- **Debajo del umbral** → observaciones del informe, sin ID: puerta `auditoria` roja sin revisión periódica; nginx sin cabeceras; `proxy_read_timeout` de 60 s frente a 120 s y axios sin `timeout` (funde la nota del área 7); imágenes base sin digest; `X-Forwarded-For` inyectable por el 3000 (se cita en P-02-03); `migrator` y nginx como root; sin `HEALTHCHECK` en el Dockerfile del `runner`.
- **Tooling de agentes:** riesgo bajo. No hay hooks; `.mcp.json` (solo en `Stockly-F`) lanza un binario local sin `npx`, y quedan ≈700 skills de terceros versionadas (superficie de inyección de prompt, no revisadas una a una) → *Zonas no cubiertas*.
- **«Hipótesis por verificar»:** sin backup programado frente al RPO de 24 h de `operaciones.md` §2 → apartado 7 del informe.
- **«Pendiente de verificar en ejecución»** → lista de la sesión 3: `docker compose … config` con los dos archivos, `docker compose build` con `id` y `docker history`, y un cierre de conteo de más de 60 s a través de nginx (coincide con la entrada del área 7).
- **«Para otras áreas»:** sin TLS ni `Secure` agrava P-02-03 → referencia cruzada; CI parada desde el 2026-10-11 → se une a P-08-01.
- La salida del subagente activó el aviso del entorno por «settings-json»: solo describía el contenido de `.claude/settings.json`. Sin instrucciones dentro.

**Área 3** (`03-rendimiento.md`, sesión 2):
- **P-03-01, nota para el verificador:** el auditor lo sube de Medio a Alto porque, según la medición del propio proyecto, arrastra a las escrituras de stock y dinero (p(95) de 1,12 a 1,34 s frente a 1 s) y el panel es la primera pantalla tras el login. Que el cuello sea el pool y no la CPU de PostgreSQL es inferencia, no medición. El verificador debe ponderar la subida: sin usuarios reales y con un umbral superado por poco, puede quedar en Medio. Es **ya conocido** («Sin tarea» del ROADMAP, que dice «Pide tarea propia»): si se confirma, pasa a tarea AUD citando su origen, según la convención acordada.
- **Encargos, sin hallazgo:**
  - el contador de ventas: solo `ventaDeMostrador` lo retiene durante `despachar`, sin E/S externa dentro;
  - los informes por almacén y lote: con índices y paginados en la base;
  - el frontend: el `.wasm` de zxing y el escáner van con `import()` dinámico, las 30 rutas son `lazy` y el `vendor` de 351 kB es una decisión medida.
- **Debajo del umbral** → observaciones del informe, sin ID:
  - `bulkUpdateStock` con `Promise.all` y sin `.max()` (Medio; el tope real es el cuerpo de 100 kB);
  - `POST /sale-orders` sin `.max()` en `items`, con riesgo de agotar los 5 s de la transacción (Medio). Se cita junto a la solución de P-07-01 y al `.max()` de P-02-102.
- **«Para escalar»:** una prueba de carga mixta (panel, ventas y cierre de conteos) con `pg_stat_activity` y `pg_locks` → la misma que la del área 7: *Zonas no cubiertas* (k6 no está instalado y la carga quedó fuera en la Fase 0).
- **«Pendiente de verificar en ejecución»** → lista de la sesión 3:
  - la traza en el navegador sobre el build de producción, con la pestaña de red de la ruta inicial;
  - un lote grande en `bulk-stock` y una orden con cientos de líneas, en la base aislada.
  - `pnpm carga:ejecutar` y la prueba con `max: 25` en el pool → *Zonas no cubiertas* (fuera de lo acordado).
- **«Para otras áreas»:** `axios` sin `timeout` y SMTP sin tiempos de espera → ya constan en el área 7; el tope de líneas de las órdenes → con P-07-01.

**Área 5** (`05-accesibilidad.md`, sesión 2):
- Sin barreras bloqueantes en el código: con teclado y lector se pueden completar la venta de Mostrador, la transferencia, el alta de almacén y la baja de un lote.
- **Debajo del umbral** → observaciones del informe, sin ID:
  - foco en `body` tras registrar la venta o pulsar «Nueva venta», y `role="status"` insertado ya con contenido;
  - sin mensaje de estado al añadir una línea (Mostrador y Transferencias);
  - foco perdido tras la baja de un lote;
  - toast de 3 s para los errores;
  - `Modal` pisa el `autoFocus`;
  - `Input` sin `required`.
- **«Propuesta Tier 4» de `eslint-plugin-jsx-a11y` y axe en `e2e/`** → observación, sin ID: en rápida no se abren propuestas.
- **«Hipótesis por verificar»:** el `aria-label` fijo del botón de despliegue de las transferencias (`TransfersPage.tsx:251`, 4.1.2 / 2.5.3) → se comprueba en ejecución con el árbol de accesibilidad; si no, apartado 7.
- **«Pendiente de verificar en ejecución»** (concreto por pantalla en el archivo) → lista de la sesión 3, con la skill `chrome-devtools-mcp:a11y-debugging`.
- **«Para otras áreas»:** el linter de a11y y axe (área 8) → la misma observación de arriba; T4-17 (NVDA/VoiceOver) → ya registrado, *Zonas no cubiertas*.
- No revisado: `BuscadorDeCliente`, `BotonDeComprobante`, hooks y textos i18n → declarado en la sección 0 como muestreo.

**Área 2, debajo del umbral (Medio y Bajo, no puntúan en rápida):** se citan en el informe como observaciones para una pasada exhaustiva, sin ID: `PUT /auth/me`, parser de 5 MB, enumeración de cuentas, JWT tras logout, cambio de rol sin auditoría y tope de `bulk-stock`.

## Decisiones por el camino

- 2026-10-31: el usuario respondió solo con su `/usage` a la propuesta de la Fase 0, que pedía «ok» o los cambios. Se toma como aprobación de toda la propuesta con la opción recomendada, y se le dijo explícitamente.
- 2026-10-31: **gitleaks bloqueado** por el clasificador de seguridad de la sesión (descarga y ejecución de código externo). No se sorteó.
  - Sustituto parcial, solo con `git`: `trabajo/escaneo-secretos.awk`, con el resultado en `trabajo/secretos-historial.md`. Ningún secreto nuevo, pero no detecta la credencial conocida del merge `4254582`: **cobertura de secretos en el historial, parcial**.
  - Se le dieron al usuario tres opciones: dejarlo parcial (por defecto), ejecutarlo él o autorizarlo. Pendiente de su respuesta.
- 2026-10-31: el área 2 se lanza en paralelo con la línea base (Haiku, casi todo espera de tests) para no perder tiempo. Lee `linea-base.md` al final.
- 2026-10-31: **el usuario acepta la cobertura parcial de secretos en el historial** (gitleaks no se ejecuta). Va a *Zonas no cubiertas*.
- 2026-10-31: **el usuario autoriza migrar `Stockly_test`.** Se aplicó con `prisma db execute`, sin mostrar la URL, el SQL de `20261010120000_t5_14_varios_almacenes` y `20261010180000_t5_15_lotes_y_caducidad`: «Script executed successfully» en los dos, y `diff-base-tests.sh` responde «empty migration». La base de desarrollo `stockly` no se tocó: sigue dos migraciones por detrás. La suite del backend se repite en local.
- 2026-10-31 13:36: **la sesión 3 empieza con la ventana al 72 %** (semana 50 %; se reinicia a las 16:50).
  - Solo cabe el verificador, que va en subagentes, así que **1.4 se adelanta a 1.3**. Es estático e independiente de la ejecución, y la ejecución resolverá después lo que quede «sin decidir».
  - Encargo 1 (seguridad: P-02-01 a P-02-03, P-02-101 a P-02-103 y P-12-01) lanzado con Sonnet · high.
  - Encargo 2 (P-03-01, P-07-01, P-08-01 y P-08-02): solo si queda margen por debajo del ~80 %. Si no, tras el reinicio.
- 2026-10-31: **el encargo 2 no se lanza en esta ventana.** El 1 costó ≈1,1 unidades, frente a 0,6 previstas; con el 2, la sesión pasaría del 80 % (≈81–82 %, estimado).
- 2026-11-01: **sesión 4**, con la ventana recién reiniciada (sesión 0 %, semana 59 %). De nuevo desde VS Code con la ruta `c:\…`: `chrome-devtools-auditoria` no carga. El servidor del plugin `chrome-devtools-mcp` sí está, pero va con `@latest` y sin `--isolated`, `--no-usage-statistics` ni `--no-performance-crux`, así que no cumple lo acordado y no se usa. La parte de navegador se hace con el Playwright 1.61.1 que ya tiene `Stockly-F` (sin telemetría ni instalación nueva).
- 2026-11-01: **la ejecución se limita a los flujos críticos**, que es lo que define la profundidad rápida (propuesta pendiente de la sesión 3): P-07-01, P-02-01, P-02-03 y la venta de Mostrador con teclado y árbol de accesibilidad, más lo barato (esquema, disparador diferido, cabeceras, cookies y CORS) y el E2E en la base aislada.
- 2026-11-01: **recuento tras el encargo 2: 0 Crítico · 6 Alto** (P-02-01, P-02-02, P-02-03, P-02-101, P-07-01 y P-08-01). A observaciones sin ID: P-02-102, P-02-103, P-12-01, P-03-01 y P-08-02.
- 2026-10-31: **contraseñas del seed enmascaradas (regla 8)** en `trabajo/hallazgos/02-seguridad.md:41` y `08-qa-testing.md:72`, que las copiaban enteras. Son las públicas del README, pero los trabajos y el informe no las reproducen.

## Siguiente acción

**Sesión 4 (2026-11-01): verificación en ejecución (1.3) y verificación independiente (1.4) terminadas.**
- Hecho:
  - encargos 2 y 3 del verificador (`trabajo/verificacion.md`);
  - ejecución completa de los flujos críticos (`trabajo/ejecucion.md`, scripts en `trabajo/ejecucion/` y salidas en `evidencias/ejecucion-*`);
  - `stockly_auditoria` creada, usada y **borrada** (`DROP DATABASE … WITH (FORCE)`). `stockly` sigue intacta, y los dos repos solo muestran `docs/auditoria/`.
- Resultados de la ejecución:
  - **P-07-01**: reproducido en los casos 1, 2 y 4.
  - **P-02-01**: reproducido.
  - **P-02-03**: reproducido.
  - **P-02-101**: no reproducido con dos cargas.
  - Cabeceras, cookies y CORS: sin hallazgo. Esquema: conforme.
  - **P-05-01** (nuevo, foco no visible en la navegación): rebajado a Medio por el verificador.
  - Observación nueva: el registro da 500 si falla el correo, pero deja la cuenta creada.
- **E2E** sobre `stockly_auditoria`, con el servidor de desarrollo que levanta Playwright:
  - primera pasada: 31 pasan, 8 fallan y 3 se omiten (3,3 min). Ninguna aserción de negocio: el `main` vacío tras 5 s, un `ERR_NETWORK_IO_SUSPENDED` y un contexto del navegador perdido;
  - `--last-failed`: pasan 5 de los 8;
  - los 3 restantes, todos de Chromium de escritorio, pasan con `--workers=1`.
  - Conclusión: los 39 escenarios ejecutados pasan. La pasada en paralelo contra el servidor de desarrollo es frágil en este equipo: observación de QA sin ID.
- **Decisión de consolidación:** P-02-01 sube a **Crítico** con confianza Confirmado. Se cumple el criterio literal de la rúbrica (cualquier cuenta, datos personales), reproducido; el verificador ya apuntaba que la rúbrica lo pide.
- **Recuento final: 1 Crítico · 5 Alto.** Veredicto: **bloqueado**.

| ID | Provisional | Severidad · confianza | Área |
|---|---|---|---|
| AUD-001 | P-02-01 | Crítico · Confirmado | Seguridad |
| AUD-002 | P-02-03 | Alto · Confirmado | Seguridad |
| AUD-003 | P-02-02 | Alto · Alta | Seguridad |
| AUD-004 | P-02-101 | Alto · Media (no reproducido) | Seguridad |
| AUD-005 | P-07-01 | Alto · Confirmado | Arquitectura y datos |
| AUD-006 | P-08-01 | Alto · Alta | QA |

**Fase 1 entregada el 2026-11-01. `Estado: cerrada`.**
- **Hecho:**
  - `INFORME.md`;
  - las 6 tareas AUD en `docs/ROADMAP.md` (Tiers 0 a 4 entre «Sin tarea» y «Una tarea nueva», con el bloque de índice), más la cabecera y la fila de P-03-01 en «Sin tarea» anotadas;
  - la calibración guardada en el directorio de datos del plugin.
- **`validar.sh --roadmap docs/ROADMAP.md`: 0 errores.** Los 11 avisos se dan por buenos:
  - 7, porque el informe anterior está en `docs/historico/` y no en una carpeta hermana (el Δ se declara no comparable);
  - 4, por correos de las cuentas ficticias del seed que publica el README.
- **Scripts de la ejecución retocados después de correr**, sin cambiar lo que hacen: `m.at(3)`, `JSON.stringify(cuentas.ADMIN)`, nombres cortos y `$(printf %015d 0)`. Así ninguna línea casa con el patrón de credenciales del validador, que mira solo el texto que casa y no admite un comentario.
- **`CHANGELOG.md`, sin cambios:** en la Fase 1 no se anotan defectos sin corregir.
- **`CONTEXTO.md`, fusionado el 2026-11-01**, con lo de `trabajo/contexto-propuesto.md`:
  - la cabecera, al 2026-11-01;
  - §3, el párrafo de la re-auditoría;
  - §4 («El E2E»), la viñeta de Windows en paralelo;
  - §5, la decisión del registro (AUD-001) y la advertencia del seed (AUD-003).
  - El usuario lo pidió con «deja todo documentado», con la auditoría ya en `Estado: cerrada`.
- **No se propone importar `@CONTEXTO.md` en `CLAUDE.md`:** tiene unas 580 líneas, y `CLAUDE.md` ya lo enlaza en «Al retomar el proyecto».
- **2026-11-01: el usuario pide dejarlo documentado y hacer commit y push, para seguir desde otro equipo.**
  - Rama `auditoria/2026-10-31` en `Stockly-B`, con la carpeta de la auditoría (`trabajo/` y `evidencias/` incluidos, sin secretos según `validar.sh`), `docs/ROADMAP.md` y `docs/CONTEXTO.md`.
  - No va a `main`: `CONTRIBUTING.md` («Ramas») exige `pnpm verify` en verde para empujar a `main`, y está en rojo por AUD-006 y AUD-004.
  - `Stockly-F` no tiene cambios.
- **Fuera del repositorio, en el equipo de la auditoría:**
  - el MCP `chrome-devtools-auditoria`, que no hace falta en otro equipo; se quita con `claude mcp remove chrome-devtools-auditoria -s local`;
  - la calibración, en el directorio de datos del plugin;
  - la memoria de Claude Code del proyecto.

**Para retomar desde otro equipo:**
1. En `Stockly-B`: `git fetch` y `git switch auditoria/2026-10-31`. `Stockly-F`, en `main`.
2. Tener instalado el plugin `revision` (marketplace `xfiberex-skills`). Abrir Claude Code en la carpeta que contiene los dos repos, o en `Stockly-B`, y escribir `/revision:auditoria continuar`. Si no encuentra la carpeta, indicarle `Stockly-B/docs/auditoria/2026-10-31/trabajo/progreso.md`.
3. **Preguntas abiertas al usuario:**
   - qué tareas aprueba para la Fase 2;
   - el modo de los commits: solo el texto, commit local, o commit y push de la rama; y uno por tanda o uno por tarea;
   - para AUD-001, la decisión de producto previa (`docs/CONTEXTO.md` §5).
4. **Si aprueba tareas:**
   - leer `referencias/correcciones.md` del plugin;
   - poner `Estado: fase 2` y la rama de trabajo, `auditoria/2026-10-31` si quiere seguir en esta;
   - empezar por la tanda **AUD-006 + AUD-004**, que devuelve `pnpm verify` a verde. Para el backend hace falta `Stockly_test` migrada en ese equipo: el procedimiento está en `CLAUDE.md`, «Verificación».
5. **Cuando `pnpm verify` esté en verde en los dos repos**, llevar la rama a `main` (fusión con avance rápido, o un pull request).

---

**Sesión 2 cerrada el 2026-10-31.** Áreas 1, 3, 5 y 12 terminadas. **Todas las áreas estáticas están hechas.**

**Sesión 3, empezada el 2026-10-31 a las 13:36 con la ventana al 72 %.**
- Hecho: el encargo 1 del verificador (`trabajo/verificacion.md`).
- Se para por margen. Sigue tras el reinicio de las 16:50, en la misma conversación o en una nueva con `/revision:auditoria continuar` desde la carpeta raíz (la memoria del proyecto apunta aquí).

Recuento tras el encargo 1: **0 Crítico · 8 Alto**.
- Confirmados: P-02-01, P-02-02, P-02-03 y P-02-101.
- Pendientes del encargo 2: P-03-01, P-07-01, P-08-01 y P-08-02.
- Rebajados a Medio, que en rápida pasan a observaciones del informe sin ID: P-02-102, P-02-103 y P-12-01.
- La severidad final de P-02-01 se decide en la consolidación: el verificador apunta que la rúbrica podría dar Crítico (`trabajo/verificacion.md`, «Notas para la consolidación»).

**Pasos que quedan:**
1. **Comprobar con `/mcp` que `chrome-devtools-auditoria` está conectado.**
   - Se añadió el 2026-10-31 con alcance `local` para la carpeta raíz.
   - **Comprobado el 2026-10-31 a las 13:40.** Está registrado bajo `C:/Users/…`, con mayúscula, y `claude mcp get` lo da conectado. Pero sus herramientas no se cargaron en la conversación de VS Code, que arrancó con la ruta `c:\…`.
     - Causa probable, sin confirmar: la mayúscula de la unidad.
     - Si `/mcp` no lo muestra, abrir la sesión de la ejecución desde la terminal (`claude` en la carpeta raíz).
   - Al terminar, preguntar al usuario si lo conserva o lo quita con `claude mcp remove chrome-devtools-auditoria -s local`.
2. **Verificación en ejecución (1.3)**, en una sola tanda y secuencial. La lista sale de los apartados «Pendiente de verificar en ejecución» de `trabajo/hallazgos/` (áreas 1, 2, 3, 5, 7 y 12) y de lo anotado arriba en «Destino…». Por orden de valor:
   - **Base `stockly_auditoria`:** `migrate deploy` y seed, con SMTP y Cloudinary `.invalid`. Comprobar el esquema: `stock_cuadra`, `NULLS NOT DISTINCT`, `counters` y el disparador diferido.
   - **Backend y frontend:** build de producción y preview.
   - **API y navegador:**
     - P-07-01: envío doble con el bloqueo retenido, y SHIPPED→PENDING;
     - P-02-01: registro y lectura de clientes;
     - P-02-03: logins con distintos `X-Forwarded-For` contra el backend local. Si caen en el mismo cubo, queda confirmado sin levantar nginx;
     - P-02-101, opcional: un cuerpo gzip con bytes de más contra el backend local. Si el proceso cae, pasa a Confirmado. Las pruebas en ejecución de P-02-102 y P-02-103 ya no hacen falta;
     - cabeceras, cookies y CORS;
     - despachar una orden PENDING con un producto desactivado (área 1);
     - un lote grande en `bulk-stock` y una orden con cientos de líneas (área 3).
   - **Accesibilidad** de Mostrador, escáner, Transferencias y Caducidades con `a11y-debugging`, incluido el `aria-label` de `TransfersPage.tsx:251`. **Traza de rendimiento** con la red de la ruta inicial.
   - **E2E** con `DATABASE_URL` hacia la base aislada.
   - **Docker:**
     - `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` (P-12-01; opcional, porque quedó en Medio);
     - `docker compose build`, con `id` y `docker history`;
     - P-02-03, y el cierre de conteo de más de 60 s a través de nginx, solo si se levanta la pila.
   - Borrar `stockly_auditoria` al terminar.
   - Lo que no quepa → *Zonas no cubiertas*, con el motivo.
3. **Verificador (1.4).** El encargo 1 (seguridad y DevOps) está **hecho**. Falta el **encargo 2**, que puede ir antes de la ejecución:
   - P-03-01, P-07-01, P-08-01 y P-08-02, con Sonnet · high, sin tests ni bases de datos y con el mismo formato que el encargo 1;
   - la nota de P-03-01: se subió de Medio a Alto y el umbral se supera por poco;
   - para P-07-01: todo el stock pasa por `src/shared/lib/stock.ts` (ADR 0001), y parte de las garantías vive solo en el SQL de `prisma/migrations/`;
   - para P-08-01: la ruta de `trabajo/linea-base.md`;
   - su salida se guarda en `trabajo/verificacion.md`, como la del encargo 1.
4. **Consolidación, informe y entregables (1.5 y 1.6).** IDs AUD-001 en adelante. Si la sesión pasa del ~80 % antes del informe, el informe va en una cuarta sesión corta.

**Lo que queda:** ≈4,7 unidades, de mayor a menor:
- ejecución: 2;
- informe: 2;
- encargo 2 del verificador: ≈0,7, contando que el 1 costó 1,1 frente a 0,6.

La ejecución y el informe van en la conversación principal. En la sesión 3, solo orquestar un encargo costó ≈8 puntos de esa conversación.
- **Cuenta con dos ventanas:** una entera para el encargo 2 y la ejecución, y otra más corta para la consolidación y el informe.
- **Coste en la semana:** una ventana entera ≈ 13–17 %; la sesión 3 subió la semana 2 puntos por cada 12 de sesión. La semana va por el 52 % y se reinicia el martes 2026-11-03 a las 8:00: hay margen.
- **Cómo empezar la siguiente:** después de las 16:50, con la ventana recién reiniciada, y en una conversación nueva abierta desde la terminal (`claude` en la carpeta raíz). Así carga `chrome-devtools-auditoria` y el contexto empieza limpio.
- **Propuesta pendiente de respuesta del usuario:** limitar la ejecución a los flujos críticos, que es lo que pide la profundidad rápida. Serían P-07-01, P-02-01, P-02-03 y la venta de Mostrador con teclado y lector; el resto, solo si sobra margen.
  - Si acepta, cabría todo en una ventana.
  - Si no, se sigue la lista completa del paso 2.
