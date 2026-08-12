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

- **Banco de pruebas de carga** (`T4-08`), en `load/`. `pnpm carga:sembrar` construye una base
  aparte con 100 000 productos y 1 100 000 movimientos —incluido **un producto caliente con
  100 000 él solo**, porque la media de once por producto no se parece a ningún inventario
  real—; `pnpm carga:consultas` mide las consultas del hallazgo P-01 **quitando y reponiendo
  los índices sobre el mismo dato**; y `pnpm carga:ejecutar` lanza k6 en Docker contra el
  backend compilado. Ninguno toca la base de la aplicación: abortan si el nombre coincide.
  Las mediciones y lo que destaparon, en [`docs/rendimiento.md`](docs/rendimiento.md).

- **Análisis de composición de dependencias en la verificación local** (`T4-07`).
  `pnpm verify` termina ahora en `pnpm auditoria`, en los dos repositorios: una
  vulnerabilidad **alta o crítica** en dependencias de producción rompe la compilación, y
  una licencia que no esté en la lista permitida también. El resultado de hoy es limpio —0
  vulnerabilidades sobre 296 paquetes en el backend y 118 en el frontend, y **ni GPL, ni
  LGPL, ni AGPL, ni SSPL** en ninguno de los dos árboles—, así que la puerta se demuestra en
  rojo con informes fabricados, no ejecutándola. Sin conexión avisa en vez de fallar, y
  `--estricto` invierte esa decisión para antes de publicar. El informe completo, con lo que
  **no** cubre, está en [`docs/dependencias.md`](docs/dependencias.md).

- **Aviso de terceros distribuido con la aplicación** (`T4-07`).
  `Stockly-F/public/AVISOS-DE-TERCEROS.txt` recoge la licencia de los 118 paquetes de
  producción y se sirve junto a la aplicación. No es formalismo: los `.woff2` de Inter se
  copian a `dist/`, así que la aplicación **distribuye** la tipografía y la OFL-1.1 exige que
  el aviso la acompañe. Se regenera con `pnpm auditoria --informe`.

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

- **La imagen de producción del backend baja de 1.81 GB a 426 MB** y su árbol de 313 a **183
  paquetes** (`T4-14`). Dentro viajaban una interfaz gráfica de 42 MB (`@prisma/studio-core`,
  con React y `elkjs` — **la única EPL-2.0** del proyecto), TypeScript, `effect` y un
  PostgreSQL para navegador (`@electric-sql/pglite`). Nada de eso lo ejecuta un servidor.
  - **Las migraciones salen del `CMD`** a un servicio `migrate` que corre antes y termina; el
    backend no arranca hasta que sale con 0. Con varias réplicas, el arreglo anterior lanzaba
    `migrate deploy` desde todas a la vez contra la misma base.
  - El árbol se poda con [`scripts/podar-produccion.js`](scripts/podar-produccion.js), que
    **corta los peers opcionales y barre lo inalcanzable** en vez de enumerar paquetes.
  - **La causa no era la que se había anotado:** `prisma` no viajaba por estar en
    `dependencies` —`@prisma/client` lo declara como *peer opcional*—, así que bajarlo a
    `devDependencies` no cambia ni un paquete. Medido en [`docs/dependencias.md`](docs/dependencias.md).
- **La pila del compose pasa a PostgreSQL 17** (`T4-13`). Levantaba `postgres:16-alpine`
  mientras el servidor de desarrollo del proyecto era 17.10, y `pg_restore` **solo va hacia
  adelante**: cada copia de seguridad era un archivo que no se podía restaurar en la pila.
  Subir acepta los volcados de 16 y los de 17; la regla que queda es **nunca por debajo del
  servidor más nuevo** que se use en el proyecto.
  - `pnpm db:restaurar` compara ahora la versión del volcado con la del servidor de destino
    **antes del `dropdb`**, y aborta sin tocar nada. Antes el fallo llegaba a mitad de la
    restauración, con la base ya borrada y un error —`unrecognized configuration parameter
    "transaction_timeout"`— que no menciona la versión por ningún lado.
  - **Cambiar la imagen invalida el volumen de datos.** El ciclo de volcado, volumen nuevo y
    restauración está en [`docs/operaciones.md §9`](docs/operaciones.md).
