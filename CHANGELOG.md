# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Cubre **los dos
repositorios**, `Stockly-B` y `Stockly-F`. Entre paréntesis va la tarea del
[ROADMAP](docs/ROADMAP.md); lo que se midió al cerrarla está en el
[histórico](docs/historico/ROADMAP-2026-10-05.md).

> **Todavía no hay ninguna versión publicada.** Los repositorios están sin etiquetar y sus
> `package.json` no coinciden (`1.0.0` y `0.0.0`), así que todo vive en **Sin publicar**, sin
> fechas de versión inventadas. Al cortar la primera habrá que reconciliar esos dos números.

---

## [Sin publicar]

### Añadido

**Venta de mostrador y documento de venta (Tier 6)**

- **Comprobante de venta en PDF** (`T6-07`): cada venta enviada tiene un comprobante para darle a
  quien compra —`GET /sale-orders/:id/receipt`—, con el logo y los datos del negocio, el número,
  la fecha, el cliente y su documento, quién la registró, las líneas y subtotal, impuesto y
  total. Se descarga desde el detalle de la venta y desde la ficha del cliente, con cualquier
  rol. Es un **comprobante interno**: dice «Documento sin valor fiscal». Una venta cancelada
  después de enviarse lo conserva, marcado «ANULADA»; una pendiente no lo tiene (409). La orden
  declara ahora `shippedAt` en el contrato.
- **Vendedor y documento del cliente en la venta** (`T6-06`): cada venta dice quién la registró
  —el correo de su sesión, que sobrevive a la cuenta— y los clientes tienen un documento (cédula,
  RNC, NIF) que la venta copia a su instantánea. Se ven en el detalle de la venta, en la ficha
  del cliente y en la exportación, y los clientes se buscan también por su documento. El
  vendedor de las ventas anteriores se recupera de la auditoría. **Requiere migración.**
- **Impuesto en la venta** (`T6-05`): en Configuración, la tasa de impuesto sobre las ventas —un
  porcentaje, **0 por defecto**, que deja todo como estaba— y su nombre («ITBIS», «IVA»). Cada
  venta nueva congela la tasa vigente en sus líneas, y la orden trae `subtotal`, `tax` y `total`
  calculados por el servidor; cambiar la tasa después no altera las ventas ya creadas. Los
  precios, los informes, la ficha del cliente y el resumen semanal siguen sin impuesto. La
  exportación añade `taxRate`, `taxLine` y `totalLineWithTax`. **Requiere migración.**
- **Número correlativo de venta** (`T6-04`): cada venta tiene un número consecutivo, `#000123`, en
  lugar del principio de su identificador. Sale en la lista, la ficha del cliente, la nota de los
  movimientos de stock, el aviso de venta sin stock, el resumen semanal y la exportación —columna
  nueva `orderNumber`—, y la pantalla de ventas busca por él (`GET /sale-orders?number=`). Una
  venta rechazada por falta de disponible no gasta número. Las órdenes que ya existían se numeran
  por fecha de creación; las notas y los avisos anteriores conservan el identificador corto.
  **Requiere migración.**
- **Datos del negocio y moneda configurable** (`T6-03`): en Configuración, el nombre, el documento
  fiscal, la dirección, el teléfono, el correo y el logo del negocio, y el símbolo de su moneda,
  que pasa a ir delante de todos los importes: en pantalla, en los PDF de informes, en las
  etiquetas y en el resumen semanal. Sin tocar nada, todo sigue en `$`. Rutas nuevas
  `GET /settings/business` —para cualquier rol—, `PUT` y `DELETE /settings/logo`.

**Funcionalidad de negocio (Tier 5)**

- **Avisos dentro de la aplicación** (`T5-12`): una campana con los avisos de cada usuario —stock
  bajo, venta que no se pudo enviar, compra fuera de plazo— y su contador de no leídos. El de
  stock bajo sale aunque el correo esté desactivado. Rutas bajo `/notifications`.
- **Resumen semanal por correo** (`T5-11`): lo vendido la semana anterior y lo que sigue
  pendiente, a cada administrador en su idioma. Lo envía `pnpm resumen:enviar`, programado desde
  fuera; repetirlo no manda nada dos veces.
