# Área 12 · DevOps y configuración · hallazgos provisionales
Revisado: leídos enteros `Stockly-B/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `.dockerignore`, `.github/workflows/verify.yml` (los dos repos), `Stockly-F/Dockerfile`, `nginx.conf`, `.dockerignore`, `.mcp.json`, `.claude/settings.json`; `docs/operaciones.md` y `docs/dependencias.md` por búsqueda dirigida (copias, reversión, monitorización, auditoría); `scripts/backup.js` solo la cabecera; `.env` no abierto. Del tooling de agentes: solo configuración ejecutable (hooks, permisos, MCP); las ~700 skills versionadas son texto/CSV y no se revisaron una a una. CI consultada con `gh` en solo lectura. Los hallazgos de otras áreas (P-02-03, P-02-101..103, P-08-01) se citan, no se duplican.
Herramientas ejecutadas: `gh run list`, `gh workflow list`, `gh api repos/xfiberex/Stockly-B` (GET). No se usó trivy, checkov ni docker (revisión estática).
Modelo: Sonnet 5.5 · medium (profundidad rápida: solo Crítico y Alto).

## Estado de la CI (gh, solo lectura)
- Un único workflow `verify` en cada repo, activo. Últimas 10 ejecuciones de ambos repos en `success`; la última es del 2026-10-11 (B 02:13Z, F 02:16Z). **No hay ninguna ejecución posterior en 20 días.**
- Disparadores: `push` a main, `pull_request`, `workflow_dispatch`. **Ningún `schedule`**, ni Dependabot/Renovate (`.github/` solo contiene `workflows/`).
- Seguridad del pipeline correcta: `permissions: contents: read`, acciones fijadas por SHA, `persist-credentials: false`, sin `pull_request_target`, sin secretos.
- Dependabot alerts, Dependabot security updates y secret scanning están **desactivados** en `Stockly-B` (público). La protección de la rama `main` no existe (404).
- Consecuencia: el próximo push dará rojo en `pnpm auditoria` (último paso de `verify`) en ambos repos; hoy nadie se entera porque no hay ejecución periódica.

## Hallazgos

### P-12-01 · La superposición de producción hereda la configuración «local sin TLS» del compose base: cookies sin `Secure`, `FRONTEND_URL=http://localhost` y ningún TLS en la pila ni documentado
**Área:** DevOps · **Severidad:** Alto · **Confianza:** Alta · **Verificación:** estática (pendiente `docker compose config`) · **Esfuerzo:** Medio
**Ubicación:** `Stockly-B/docker-compose.yml:93-95`, `Stockly-B/docker-compose.prod.yml:26-34`, `Stockly-F/nginx.conf:10`, `Stockly-B/docker-compose.yml:80-81`
**Estado:** nuevo (relacionado con P-02-03)
**Problema:** el compose base, pensado como «pila local», fija en el backend:
```yaml
COOKIE_SAMESITE: lax
COOKIE_SECURE: "false"
FRONTEND_URL: http://localhost:${FRONTEND_HOST_PORT:-8080}
```
El comentario (l. 89-92) dice que «en un despliegue real detrás de HTTPS se quitan las dos líneas». Pero el despliegue documentado es `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` (`prod.yml:3`), y la superposición **solo** cierra el puerto de la base, exige credenciales y fija `NODE_ENV`; no toca ninguna de esas tres variables, de modo que los valores de desarrollo llegan intactos a producción (en `auth.controller.ts:27` el valor por defecto sería `Secure=true`, pero `COOKIE_SECURE: "false"` lo anula). Además, la pila no termina TLS: `nginx.conf` solo hace `listen 80;`, el frontend publica `80` y no hay ninguna mención de TLS, certificados ni proxy inverso en `operaciones.md`, `README-proyecto.md` ni `CONTEXTO.md` (búsqueda `TLS|https|certbot|proxy` sin resultados relevantes). El backend, además, publica `3000` al host también en producción (`ports` del backend no se resetea en la superposición), con lo que se puede saltar nginx.
**Impacto:** quien siga la ruta documentada despliega una aplicación de inventario con login, cookie de refresh y token CSRF viajando en claro por HTTP, la cookie de refresh sin atributo `Secure` y `FRONTEND_URL` apuntando a `localhost` (CORS y enlaces de invitación/recuperación de contraseña por correo rotos o erróneos). Si el operador añade un TLS externo, las cookies seguirán sin `Secure` hasta que alguien descubra que debe quitar variables del compose base. Probabilidad moderada porque aún no hay despliegue; el impacto (robo de sesión de administradores con acceso a datos de clientes y costes) es alto.
**Evidencia:** lectura de ambos compose; `grep -rniE "TLS|https|proxy" docs/operaciones.md docs/README-proyecto.md docs/CONTEXTO.md` sin ninguna sección de TLS; README del backend (l. 95): por defecto `COOKIE_SECURE=true` en producción, es decir, el defecto seguro se anula solo en el compose.
**Solución propuesta:** (1) en `docker-compose.prod.yml` sobrescribir con obligatoriedad: `COOKIE_SECURE: "true"`, `FRONTEND_URL: ${FRONTEND_URL:?define la URL pública https}` y quitar `COOKIE_SAMESITE`; (2) `backend.ports: !reset []` (el frontend/nginx sigue siendo el único punto de entrada; el healthcheck interno no necesita puerto publicado); (3) documentar en `operaciones.md` dónde termina TLS (proxy inverso delante de nginx o `listen 443 ssl` en nginx con certificados montados) y añadir al `server` de nginx `real_ip`/`X-Forwarded-Proto` coherentes con eso.
**Criterio de aceptación:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` muestra `COOKIE_SECURE: "true"`, `FRONTEND_URL` https obligatoria y ningún puerto publicado salvo el del frontend; `operaciones.md` describe la terminación TLS; una respuesta de login real incluye `Set-Cookie ... Secure`.

## Debajo del umbral (Medio/Bajo, una línea cada uno; no puntúan en profundidad rápida)
- Medio · Puerta `auditoria` roja y CI sin ejecución desde el 2026-10-11: sin `schedule`, sin Dependabot/Renovate, alertas de GitHub y secret scanning desactivados, rama `main` sin protección (`.github/workflows/verify.yml:9-13`). Las vulnerabilidades concretas están en P-02-101..103; falta solo el mecanismo de revisión periódica (p. ej. `schedule: cron` semanal en `verify.yml` + `dependabot.yml`).
- Medio · nginx sin cabeceras de seguridad (CSP, X-Content-Type-Options, `frame-ancestors`/X-Frame-Options, HSTS, Referrer-Policy) para la SPA (`Stockly-F/nginx.conf:9-47`); `helmet()` en el backend (`src/app.ts:21`) solo cubre las respuestas de `/api`. HSTS depende de resolver P-12-01.
- Medio · `proxy_read_timeout` no definido (60 s por defecto) frente a `PLAZO_DE_CIERRE.timeout = 120_000` del cierre de conteo (`inventory-counts.service.ts:29`), y el cliente axios no tiene `timeout` (`Stockly-F/src/shared/api/axios.ts:16-20`): un cierre largo devuelve 504 aunque la transacción termine y se confirme. Añadir `proxy_read_timeout 130s` en `location /api/`.
- Medio · `nginx:alpine` y `node:22-alpine` sin versión ni digest (`Stockly-F/Dockerfile:25`, `Stockly-B/Dockerfile:2,45,67`); `postgres:17-alpine` fijada solo a la mayor. Build no reproducible.
- Medio · `X-Forwarded-For` se pasa con `$proxy_add_x_forwarded_for` y el puerto 3000 está publicado: un cliente puede inyectar la cabecera saltándose nginx; también afecta a P-02-03.
- Bajo · La etapa `migrator` es el `builder` completo, corre como root con devDependencies (`Dockerfile:36`); `nginx` corre como root; sin `.dockerignore` que excluya `.git`/`docs` en el backend; el compose base define `postgres`/`postgres` por defecto (cubierto en producción por `${VAR:?}`), y `load/`, `observabilidad/` no se revisaron.
- Bajo · Imagen `runner` del backend sin `HEALTHCHECK` en el Dockerfile (sí lo hay en el compose).

## Matriz de autorización
No aplica (área 12).

## Hipótesis por verificar
- El `.env` real se inyecta con `env_file` y `environment` lo pisa para `DATABASE_URL`, `COOKIE_*` y `FRONTEND_URL`; confirmar con `docker compose ... config` que el orden de precedencia es el esperado (si `.env` define `COOKIE_SECURE=true`, el compose igualmente lo sobrescribe a `false`).
- `scripts/backup.js` y `restaurar.js` están documentados con ensayo registrado (§5); no se verificó que el registro del ensayo sea reciente ni que exista copia programada: en el compose no hay servicio ni cron de backup (`pnpm db:backup` es manual). Aceptable sin usuarios; revisar antes de producción (RPO declarado 24 h en §2 exige automatización).

## Pendiente de verificar en ejecución
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` (valores efectivos, puertos publicados, `!reset` aplicado).
- `docker compose build` de `migrator`, `runner` (usuario `node`, tamaño, que `src/generated` y `node_modules` podados bastan) y del frontend; `docker run --rm <runner> id` y `docker history` para descartar secretos en capas (`ARG DATABASE_URL` es un valor ficticio de build, pero queda en la capa del `builder`, que no se publica).
- Comprobar en un 504 real si el cierre de conteo de más de 60 s llega a cortarse por nginx.