- **Los correos salen en el idioma de quien los recibe** (`T4-12`). Verificación de cuenta,
  restablecimiento de contraseña, alerta de bajo stock y aviso de pico de 5xx —**cuatro, no
  los tres** que decía la ficha: T4-06 añadió el último después de escribirla—. El texto sale
  de un catálogo por idioma y ya no vive dentro del HTML; el inglés se declara como un
  `Record` sobre las claves del español, así que **una frase sin traducir no compila**.
  - Nueva columna `users.idioma` y `PATCH /auth/me/idioma`. El frontend la sincroniza con su
    idioma efectivo **solo cuando dejan de coincidir**, y manda ese idioma en `Accept-Language`
    para el registro, que es el único correo hacia alguien que todavía no tiene fila.
  - **No sustituye a la preferencia del navegador:** la interfaz se sigue decidiendo por
    dispositivo. Esta columna existe porque un correo se redacta sin nadie delante — la alerta
    de bajo stock la dispara una venta ajena.
- **La navegación en pantallas anchas pasa a una barra lateral** (`T4-10`). De 1024 px en
  adelante, los doce destinos están desplegados y **ninguna sección cuesta ya dos clics**:
  antes nueve de los doce módulos vivían dentro de uno de los tres desplegables de la barra
  superior. La cabecera se queda con la marca y la sesión, y **deja de ser `<nav>` para ser
  `<header>`** — un *landmark* de navegación que no lleva a ninguna parte solo estorba a
  quien recorre la página por regiones. Por debajo de 1024 px no cambia nada: sigue el panel
  desplegable de siempre. La sección actual se marca con color **y** con `aria-current`.
  - Con ello, **`NavDropdown` se retira**: sin barra horizontal se quedó sin usuarios.
  - Y desaparece la duplicidad que no estaba en la ficha: móvil y escritorio tenían **dos
    recorridos con órdenes distintos**, así que cada destino nuevo había que darlo de alta
    dos veces. Ahora los dos envoltorios pintan la misma lista.
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

- **Los modales también se miden a 412 px.** El repaso de móvil llegó a las pantallas y no
  a lo que se abre encima. En el detalle de producto, las dos acciones eran `flex-1` en una
  fila y `flex-1` **no reparte a partes iguales** —el mínimo de un elemento flexible es su
  contenido—: «Ver movimientos» salía a 146 px partido en dos líneas y «Editar producto» a
  178 en una. Ahora se apilan hasta `sm` y miden los dos 348. Los campos pasan a una columna
  —a dos quedaban 116 px de texto, y «12 ago 2026, 10:36 a.m.» ocupaba tres líneas—, la
  miniatura baja a 64 px y el `Modal` usa `px-4` hasta `sm`, como el contenedor de página.
- **Una acción que navega vuelve a ser un solo control.** El botón de «Ver movimientos» era
  un `<Button>` dentro de un `<Link>`: HTML inválido y **dos paradas de tabulación para una
  sola acción**, el mismo defecto que T2-14 quitó de la tabla de productos y que volvió aquí.
  Como reaparecer es lo que lo convierte en regla, ahora lo vigila `accesibilidad.test.ts`
  en todo `src/`.
- **Repaso de la interfaz en móvil, medido a 412 px** (Galaxy S20 Ultra). El valor del
  inventario se salía de su tarjeta en Reportes; los filtros de Productos cabían dos por
  fila pero ninguno dejaba leer la opción elegida; en las órdenes de compra y venta las
  acciones de icono se comían la fila y el nombre del proveedor caía en seis líneas —y el
  importe, oculto en móvil, ahora se ve—; y el panel de «Exportar» se dibujaba con la
  primera letra fuera de la pantalla. El armazón de las pantallas pasa a tres constantes
  compartidas con su guardia en `desbordes.test.ts`, que de paso destapó otras tres
  pantallas con el relleno de escritorio fijado.