- **Clientes** (`T5-06`): ficha con historial, alta y edición, y un buscador en el formulario de
  venta. Las ventas se vinculan por el correo, también las que ya existían.
- **Código de barras, escáner y etiquetas** (`T5-08`): campo validado en el producto, lectura con
  la cámara, una foto o una pistola USB, y etiquetas en PDF en hoja A4 o en rollo.
- **Conteo físico de inventario** (`T5-07`): se cuenta a ciegas, se revisan las diferencias y al
  cerrar cada una se convierte en un ajuste. Se compara con el stock del momento de contar.
- **Rol de almacén** (`T5-13`): `WAREHOUSE` recibe compras, envía ventas y mueve stock, sin tocar
  precios, catálogo, usuarios ni configuración. Ruta nueva `POST /sale-orders/:id/ship`.
- **Clasificación ABC** (`T5-10`): columna y filtro en el catálogo, sobre los doce meses naturales
  anteriores (`GET /reports/abc`, `?abcClass=`).
- **Ventas y compras por periodo** (`T5-09`): atajos o rango de fechas, con desglose por mes,
  categoría y producto, CSV y PDF (`GET /reports/period`). En la zona horaria del negocio, un
  ajuste nuevo.
- **Sugerencias de reposición y plazo de entrega del proveedor** (`T5-05`): qué pedir según
  salidas, plazo, mínimo, disponible y pendiente de recibir, y una orden por proveedor.
- **Recepción parcial de órdenes de compra** (`T5-04`): cada entrega registra lo que llega de cada
  línea (`POST /purchase-orders/:id/receipts`). Cancelar retira lo que entró, no lo pedido.
- **Stock comprometido y disponible** (`T5-03`): una venta nueva no puede pedir más de lo
  disponible; la API responde 409.
- **Valor del inventario a coste y margen realizado** (`T5-02`), en dashboard, informe y PDF. Cada
  venta congela su coste al enviarse.
- **Coste medio ponderado** (`T5-01`): cada recepción lo recalcula y deja una fila en el historial
  de costes. Un producto sin coste lo tiene desconocido, no cero. Las compras ya recibidas se
  pueden cancelar desde la interfaz.

**Plataforma**

- **Integración continua** ([ADR 0008](docs/adr/0008-integracion-continua.md)): GitHub Actions
  repite `pnpm verify` en cada push y pull request, y el frontend además el E2E.
- **Banco de pruebas de carga** (`T4-08`), en `load/`: 100 000 productos y 1 100 000 movimientos
  en una base aparte. Mediciones en [docs/rendimiento.md](docs/rendimiento.md).
- **Auditoría de dependencias en `verify`** (`T4-07`): una vulnerabilidad alta o crítica, o una
  licencia no permitida, rompen la compilación. El frontend distribuye su aviso de terceros.
- **Monitorización y alertas** (`T4-06`): `GET /api/v1/metrics` en formato Prometheus, aviso por
  correo ante un pico de 5xx y, en `observabilidad/`, las reglas de alerta con sus pruebas.
- **Copia de seguridad y restauración** (`T4-05`): `pnpm db:backup` con retención y
  `pnpm db:restaurar`, por defecto en una base de ensayo
  ([docs/operaciones.md](docs/operaciones.md)).
- **Interfaz en español e inglés** (`T4-04`), con motor propio
  ([ADR 0007](docs/adr/0007-i18n-propio.md)). Los errores de la API viajan con un código estable.
- **Modo oscuro y selector de tema** (`T4-03`, `T4-11`): claro, oscuro o automático, sin clases
  `dark:`.
- Detección de reuso de refresh tokens (`T2-31`) y validación de imágenes por *magic bytes*
  (`T2-32`).
- Exportación por lotes con tope configurable (`T2-05`) y sonda `/ready` separada de `/health`
  (`T2-25`).
- Registro estructurado con `requestId` (`T2-10`) y especificación OpenAPI completa (`T2-30`).
- Contenedor del frontend tras nginx y superposición de producción del compose (`T2-27`,
  `T2-28`).
- Tests de contrato entre los dos repositorios (`T2-24`).
- Sistema de diseño documentado (`T3-15`), decisiones de arquitectura (`T3-11`) y guía de
  contribución (`T3-10`).
