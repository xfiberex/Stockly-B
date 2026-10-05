# Stockly — Backend

API REST del sistema de inventario. El frontend vive en un repositorio hermano, `Stockly-F`, que
se clona al lado (`01-Stockly/Stockly-B` y `01-Stockly/Stockly-F`). La carpeta que los contiene no
está bajo control de versiones, y por eso **la documentación de los dos repositorios vive aquí, en
[`docs/`](docs/)**. Las rutas `Stockly-F/src/...` de esos documentos se refieren al hermano.

## Qué leer, y cuándo

| Cuándo | Documento |
|---|---|
| **Al retomar el proyecto** | [docs/CONTEXTO.md](docs/CONTEXTO.md): estado, trampas del entorno ya pagadas (§4) y decisiones que no conviene deshacer (§6) |
| Antes de planificar trabajo | [docs/ROADMAP.md](docs/ROADMAP.md): tareas abiertas e índice de las cerradas |
| Antes de simplificar algo que parezca complicado de más | [docs/adr/](docs/adr/) |
| Antes de tocar una migración desplegada o la imagen de PostgreSQL | [docs/operaciones.md](docs/operaciones.md) (§6 y §9) |
| Antes de añadir una dependencia | [docs/dependencias.md](docs/dependencias.md) |
| Antes de tocar una consulta de listado | [docs/rendimiento.md](docs/rendimiento.md) |
| Antes de añadir un dato personal, un proveedor externo o una cookie | [docs/legal.md](docs/legal.md) |
| Antes de tocar una pantalla | [Stockly-F/docs/design-system.md](../Stockly-F/docs/design-system.md) |
| Para la puerta de calidad, la CI, los commits y el cierre de una tarea | [CONTRIBUTING.md](CONTRIBUTING.md) |

`docs/historico/` está **congelado**: la auditoría del 2026-08-04 y las fichas de las tareas
cerradas, escritas en presente sobre un estado que ya no existe. Sirve para saber por qué existe
algo, no cómo está.

**Al cerrar una tarea, se anota en el ROADMAP** (los pasos, en CONTRIBUTING). Es lo que sobrevive
entre sesiones y entre equipos.

## Verificación

```bash
pnpm verify    # antes de cada commit; la CI lo repite, no lo sustituye
```

Encadena `prisma generate → prisma migrate deploy → check → test:coverage → build → smoke →
auditoria`. El workflow llama a ese mismo script: no se le añaden pasos propios.

- **Necesita** PostgreSQL accesible y las cuatro variables imprescindibles en `.env`
  (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`). El puerto de la base varía
  según el equipo: manda el `.env` local.
- **Los tests corren contra `Stockly_test`**, nunca contra la de desarrollo, y **`verify` no la
  migra**. Tras una migración nueva: `DATABASE_URL=…/Stockly_test pnpm exec prisma db push`
  (`migrate deploy` falla ahí). Un fallo masivo de la suite que hable del esquema es esto.
- **`smoke` no es redundante con `build`**: `tsc` no reescribe los alias `@/`, y un build que
  compila puede no arrancar.
- **`auditoria`** rompe ante una vulnerabilidad alta o crítica en producción o una licencia fuera
  de la lista. Sin red avisa y deja pasar; `--estricto` lo convierte en fallo.
- **La prueba de carga (`load/`) no está en `verify`** y no debe estarlo. Va a mano y siempre
  contra `Stockly_carga`.
- **Un cambio de contrato se sube primero aquí**: la CI del frontend clona el `main` de este
  repositorio. En la CI, las acciones van fijadas por SHA y nunca `pull_request_target`.

## Reglas

- **pnpm 12.4.1**, fijado en `packageManager` y en el `Dockerfile`. No usar npm ni yarn. pnpm 12
  rechaza ajustes desconocidos en `pnpm-workspace.yaml`.
- **Comentarios y documentación en español.**
- **Nunca versionar credenciales reales.** El `.env` está ignorado; una fuga ya obligó a reescribir
  el historial.
- **`.agents/` y `.claude/` se versionan a propósito.** Son la mayoría de los archivos rastreados:
  para buscar en el código, `git buscar X` o `git grep X -- ":!.agents" ":!.claude"`.
- **La forma de las respuestas se declara una sola vez**, en
  [`src/contratos/api.ts`](src/contratos/api.ts). Al cambiarla: `pnpm contratos:generar` y commit
  en **los dos** repositorios. Ese archivo **solo puede importar `zod`**, y sus enums se repiten a
  propósito ([ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md)).
- **El spec de OpenAPI no se escribe a mano**: `components.schemas` lo genera
  `src/swagger.esquemas.ts` con `z.toJSONSchema()` de Zod 4, sin `zod-to-openapi`. Las rutas de
  `src/swagger.paths.ts` sí.
- **Quién puede llamar a cada ruta está en la tabla `PERMISOS` del contrato.** Una ruta nueva se
  protege con `permitir("<MÉTODO> <ruta>")` y lleva su fila. **No escribas una lista de roles al
  lado** (`requireRole(...)`): es lo que detecta `permisos.test.ts`.
- **Un error que se lance lleva código**: `new HttpError(status, "mensaje en español", "CODIGO",
  { params })`, dado de alta en `CODIGOS_DE_ERROR`. Uno nuevo sin traducción rompe la suite del
  frontend ([ADR 0007](docs/adr/0007-i18n-propio.md)).
- **Ningún texto de correo se escribe en `nodemailer.ts`**: sale de
  [`src/shared/i18n/correos.es.ts`](src/shared/i18n/correos.es.ts). Cada función de envío recibe
  un `idioma` **obligatorio y sin valor por defecto**.
- **Ningún listado se devuelve entero.** Todo `findMany` de lectura lleva `parsePagination` y
  `meta`, con **los filtros en el `where`**. Las exportaciones van por lotes con
  `enviarExportacion`, aunque parezcan pequeñas.
- **Antes de subir `work_mem` u otro parámetro del servidor, reescribe la consulta**, y desconfía
  de un `GROUP BY` sobre una expresión ([docs/rendimiento.md §5](docs/rendimiento.md)).
- **Todo lo que mueve stock ocurre en una transacción** y con decremento condicional
  ([ADR 0001](docs/adr/0001-decremento-condicional-de-stock.md)).
- **Una transitiva vulnerable que su dueño fija a versión exacta se sube con `overrides`** en
  `pnpm-workspace.yaml`, y cada línea dice cuándo retirarla.
- **El seed es un libro mayor**, no un montón de `create`: cierra exactamente en el stock del
  catálogo. Una tabla nueva se añade **también a `limpiar()`** en
  [`prisma/seed.ts`](prisma/seed.ts); olvidarla no da error, deja huérfanos.
- **La imagen de producción se poda en el `build`** con
  [`scripts/podar-produccion.js`](scripts/podar-produccion.js), que es una regla y no una lista:
  no hay que tocarlo al subir Prisma. Las migraciones las aplica el servicio `migrate` del
  compose, no el `CMD`.