- **Las tablas vuelven a desplazarse a lo ancho.** Seis de las doce estaban dentro de una
  tarjeta con `overflow-hidden` —puesto para recortar las esquinas redondeadas— que anula
  el desplazamiento: a las columnas de la derecha no había forma de llegar desde un
  teléfono. Ahora todas comparten contenedor y ancho mínimo, y la barra va oculta
  (`sin-barra`) sin perder el desplazamiento con el dedo, la rueda o el teclado.
- **Auditoría y Usuarios dejan de esconder columnas en móvil.** «Detalles», «Fecha» y
  «Registrado» salían solo a partir de `md`; ahora que la tabla se desplaza, ocultarlas era
  perder información sin ganar nada.
- **Con el menú de navegación abierto, la página ya no se desplaza por detrás.** El panel
  tiene altura máxima y desplazamiento propio (`dvh`, no `vh`), corta el encadenamiento con
  `overscroll-contain` y bloquea el elemento raíz mientras está abierto —en `<html>`, que
  es el que desplaza; hacerlo en `<body>` no cambiaba nada—.
- **Los campos de fecha se ven igual en todos los navegadores** (`CampoDeFecha`). En Android
  salían vacíos y con el indicador descolocado —un chevron de desplegable en vez de un
  calendario—: ahora el adorno nativo se apaga, el icono lo pinta la aplicación, hay una
  pista de formato traducida cuando el campo está vacío y **toda la caja abre el
  calendario**, no solo el icono de la esquina.
- **La primera pantalla del producto era la menos accesible** (`T4-09`). Auditada con
  Lighthouse sobre el build de producción tras nginx, el login puntuaba **93** —el criterio
  del proyecto es ≥ 95— y productos y movimientos, 94 y 95. Las cuatro pantallas quedan en
  **100**. Los fallos comparten forma: **ocho desplegables sin nombre accesible** —lo que se
  ve es la opción elegida, que dice el valor y no de qué es el filtro—, **las siete pantallas
  sin sesión sin landmark `<main>`** y **enlaces que solo se distinguían por el color**, con
  el subrayado reservado al paso del ratón. Ninguno se nota mirando la pantalla, que es
  justamente el problema. Informe en [`docs/accesibilidad.md`](docs/accesibilidad.md).
- **El menú de usuario se anunciaba con un nombre distinto del que enseña** (`T4-09`). Decía
  «Admin Principal» y respondía a «Menú de usuario»: quien maneja el ordenador **por voz**
  dice lo que ve, y no ocurría nada (WCAG 2.5.3).
- **La licencia declarada no era la del proyecto** (`T4-07`). `Stockly-B/package.json` decía
  `ISC` mientras su archivo `LICENSE` es MIT. Los dos repositorios declaran ahora `MIT` y su
  autor, que es lo que dicen los dos archivos `LICENSE`.
- **Un desplegable ya no se queda en su relleno.** El de la columna de acciones de Usuarios
  medía 50 px, de los que 48 eran el `pl-3` + `pr-9` del chevron: se veía el indicador y ni
  una letra del rol. `w-full` es un porcentaje y no aporta anchura intrínseca, así que
  dentro de una fila flexible el campo no reclama sitio; el ancho mínimo va en `Select` y no
  en la página, porque el fallo es de cualquier `Select` que caiga en un `flex`. De paso,
  ese desplegable pasa a nombrar la fila (`Cambiar el rol de Laura Sánchez`): sin etiqueta,
  un lector de pantalla anunciaba tres controles llamados «Admin».
- **Los filtros de movimientos de un producto** dejan de comprimirse: las etiquetas
  «Desde»/«Hasta» pasan encima del campo y cada control ocupa su fila en móvil, donde un
  `input[type=date]` de 120 px no llegaba a mostrar el año.
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
