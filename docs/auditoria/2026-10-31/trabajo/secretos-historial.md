# Secretos en el historial · escaneo parcial (sustituto de gitleaks)

- **Fecha:** 2026-10-31.
- **gitleaks 8.30.1: no se ejecutó.** El clasificador de seguridad de la sesión bloqueó descargar y ejecutar el binario (código externo). Queda pendiente de la decisión del usuario.
- **Método:** `git log --all -p -U0` de los dos repos, sin `pnpm-lock.yaml`, más los merges con `--diff-merges=first-parent`. La salida pasa por `escaneo-secretos.awk`. Reglas: clave privada, AWS, Stripe, GitHub, Google, Slack, JWT, URL con credenciales, Cloudinary, asignación de variables de secreto y contraseña literal. Valores enmascarados: 4 caracteres y la longitud.
- **Límite comprobado:** no detecta la credencial ya conocida de `Stockly-F` (merge `4254582`, `e2e/smoke.spec.ts`; rotada el 2026-08-10 según `docs/CONTEXTO.md` §5), porque no está escrita como asignación. **La cobertura de secretos en el historial es parcial.**
- **Resultado** (candidatos revisados en la conversación principal):
  - Las reglas de alta señal (AWS, JWT, claves de API) solo saltan en documentación de skills de terceros versionadas (`.claude/skills/…`, `.agents/skills/…`). Son ejemplos públicos: la clave `AKIA…` de 20 caracteres de la documentación de gitleaks, un JWT de ejemplo y textos «your…».
  - Fuera de tests, seed y tooling solo hay:
    - valores de relleno documentados: `jest.setup.js` con `.invalid`, la base desechable de la CI y la URL de build del `Dockerfile`;
    - el valor por defecto de la contraseña de PostgreSQL en `docker-compose.yml` (para el área 12);
    - textos de interfaz;
    - `ProgresoContextoHoy.md` (`bf93b38`, 2026-05-26; ya no está en HEAD), cuyos `JWT_SECRET` y `SMTP_PASS` son texto de ejemplo en minúsculas y guiones bajos.
  - No hay ningún candidato nuevo con aspecto de secreto real.
- Debajo, las tablas completas por repo, con tests, e2e, seed y tooling incluidos.

