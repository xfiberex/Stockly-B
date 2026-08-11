# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Cubre **los dos repositorios**, `Stockly-B` y `Stockly-F`, igual que el resto de `docs/`.

> **Todavía no hay ninguna versión publicada.** Los dos repositorios están sin etiquetar
> (`git tag` no devuelve nada) y sus `package.json` ni siquiera coinciden: `Stockly-B` dice
> `1.0.0` y `Stockly-F` dice `0.0.0`. Por eso todo lo de abajo vive en **Sin publicar**, y
> por eso no hay fechas de versión inventadas. Al cortar la primera —ver
> [CONTRIBUTING](CONTRIBUTING.md)— habrá que reconciliar esos dos números.

---

## [Sin publicar]

Trabajo de remediación derivado de [`docs/INFORME-AUDITORIA.md`](docs/INFORME-AUDITORIA.md)
(2026-08-04) y de la consultoría de estilo UX/UI (2026-08-05). Progreso y detalle por tarea
en [`docs/ROADMAP.md`](docs/ROADMAP.md).

### Añadido

- **Monitorización y alertas** (`T4-06`). `GET /api/v1/metrics` expone métricas en formato
  Prometheus —peticiones, duración, 5xx y las del proceso—, protegido por `METRICS_TOKEN` y
  **cerrado en producción si no se configura**. Además, el backend detecta por su cuenta un
  pico de errores 5xx y avisa por correo sin depender de nada externo: es lo que hace que
  el sistema deje de estar mudo aunque no se despliegue Prometheus. Para cuando se
  despliegue, `observabilidad/` trae el overlay de compose, cinco reglas de alerta y sus
  **pruebas unitarias** (`promtool test rules`). Detalle en
  [`docs/operaciones.md §8`](docs/operaciones.md).

- **Copia de seguridad, restauración y política de reversión** (`T4-05`). `pnpm db:backup`
  vuelca la base en formato `custom`, **verifica el archivo antes de podar** y aplica una
  retención de 14 días que nunca deja menos de tres copias; `pnpm db:restaurar` restaura y
  cuenta lo restaurado, en una base de ensayo salvo que se le pase `--forzar`. El
  procedimiento —y el registro de la primera restauración de prueba, con sus cifras— está
  en [`docs/operaciones.md`](docs/operaciones.md), junto con la política de migraciones
  **solo hacia adelante** que impone Prisma. `backups/` y `*.dump` quedan fuera de git: un
  volcado contiene la base entera, hashes de contraseña incluidos.

- **Interfaz en dos idiomas, español e inglés, con selector en Configuración** (`T4-04`).
  Tres estados —automático, español, inglés—, guardados por dispositivo, con el `lang` de
  `<html>` siguiendo al idioma efectivo. El catálogo vive en `Stockly-F/src/shared/i18n/`,
  con motor propio en vez de `i18next` ([ADR 0007](docs/adr/0007-i18n-propio.md)), y dos
  garantías lo sostienen: el compilador exige que la traducción exista y un test exige que
  ninguna pantalla conserve un texto escrito a mano. Del lado de la API, los errores viajan
  con un **código estable** y sus parámetros, así que el mensaje se compone en el idioma de
  quien mira en vez de llegar hecho desde el servidor.

- **Modo oscuro** (`T4-03`) y **selector de tema en Configuración** —claro, oscuro o
  automático— (`T4-11`). Sin clases `dark:` ni segunda paleta: cada color declara sus dos
  valores con `light-dark()` y todo el conmutador es `color-scheme`. La elección se guarda
  por dispositivo y se aplica **antes del primer pintado**. El contraste AA se recalcula por
  test en los dos temas, y las paletas de los gráficos pasan también a tokens.

- Detección de reuso de refresh tokens: presentar uno ya rotado cierra la familia entera y
  queda registrado en auditoría (`T2-31`).
- Comprobación de firma de imágenes por *magic bytes*, además del `Content-Type` declarado
  (`T2-32`).
- Exportación de productos por lotes con streaming y tope configurable, en vez de construir
  el archivo entero en memoria (`T2-05`).
- Sonda `/ready` que consulta la base, separada de `/health` (`T2-25`).
- Logging estructurado con `requestId` correlacionado entre la línea de acceso y el error
  (`T2-10`).
- Especificación OpenAPI completa —14 etiquetas, 43 rutas, 67 operaciones— con un test que
  recorre el árbol de Express y exige que ninguna quede sin documentar (`T2-30`).
- Superposición de producción para Docker Compose y servicio de frontend tras nginx
  (`T2-27`, `T2-28`).
- Tests de contrato entre frontend y backend, validados **al importar** el módulo de mocks
  (`T2-24`).
- Sistema de diseño documentado en [`Stockly-F/docs/design-system.md`](../Stockly-F/docs/design-system.md)
  (`T3-15`), decisiones de arquitectura en [`docs/adr/`](docs/adr/) (`T3-11`) y esta guía de
  contribución (`T3-10`).
- Alias `git buscar` y `git buscar-archivos` en `.gitconfig-stockly`, que excluyen el tooling de IA
  versionado de las búsquedas por texto. Requieren una activación por clon (`T3-06`).

### Cambiado

- **La especificación OpenAPI deja de escribirse a mano.** Los 23 esquemas de
  `components` se derivan del contrato (respuestas) y de los `*.validator.ts` (peticiones)
  con la conversión nativa de Zod 4, sin dependencias nuevas; las rutas siguen escritas,
  que es lo que no se deduce de un esquema (`T4-02`).