## Para escalar
- Ninguno.

## Puntos fuertes
- CI de manual: acciones por SHA completo, `permissions: contents: read`, `pull_request` (no `_target`), `persist-credentials: false`, concurrencia, timeouts, y la misma puerta `pnpm verify` que en local (ADR 0008).
- Dockerfile del backend en multi-stage con etapa `migrator` separada, dependencias de producción podadas, usuario `node`, `--frozen-lockfile`, versión exacta de pnpm; `.dockerignore` excluye `.env` en los dos repos.
- Compose de producción con `${VAR:?}` y `!reset` del puerto de la base; migraciones como servicio previo (`service_completed_successfully`) y healthchecks reales (`/ready` que sondea la base).
- Operaciones documentadas: backups con retención, ensayo de restauración, reversión, alertas 5xx y Prometheus con reglas probadas.
- Tooling de agentes sin ejecución automática: ningún `hooks` en `.claude/settings.json` (solo existe en Stockly-F; Stockly-B no tiene), permisos limitados a siete herramientas de lectura de codegraph, `.mcp.json` lanza el binario local `codegraph serve --mcp` (no `npx` sin fijar). Riesgo para quien clone el repo: bajo; queda el supuesto de que `codegraph` en el PATH sea el legítimo, y las ~700 skills versionadas son contenido de terceros que un agente leerá como instrucciones (superficie de inyección de prompt, no de ejecución).

## Para otras áreas
- Área 2: la ausencia de TLS y de `Secure` en producción (P-12-01) y el puerto 3000 publicado agravan P-02-03 (cabecera `X-Forwarded-For` inyectable saltando nginx); secret scanning y push protection de GitHub desactivados.
- Área 8: CI sin ejecución desde el 2026-10-11; P-08-01 (reloj real en `moneda.test.ts`) dejará `verify` en rojo en el próximo push.
- Área 7/rendimiento: desajuste de timeouts nginx 60 s / transacción 120 s / axios sin timeout.