## Stockly-B
Commits en todas las ramas: 110
| Regla | Archivo | Valor (enmascarado) | Primera aparición | Commits |
|---|---|---|---|---|
| contrasena-literal | `src/tests/invitacion.test.ts` | `Otra…(13)` | bf223e9 2026-10-10 | 1 |
| asignacion:POSTGRES_PASSWORD | `docs/historico/ROADMAP-2026-10-05.md` | `?req…(12)` | 5da9c54 2026-10-05 | 1 |
| asignacion:SMTP_PASS | `jest.setup.js` | `no-e…(20)` | 0ef52a9 2026-09-28 | 1 |
| contrasena-literal | `jest.setup.js` | `no-e…(20)` | 0ef52a9 2026-09-28 | 1 |
| asignacion:CLOUDINARY_API_KEY | `jest.setup.js` | `0000…(15)` | 0ef52a9 2026-09-28 | 1 |
| asignacion:CLOUDINARY_API_SECRET | `jest.setup.js` | `no-e…(16)` | 0ef52a9 2026-09-28 | 1 |
| asignacion:POSTGRES_PASSWORD | `.github/workflows/verify.yml` | `post…(8)` | f9e2b5e 2026-09-28 | 1 |
| url-con-credenciales | `.github/workflows/verify.yml` | `post…(8)` | f9e2b5e 2026-09-28 | 1 |
| asignacion:JWT_SECRET | `.github/workflows/verify.yml` | `ci-s…(47)` | f9e2b5e 2026-09-28 | 1 |
| contrasena-literal | `.claude/skills/exploiting-jwt-algorithm-confusion-attack/SKILL.md` | `Test…(12)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/implementing-aes-encryption-for-data-at-rest/scripts/process.py` | `test…(18)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/implementing-secret-scanning-with-gitleaks/SKILL.md` | `REDA…(8)` | 9e0942f 2026-08-23 | 1 |
| aws | `.claude/skills/implementing-secret-scanning-with-gitleaks/assets/template.md` | `AKIA…(20)` | 9e0942f 2026-08-23 | 1 |
| aws | `.claude/skills/implementing-secret-scanning-with-gitleaks/references/api-reference.md` | `AKIA…(20)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/performing-api-rate-limiting-bypass/SKILL.md` | `wron…(13)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/performing-cryptographic-audit-of-application/scripts/process.py` | `Supe…(15)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-api-authentication-weaknesses/SKILL.md` | `Test…(12)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-api-authentication-weaknesses/SKILL.md` | `wron…(13)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-api-for-mass-assignment-vulnerability/SKILL.md` | `Pass…(8)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-api-for-mass-assignment-vulnerability/SKILL.md` | `P@ss…(8)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-api-for-mass-assignment-vulnerability/scripts/agent.py` | `Secu…(14)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-for-broken-access-control/SKILL.md` | `Test…(8)` | 9e0942f 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-for-business-logic-vulnerabilities/SKILL.md` | `Test…(9)` | 9e0942f 2026-08-23 | 1 |
| jwt | `.claude/skills/testing-jwt-token-security/SKILL.md` | `eyJh…(155)` | 9e0942f 2026-08-23 | 1 |
| url-con-credenciales | `docker-compose.yml` | `-pos…(41)` | 6ab5f70 2026-08-12 | 2 |
| asignacion:POSTGRES_PASSWORD | `docker-compose.yml` | `-pos…(42)` | 6ab5f70 2026-08-12 | 2 |
| contrasena-literal | `src/tests/correos-idioma.test.ts` | `Admi…(10)` | dcb013b 2026-08-12 | 1 |
| url-con-credenciales | `docs/accesibilidad.md` | `post…(8)` | 79362ca 2026-08-12 | 1 |
| url-con-credenciales | `load/ejecutar.js` | `${en…(41)` | 4f50341 2026-08-11 | 1 |
| url-con-credenciales | `load/sembrar.js` | `${en…(41)` | 4f50341 2026-08-11 | 1 |
| asignacion:METRICS_TOKEN | `src/tests/metricas.test.ts` | `toke…(21)` | 3524a92 2026-08-11 | 1 |
| url-con-credenciales | `docs/operaciones.md` | `cont…(11)` | 5199053 2026-08-11 | 1 |
| asignacion:POSTGRES_PASSWORD | `docker-compose.prod.yml` | `${PO…(27)` | 830c2a7 2026-08-09 | 1 |
| url-con-credenciales | `docker-compose.prod.yml` | `${PO…(20)` | 830c2a7 2026-08-09 | 1 |
| asignacion:POSTGRES_PASSWORD | `docker-compose.yml` | `${PO…(30)` | 830c2a7 2026-08-09 | 1 |
| url-con-credenciales | `docs/CONTEXTO.md` | `post…(8)` | 830c2a7 2026-08-09 | 1 |
| contrasena-literal | `src/tests/refresh-reuse.test.ts` | `Test…(9)` | 830c2a7 2026-08-09 | 1 |
| contrasena-literal | `src/tests/body-limit.test.ts` | `loQu…(10)` | 12235a9 2026-08-09 | 1 |
| contrasena-literal | `src/tests/auth.test.ts` | `Test…(9)` | e57a9b9 2026-08-07 | 4 |
| asignacion:POSTGRES_PASSWORD | `docker-compose.yml` | `post…(8)` | adacd06 2026-08-07 | 1 |
| url-con-credenciales | `docker-compose.yml` | `post…(8)` | adacd06 2026-08-07 | 1 |
| url-con-credenciales | `docs/INFORME-AUDITORIA.md` | `buil…(5)` | adacd06 2026-08-07 | 1 |
| asignacion:POSTGRES_PASSWORD | `docs/INFORME-AUDITORIA.md` | `post…(9)` | adacd06 2026-08-07 | 1 |
| asignacion:POSTGRES_PASSWORD | `docs/INFORME-AUDITORIA.md` | `?req…(12)` | adacd06 2026-08-07 | 1 |
| asignacion:POSTGRES_PASSWORD | `docs/ROADMAP.md` | `?req…(12)` | adacd06 2026-08-07 | 1 |
| url-con-credenciales | `Dockerfile` | `buil…(5)` | d1ebceb 2026-08-04 | 1 |
| contrasena-literal | `src/tests/auth.test.ts` | `Otra…(13)` | d1ebceb 2026-08-04 | 1 |
| contrasena-literal | `src/tests/csrf.test.ts` | `Test…(9)` | 35538d8 2026-07-15 | 1 |
| url-con-credenciales | `src/tests/env.test.ts` | `****` | 35538d8 2026-07-15 | 1 |
| contrasena-literal | `.agents/skills/zod/references/error-avoid-throwing-in-refine.md` | `1234…(8)` | 299aa29 2026-05-31 | 1 |
| contrasena-literal | `.agents/skills/zod/references/refine-add-path.md` | `secr…(9)` | 299aa29 2026-05-31 | 1 |
| contrasena-literal | `.agents/skills/zod/references/refine-add-path.md` | `diff…(9)` | 299aa29 2026-05-31 | 1 |
| contrasena-literal | `src/tests/auth.test.ts` | `test…(8)` | 57026c1 2026-05-28 | 1 |
| contrasena-literal | `src/tests/auth.test.ts` | `Wron…(11)` | 57026c1 2026-05-28 | 1 |
| contrasena-literal | `src/tests/auth.test.ts` | `Nuev…(14)` | 57026c1 2026-05-28 | 1 |
| contrasena-literal | `src/tests/auth.test.ts` | `OldP…(12)` | 57026c1 2026-05-28 | 1 |
| contrasena-literal | `src/tests/helpers.ts` | `Test…(9)` | 57026c1 2026-05-28 | 1 |
| url-con-credenciales | `src/config/env.ts` | `****` | 14fef6f 2026-05-28 | 2 |
| asignacion:JWT_SECRET | `ProgresoContextoHoy.md` | `una_…(32)` | bf93b38 2026-05-26 | 1 |
| asignacion:SMTP_PASS | `ProgresoContextoHoy.md` | `cont…(27)` | bf93b38 2026-05-26 | 1 |
| url-con-credenciales | `README.md` | `****` | d435109 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-cli/references/init.md` | `pass…(8)` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-database-setup/references/cockroachdb.md` | `pass…(8)` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-database-setup/references/mongodb.md` | `pass…(8)` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-database-setup/references/mysql.md` | `pass…(8)` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-database-setup/references/mysql.md` | `PASS…(8)` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-database-setup/references/postgresql.md` | `pass…(8)` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-database-setup/references/postgresql.md` | `PASS…(8)` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-database-setup/references/prisma-postgres.md` | `****` | 2a8c739 2026-05-24 | 1 |
| url-con-credenciales | `.agents/skills/prisma-postgres/references/console-and-connections.md` | `****` | 2a8c739 2026-05-24 | 1 |

Total: 70 combinaciones distintas de regla, archivo y valor.

### Stockly-B · merges
| Regla | Archivo | Valor (enmascarado) | Primera aparición | Commits |
|---|---|---|---|---|

Total: 0 combinaciones distintas de regla, archivo y valor.

## Stockly-F
Commits en todas las ramas: 129
| Regla | Archivo | Valor (enmascarado) | Primera aparición | Commits |
|---|---|---|---|---|
| contrasena-literal | `src/tests/auth/ResetPasswordPage.test.tsx` | `Alma…(11)` | f1e4d84 2026-10-10 | 1 |
| asignacion:POSTGRES_PASSWORD | `.github/workflows/verify.yml` | `post…(8)` | aac3911 2026-09-28 | 1 |
| url-con-credenciales | `.github/workflows/verify.yml` | `post…(8)` | aac3911 2026-09-28 | 1 |
| asignacion:JWT_SECRET | `.github/workflows/verify.yml` | `ci-s…(47)` | aac3911 2026-09-28 | 1 |
| contrasena-literal | `.claude/skills/implementing-secret-scanning-with-gitleaks/SKILL.md` | `REDA…(8)` | 44a5104 2026-08-23 | 1 |
| aws | `.claude/skills/implementing-secret-scanning-with-gitleaks/assets/template.md` | `AKIA…(20)` | 44a5104 2026-08-23 | 1 |
| aws | `.claude/skills/implementing-secret-scanning-with-gitleaks/references/api-reference.md` | `AKIA…(20)` | 44a5104 2026-08-23 | 1 |
| contrasena-literal | `.claude/skills/testing-for-broken-access-control/SKILL.md` | `Test…(8)` | 44a5104 2026-08-23 | 1 |
| jwt | `.claude/skills/testing-jwt-token-security/SKILL.md` | `eyJh…(155)` | 44a5104 2026-08-23 | 1 |
| contrasena-literal | `src/shared/i18n/en.ts` | `The …(33)` | dcd05e0 2026-08-10 | 1 |
| contrasena-literal | `src/shared/i18n/es.ts` | `La c…(35)` | dcd05e0 2026-08-10 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/advanced/authentication.md` | `secr…(13)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/architecture/pom-vs-fixtures.md` | `Secu…(14)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/architecture/test-architecture.md` | `mgr-…(10)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/architecture/test-architecture.md` | `staf…(10)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.agents/skills/playwright-best-practices/core/configuration.md` | `dev-…(11)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.agents/skills/playwright-best-practices/core/configuration.md` | `stag…(15)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/core/fixtures-hooks.md` | `admi…(8)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/core/test-data.md` | `admi…(8)` | c170564 2026-08-05 | 1 |
| url-con-credenciales | `.agents/skills/playwright-best-practices/infrastructure-ci-cd/docker.md` | `post…(8)` | c170564 2026-08-05 | 1 |
| asignacion:POSTGRES_PASSWORD | `.agents/skills/playwright-best-practices/infrastructure-ci-cd/docker.md` | `post…(8)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.agents/skills/playwright-best-practices/infrastructure-ci-cd/gitlab.md` | `$API…(8)` | c170564 2026-08-05 | 1 |
| url-con-credenciales | `.agents/skills/playwright-best-practices/infrastructure-ci-cd/gitlab.md` | `post…(8)` | c170564 2026-08-05 | 1 |
| asignacion:POSTGRES_PASSWORD | `.agents/skills/playwright-best-practices/infrastructure-ci-cd/gitlab.md` | `post…(8)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/infrastructure-ci-cd/gitlab.md` | `post…(8)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/testing-patterns/api-testing.md` | `Secu…(14)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `.agents/skills/playwright-best-practices/testing-patterns/component-testing.md` | `secr…(9)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/SKILL.md` | `your…(8)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/references/cip-design.md` | `your…(8)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/references/icon-design.md` | `your…(8)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/references/logo-design.md` | `your…(8)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/scripts/icon/generate.py` | `os.e…(15)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/scripts/icon/generate.py` | `your…(8)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/scripts/logo/generate.py` | `os.e…(15)` | c170564 2026-08-05 | 1 |
| asignacion:API_KEY | `.claude/skills/design/scripts/logo/generate.py` | `your…(8)` | c170564 2026-08-05 | 1 |
| contrasena-literal | `src/tests/auth/ProfilePage.test.tsx` | `actu…(10)` | c0e398b 2026-05-28 | 2 |
| contrasena-literal | `src/tests/auth/ProfilePage.test.tsx` | `nuev…(10)` | c0e398b 2026-05-28 | 2 |
| contrasena-literal | `src/tests/auth/LoginPage.test.tsx` | `miCo…(13)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `src/tests/auth/RegisterPage.test.tsx` | `1234…(8)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `src/tests/schemas/auth.schema.test.ts` | `1234…(8)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `src/tests/schemas/auth.schema.test.ts` | `dife…(9)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `src/tests/schemas/auth.schema.test.ts` | `abcd…(8)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `src/tests/schemas/auth.schema.test.ts` | `actu…(10)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `src/tests/schemas/auth.schema.test.ts` | `nuev…(9)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `src/tests/schemas/auth.schema.test.ts` | `dist…(8)` | 281ab7a 2026-05-28 | 2 |
| contrasena-literal | `.agents/skills/zod/references/error-avoid-throwing-in-refine.md` | `1234…(8)` | 4491871 2026-05-25 | 1 |
| contrasena-literal | `.agents/skills/zod/references/refine-add-path.md` | `secr…(9)` | 4491871 2026-05-25 | 1 |
| contrasena-literal | `.agents/skills/zod/references/refine-add-path.md` | `diff…(9)` | 4491871 2026-05-25 | 1 |

Total: 48 combinaciones distintas de regla, archivo y valor.

### Stockly-F · merges
| Regla | Archivo | Valor (enmascarado) | Primera aparición | Commits |
|---|---|---|---|---|

Total: 0 combinaciones distintas de regla, archivo y valor.