- Alias `git buscar`, que excluye de las búsquedas el tooling de IA versionado (`T3-06`).

### Cambiado

- **Documentación reorganizada y compactada** (2026-10-05). El ROADMAP pasa a ser el índice del
  trabajo pendiente; las fichas completas y la auditoría se archivan en `docs/historico/`.
- **Licencia: GNU AGPL v3**, en lugar de la MIT ([ADR 0009](docs/adr/0009-licencia-agpl.md)). El
  perfil enlaza el código desde «Acerca de Stockly». Lo publicado antes del 2026-09-30 sigue
  siendo MIT.
- La consulta periódica de avisos tiene su propio cupo de peticiones (`T5-12`).
- El gráfico de movimientos por mes usa meses naturales completos, en la zona del negocio
  (`T5-09`).
- Una orden de compra con mercancía recibida ya no vuelve a pendiente ni se elimina a medias
  (`T5-04`).
- **El seed describe el esquema entero y su histórico cuadra**: un único libro mayor que cierra en
  el stock del catálogo, con datos reproducibles. `pnpm check` comprueba también `prisma/seed.ts`.
- **La imagen de producción del backend baja de 1.81 GB a 426 MB** (`T4-14`). Las migraciones
  salen del `CMD` a un servicio `migrate`.
- **La pila del compose pasa a PostgreSQL 17** (`T4-13`), y `pnpm db:restaurar` comprueba la
  versión del volcado antes de borrar nada.
- **Los correos salen en el idioma de quien los recibe** (`T4-12`). Columna `users.idioma` y
  `PATCH /auth/me/idioma`.
- **La navegación en pantallas anchas pasa a una barra lateral** (`T4-10`): todos los destinos a
  un clic. La cabecera deja de ser `<nav>`.
- **La especificación OpenAPI se deriva** del contrato y de los validadores (`T4-02`).
- **Los tipos de las respuestas se declaran una sola vez**, en el contrato, y el frontend compila
  contra una copia (`T4-01`, [ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md)).
- `users.role` y los campos de texto de `audit_logs` pasan a enums de PostgreSQL (`T3-02`).
- Escala tipográfica, radios y elevación reducidos a tokens con nombre (`T2-41`, `T3-14`).
- Las exportaciones CSV de los dos repositorios producen las mismas columnas (`T3-05`).
- El resumen del dashboard se calcula en la base (`T2-02`).

### Eliminado

- `morgan` y `@types/morgan` (2026-10-05): nadie los importaba desde que `pino` los sustituyó en
  `T2-10`. Con ellos, tipos y funciones sin ninguna referencia en los dos repositorios.
- `NavDropdown`, sin usuarios tras la barra lateral (`T4-10`).

### Corregido

- Subir una imagen de más de 2 MB, de un tipo no admitido o en un campo equivocado respondía 500,
  en el logo y en la foto de un producto. Ahora responde 413, 422 o 400, con un código que la
  interfaz traduce (`T6-03`).
- Un importe negativo salía `$-1,234.50` en los PDF y `-$1,234.50` en pantalla: había un
  formateador por repositorio. Ahora es uno solo, en el contrato (`T6-03`).
- Los formularios de venta y de compra solo dejaban elegir los cien productos activos más
  recientes; uno más antiguo había que escribirlo a mano, y así la orden no movía stock. El
  producto de cada línea se busca ahora en el servidor mientras se escribe, o se escanea (`T6-02`).
- La pantalla de ventas solo enseñaba las diez órdenes más recientes, sin forma de llegar a las
  demás. Ahora pagina, cuenta todas y filtra por estado y por fecha de creación
  (`GET /sale-orders?from=&to=`, en días de la zona horaria del negocio) (`T6-01`).
- Los correos se salían de la pantalla en el móvil, y los interruptores de Configuración no
  tenían nombre para un lector de pantalla (`T5-11`).
- La barra de selección del catálogo ensanchaba la página en el móvil (`T5-06`).
- Un SKU repetido daba un error del servidor en lugar de decir que ya era de otro producto, y los
  botones de la ficha salían partidos (`T5-08`).
