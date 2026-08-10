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

Al 2026-08-10: **97 de 107 tareas**, con el Tier 4 explícitamente fuera del alcance
inmediato. Backend **362 tests** y 91 % de cobertura de sentencias; frontend **419 tests** y
49.7 %; E2E 9 pasados y 1 omitido en `chromium` y en `Mobile Chrome`.