- **Los tipos de las respuestas de la API dejan de declararse dos veces.** `Stockly-B/src/contratos/api.ts`
  es la fuente de verdad y `pnpm contratos:generar` copia el archivo al frontend, que compila
  contra él; tres tests vigilan que los enums sean los de Prisma, que las respuestas reales
  encajen y que la copia esté al día (`T4-01`, [ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md)).
- `users.role` y los dos campos de texto de `audit_logs` pasan a enums nativos de
  PostgreSQL (`T3-02`).
- Los doce módulos del backend exportan igual: un objeto por controlador y por servicio
  (`T3-03`).
- Escala tipográfica reducida a cinco medidas y cuatro pesos, radios a tres y elevación a
  dos tokens con nombre de papel (`T2-41`, `T3-14`).
- Las exportaciones CSV de los dos repositorios producen las mismas once columnas en el
  mismo orden (`T3-05`).
- El resumen del dashboard se calcula en la base con dos consultas agregadas en vez de
  traerse el catálogo entero (`T2-02`).

### Corregido

- El guardado de configuración: un ajuste booleano se leía como cadena y el interruptor se
  pintaba apagado con la opción activa (`T1-05`, `T1-06`).
- Las etiquetas de producto se descartaban en silencio al guardar (`T1-03`).
- Cancelar una venta enviada no devolvía el stock (`T0-03`).
- Cinco listados reventaban con un `page` no numérico (`T1-11`).
- Un cuerpo por encima del límite respondía 500 en vez de 413 (`T2-33`).
- El botón flotante del catálogo dejaba los controles de paginación **sin poder pulsarse**,
  en móvil y en escritorio (`T3-09`).
- Acentos rotos al abrir en Excel las exportaciones CSV, por falta de marca de orden de
  bytes (`T2-34`).
- Un filtro de enum con un valor inesperado en la URL provocaba un **500** en vez de un 400, porque
  la guarda usaba `in` sobre un objeto que hereda de `Object.prototype` (`T3-02`).
- Cuatro campos de importe (`price` y los tres `unitPrice`) se declaraban `number` en el
  frontend y llegan como cadena, y `SettingEntry.value` admitía la forma que causó `T1-06`
  (`T4-01`).
- La acción de auditoría `REFRESH_REUSE` no tenía color desde `T2-31` y se pintaba como un
  evento rutinario siendo una anomalía de seguridad; tampoco estaba en el filtro (`T4-01`).
- El fondo de página lo pintaba solo un envoltorio repetido en nueve pantallas y no el
  `body`, así que al rebotar el desplazamiento asomaba el lienzo del navegador (`T4-03`).
- El anillo de foco dibujaba un halo blanco en tema oscuro: `ring-offset-2` no deja un hueco
  transparente, lo rellena con un `#fff` de fábrica (`T4-11`).
- La documentación de `/settings` describía un mapa de cadenas en las dos direcciones
  cuando la API devuelve un array de ajustes ya tipados; `/reports` daba cuatro de sus seis
  listas como «un array de algo» y `/products/export` no declaraba esquema (`T4-02`).

### Seguridad

- Cuentas desactivadas conservaban acceso hasta 15 minutos, lo que durase su access token
  (`T1-02`).
- `logout` quedaba expuesto a CSRF (`T1-19`).
- El correo salía en claro: se fuerza TLS (`T1-20`).
- Las respuestas de error dejaban de filtrar rutas del sistema de archivos, en cualquier
  entorno y no solo con `NODE_ENV=production` (`T3-13`).
- Índices trigrama y de `createdAt` para que las búsquedas dejen de recorrer tablas enteras
  (`T2-09`, `T2-43`).
- `robots.txt` y `noindex`: la aplicación declara que no debe indexarse (`T3-12`).

---

## Histórico por fases

Reconstruido desde la tabla de progreso del roadmap. No son versiones: son los días en que
se cerraron bloques de tareas.

| Fecha | Hito |
|---|---|
| 2026-05-24 | Primer commit |
| 2026-08-04 | Auditoría inicial. **Tier 0 cerrado** (8 tareas): bloqueadores |
| 2026-08-05 | Consultoría de estilo UX/UI; el roadmap crece con `T2-35`–`T2-41` |
| 2026-08-07 | Grueso del **Tier 1** (24 tareas) y primeras del Tier 2 |
| 2026-08-08 | Tier 2: rendimiento, accesibilidad y cobertura |
| 2026-08-09 | **Tier 1 cerrado** (26/26, al verificar `T1-21` con Docker) y **Tier 2 cerrado** (48/48) |
| 2026-08-10 | Tier 3: pulido, documentación y decisiones de arquitectura |

Al 2026-08-10: **101 de 108 tareas**. Los cuatro tiers de trabajo están cerrados; del Tier 4,
fuera del alcance inmediato, se abordaron `T4-01` —causa raíz común de tres defectos
anteriores—, `T4-02`, que dependía de ella, y `T4-03`, barata porque `T2-35`–`T2-37` ya
habían hecho el trabajo caro. `T4-11` no viene de la auditoría: sale de una limitación que
el propio cierre de `T4-03` dejó anotada. Backend **402 tests** y 92.0 % de cobertura de
sentencias; frontend **471 tests** y 52.2 %; E2E 9 pasados y 1 omitido en `chromium` y en
`Mobile Chrome`.