- Los botones de exportar órdenes salían a roles que no podían usarlos (`T5-13`).
- Las descargas fallaban con la API en otro origen y, con la sesión caducada, guardaban el error.
- Dos recepciones simultáneas de la misma compra podían sumar el stock dos veces (`T5-04`).
- La lista de productos no se refrescaba tras operar con órdenes (`T5-03`).
- «Nuevo proveedor» se abría con los datos del último creado (`T5-05`).
- **El histórico de un producto ya no se devuelve entero** (`T4-15`): pagina y filtra en la base,
  y su exportación va por lotes. De 3.17 s a 57 ms con 100 000 movimientos.
- **El dashboard baja de 1.91 s a 337 ms en el p(95)** (`T4-16`), reescribiendo dos consultas y
  sin tocar `work_mem`.
- **Accesibilidad de las pantallas principales a 100 en Lighthouse** (`T4-09`): desplegables sin
  nombre accesible, pantallas sin `<main>` y enlaces distinguidos solo por el color.
- Repaso de la interfaz en móvil: tablas que no se desplazaban, modales, filtros, campos de fecha y
  el menú de navegación, que dejaba desplazar la página por detrás.
- Ocho claves muertas fuera del catálogo de idiomas, con una guardia para que no vuelvan.
- La licencia declarada no era la del proyecto (`T4-07`).
- El anillo de foco dibujaba un halo blanco en tema oscuro (`T4-11`).
- La documentación de `/settings`, `/reports` y `/products/export` no describía lo que devolvían
  (`T4-02`).
- Importes declarados `number` que llegan como cadena, y una acción de auditoría sin color
  (`T4-01`).
- Un filtro de enum inesperado en la URL daba 500 en vez de 400 (`T3-02`).
- El botón flotante del catálogo dejaba la paginación sin poder pulsarse (`T3-09`).
- Un cuerpo por encima del límite respondía 500 en vez de 413 (`T2-33`), y los CSV perdían los
  acentos al abrirse en Excel (`T2-34`).
- Cinco listados reventaban con un `page` no numérico (`T1-16`).
- El guardado de configuración no guardaba (`T1-05`, `T1-06`) y las etiquetas de producto se
  descartaban en silencio (`T1-03`).
- Cancelar una venta enviada o una compra recibida no revertía el stock (`T0-03`, `T0-04`).

### Seguridad

- **Dependencias al día ante avisos publicados** (2026-09-28 y 2026-09-30): `axios` 1.20,
  `nodemailer` 10, `multer` 2.4 y `overrides` para cuatro transitivas. pnpm pasa a 12.4.1. El
  patrón, en [docs/dependencias.md §2](docs/dependencias.md). El 2026-10-06, `proxy-addr` 2.0.8
  en el backend y `source-map-js` 1.2.2 en el frontend, las dos transitivas y con `pnpm update`.
- Una cuenta desactivada conservaba el acceso hasta 15 minutos (`T1-11`, `T1-12`).
- `logout` quedaba expuesto a CSRF (`T1-19`) y el correo salía sin cifrar (`T1-20`).
- Restablecer la contraseña no revocaba las sesiones (`T0-07`).
- El contenedor se ejecutaba como root (`T1-21`) y el primer usuario registrado se convertía en
  administrador (`T1-22`).
- Las respuestas de error filtraban rutas del sistema de archivos (`T3-13`).
- `robots.txt` y `noindex`: la aplicación declara que no debe indexarse (`T3-12`).

---

## Hitos

No son versiones: son los días en que se cerraron bloques de tareas.

| Fecha | Hito |
|---|---|
| 2026-05-24 | Primer commit |
| 2026-08-04 | Auditoría inicial. **Tier 0 cerrado**: los bloqueadores |
| 2026-08-09 | **Tiers 1 y 2 cerrados**: funciones rotas, rendimiento, accesibilidad, sistema de diseño |
| 2026-08-10 | **Tier 3 cerrado**: pulido, documentación y decisiones de arquitectura |
| 2026-08-12 | **Tier 4 cerrado**: contrato, i18n, modo oscuro, operaciones, carga y dependencias |
| 2026-09-13 | Se abre el **Tier 5**, funcionalidad de negocio |
| 2026-09-28 | Los repositorios pasan a ser públicos, con CI |
| 2026-09-30 | Licencia AGPL v3 |
| 2026-10-01 | Tier 5 en 13 de 15: quedan las dos tareas condicionadas |
