# ROADMAP — Stockly

La fuente de verdad del **trabajo pendiente** de los dos repositorios. Cada tarea tiene un
identificador `T{tier}-{nº}` que se cita en commits y documentos:
`fix(T0-01): resolver alias de rutas en el build de producción`.

> **Estado al 2026-10-06: 129 de 139 cerradas.** Quedan ocho del Tier 6, abierto el 2026-10-05,
> y `T5-14` y `T5-15`, que solo se abren con un caso de uso real.
>
> **Cerrada no quiere decir comprobada del todo.** `T4-17`, el recorrido con lector de pantalla,
> se **descartó sin ejecutarse**: el listón de accesibilidad del proyecto es teclado más árbol de
> accesibilidad, y lo que eso no cubre está escrito en [accesibilidad.md](accesibilidad.md).

| Para saber… | Mira |
|---|---|
| Qué se midió al cerrar cada tarea, y su ficha completa | [historico/ROADMAP-2026-10-05.md](historico/ROADMAP-2026-10-05.md) — congelado |
| Los hallazgos que originaron los Tiers 0 a 4 | [historico/INFORME-AUDITORIA.md](historico/INFORME-AUDITORIA.md) — congelado |
| En qué estado está el proyecto y qué no conviene deshacer | [CONTEXTO.md](CONTEXTO.md) |
| Cómo se anota el cierre de una tarea | [CONTRIBUTING.md](../CONTRIBUTING.md#al-cerrar-una-tarea-del-roadmap) |

---

## Resumen

| Tier | Qué es | Cerradas |
|---|---|---:|
| **0** | Crítico: despliegue roto, corrupción de inventario, credencial expuesta | 8 / 8 |
| **1** | Alta prioridad: funciones rotas, verificación local, autorización, accesibilidad grave | 26 / 26 |
| **2** | Mejoras sustanciales: rendimiento, accesibilidad, sistema de diseño, cobertura, infraestructura | 48 / 48 |
| **3** | Pulido y mantenimiento | 15 / 15 |
| **4** | Lo que la auditoría dejó fuera del alcance inmediato, abordado igualmente | 17 / 17 |
| **5** | Funcionalidad de negocio: costes, compras, clientes, almacén, informes, avisos y roles | 13 / 15 |
| **6** | Venta de mostrador y documento de venta: lo que SistemaVenta hace y Stockly no | 2 / 10 |
| | **Total** | **129 / 139** |

Los Tiers 0 a 4 son la remediación de la auditoría del 2026-08-04: 100 tareas salieron de sus
hallazgos y de la consultoría de diseño del día siguiente, y otras 14 las abrió el cierre de una
anterior, casi siempre al medir. El Tier 5 se abrió el 2026-09-13 y no corrige nada: es
funcionalidad nueva.

El Tier 6 se abrió el 2026-10-05, al comparar Stockly con SistemaVenta, un punto de venta en
ASP.NET Core MVC. De sus diez tareas, ocho son funcionalidad nueva —el mostrador y el documento de
venta— y dos, `T6-01` y `T6-02`, corrigen defectos de Stockly que salieron al comparar.

**Los contadores se cuentan, no se recuerdan.** Este documento ya se desfasó más de una vez por
actualizar un número y olvidar otro. Al cerrar o abrir una tarea cambian la casilla, la cabecera,
esta tabla y la fila del índice; si no coinciden, manda el recuento:

```bash
grep -c '^- \[ \] \*\*\[T' docs/ROADMAP.md    # abiertas: 10
grep -c '^| T[0-9]-[0-9]* |' docs/ROADMAP.md  # cerradas: 129
```

---

## Tareas abiertas

### Tier 6 — Venta de mostrador y documento de venta

*Sale de comparar Stockly, el 2026-10-05, con SistemaVenta (`xfiberex/SistemaVenta_ASP.NET_CORE_MVC`),
un punto de venta en ASP.NET Core MVC. **No es una fusión**: los dos llevan inventario y el de
Stockly ya cubre el del otro, así que solo se trae lo que aquel hace y este no. SistemaVenta es la
especificación, no el código —allí los totales los calcula el navegador y el servidor los guarda
como llegan, y el menú por rol solo oculta enlaces—: aquí se reescribe con las reglas de «Una tarea
nueva».*

**Decidido el 2026-10-05, antes de escribir las fichas:**

- **El comprobante es interno, por ahora.** No tiene valor fiscal y lo dice. Es temporal: si un día
  lo tiene, el número fiscal será **otro campo**, con su propia serie y emitido al enviar; el
  correlativo de `T6-04` no se reutiliza para eso. Hasta entonces, la palabra «factura» no aparece
  ni en la interfaz ni en el PDF.
- **Una tasa de impuesto global, guardada en cada línea** de la orden: si después hay productos
  exentos, solo cambia de dónde sale el valor.
- **Un rol nuevo de vendedor** para el mostrador, como se hizo con `WAREHOUSE` en `T5-13`.

**Lo que se dejó fuera, a propósito:** la exportación a `.xlsx` —el CSV ya abre en Excel, y sería
una dependencia más que auditar—; la foto de usuario —manda una cara a Cloudinary, que hoy solo
recibe imágenes de producto ([legal.md §2.1](legal.md))—; las tablas de roles y menús —la matriz
`PERMISOS` es más fuerte—; el tipo de documento «Boleta / Factura» —sin valor fiscal es solo una
etiqueta—; el estado activo de las categorías y la casilla «Mantener sesión».

**Orden.** `T6-01` y `T6-02` corregían defectos, iban primero y están cerradas. De `T6-03` a `T6-06` no dependen
entre sí. `T6-07` necesita esas cuatro, y `T6-08` necesita `T6-07` y el buscador y el escáner de `T6-02`. `T6-09` y `T6-10` son
independientes del resto.

- [ ] **[T6-03] Datos del negocio y moneda configurable**
  - **Área:** Configuración
  - **Ubicación:** `src/modules/settings/` (`SETTINGS_CATALOG`), `src/shared/lib/moneda.ts`, `Stockly-F/src/shared/lib/moneda.ts`, `Stockly-F/src/modules/settings/components/SettingsPage.tsx`, `src/contratos/api.ts` (`PERMISOS`)
  - **Qué hacer:** Stockly no sabe cómo se llama el negocio que lo usa: `/settings` guarda cuatro ajustes operativos y nada de quién vende. Y la moneda está escrita en el código —`es-MX` y `MXN` en el frontend, un `$` pegado delante en el backend—, aunque la zona horaria por defecto sea `America/Santo_Domingo`. Añadir al catálogo de ajustes la razón social, el documento fiscal, la dirección, el teléfono, el correo y la moneda del negocio, y un logo que se sube a Cloudinary por una ruta propia (`upload.middleware` ya valida la imagen por sus bytes). Su primer consumidor es el comprobante de `T6-07`.
  - **Atención:**
    - **`GET /settings` es solo de `ADMIN`** y la moneda la pinta cualquier rol en cualquier pantalla: hace falta una lectura para todos los roles, con su fila en `PERMISOS`, que devuelva solo lo que se enseña y no los ajustes de administración.
    - **`formatearImporte` es una función pura** que llaman doce componentes: el símbolo le tiene que llegar sin convertir cada llamada en un hook, y el primer pintado no puede salir con la moneda equivocada.
    - **Cuatro importes no pasan por ella** y llevan un `$` literal: los ejes de los gráficos de `DashboardPage.tsx`, `ReportsPage.tsx` y `StockMovementsPage.tsx`, y `moneyShort` en `reports.pdf.ts`. En el backend la usan el PDF de informes, las etiquetas y el resumen semanal.
    - **El formato no sigue al idioma de la interfaz** —los importes no cambian con él ([CONTEXTO.md §6](CONTEXTO.md))—: sigue al negocio.
  - **Decisión previa:** símbolo libre o código ISO. Medido el 2026-10-05 en Node 24: `Intl.NumberFormat("es-MX", { style: "currency", currency: "DOP" })` escribe `DOP 14,999.00`; con `currencyDisplay: "narrowSymbol"`, `$14,999.00`, igual que un peso mexicano; solo con la configuración regional `es-DO` sale `RD$14,999.00`. Un código ISO a solas no basta: habría que guardar también la configuración regional. **Recomendado:** un símbolo libre de hasta cinco caracteres, que es lo que hace SistemaVenta, y el formato numérico fijo.
  - **Criterio de aceptación:** cambiar el símbolo a `RD$` cambia todos los importes de la interfaz, del PDF de informes, de las etiquetas y del resumen semanal, y no queda ningún `$` escrito a mano junto a un importe; un `USER` ve la moneda y sigue recibiendo 403 en `GET /settings`; sin logo ni datos del negocio, todo funciona como hoy.
  - **Esfuerzo:** medio
  - **Depende de:** —

- [ ] **[T6-04] Número correlativo de venta**
  - **Área:** Ventas
  - **Ubicación:** `prisma/schema.prisma` (`SaleOrder` y un modelo nuevo para el contador), `src/modules/sale-orders/sale-orders.service.ts` (`create`, las notas de los movimientos y la exportación), `src/contratos/api.ts`, `src/shared/lib/nodemailer.ts` (resumen semanal), `Stockly-F/src/modules/sale-orders/`, `CustomerDetailPage.tsx`, `CampanaDeAvisos.tsx`
  - **Qué hacer:** una venta se identifica por los ocho primeros caracteres de su UUID (`#3F9A01BC`): no se puede dictar por teléfono, no dice cuál fue antes y no sirve para un comprobante. Darle a cada orden un entero consecutivo, que se enseña con ceros a la izquierda (`#000123`) en la lista, la ficha del cliente, la nota de los movimientos de stock, el aviso de venta sin stock, el resumen semanal y la exportación, y por el que la pantalla de ventas puede buscar. El número sale de **una fila contador que se incrementa dentro de la transacción que crea la orden**: una secuencia de PostgreSQL deja un hueco cada vez que una transacción se deshace, y una venta rechazada por falta de disponible (409) no debe gastar número. SistemaVenta lee el contador y lo escribe después, sin bloquearlo: leído en su código —no reproducido—, dos ventas simultáneas pueden leer el mismo.
  - **Migración de lo que ya existe:** las órdenes actuales se numeran por `createdAt` y, a igualdad, por `id`, y el contador arranca en la última. La columna nace anulable, se rellena en la misma migración y lleva índice único. Las notas de movimientos y los avisos ya escritos **no se reescriben**: son dato, y conservan el identificador corto. El modelo nuevo va también a `limpiar()` del seed, que numera sus órdenes y deja el contador donde toca.
  - **Atención:** el número es **interno**. Borrar una orden pendiente deja un hueco en la serie, y se acepta porque la serie no tiene valor fiscal. Si un día lo tiene, el número fiscal será otro campo, emitido al enviar —que es cuando la orden ya no se puede borrar—. Las órdenes de compra y los conteos siguen con su identificador corto.
  - **Criterio de aceptación:** veinte ventas creadas a la vez reciben veinte números consecutivos y distintos; una venta rechazada con 409 no consume número: la siguiente recibe el que le tocaba; tras la migración, el orden de los números es el de `createdAt`; buscar `123` en la pantalla de ventas encuentra la `#000123`.
  - **Esfuerzo:** bajo
  - **Depende de:** T6-01 (cerrada), solo para la búsqueda por número en pantalla

- [ ] **[T6-05] Impuesto en la venta**
  - **Área:** Ventas / Negocio
  - **Ubicación:** `prisma/schema.prisma` (`SaleOrderItem`), `src/modules/settings/settings.service.ts`, `src/modules/sale-orders/`, `src/contratos/api.ts`, `Stockly-F/src/modules/sale-orders/`
  - **Qué hacer:** el total de una venta es cantidad × precio y lo suma el navegador (`orderTotal`, en `SaleOrdersPage.tsx`); el impuesto no existe. Añadir un ajuste con la tasa —un porcentaje entre 0 y 100, **0 por defecto**, que deja todo como está— y otro con su nombre («ITBIS», «IVA»; vacío, el genérico del catálogo de textos). Al crear la orden, la tasa vigente **se congela en cada línea**, como `unitPrice`: cambiar el ajuste no toca las órdenes ya creadas. El servidor calcula subtotal, impuesto y total y los devuelve en la orden, y la interfaz deja de sumar. En SistemaVenta los tres los calcula el navegador y el servidor los guarda como llegan: eso es lo que no se copia.
  - **Decidido (2026-10-05):** una tasa global, guardada por línea. Que un producto tenga la suya o esté exento sería después un campo en `Product`, sin migrar las órdenes.
  - **Atención:**
    - **`unitPrice` sigue siendo sin impuesto.** Los informes calculan ingresos, margen y clase ABC con `quantity * "unitPrice"` (`reports.service.ts`, `reports.abc.ts`): si el precio pasara a incluirlo, los tres saldrían inflados. El impuesto aparece en la orden, en el comprobante y en la exportación; **los informes, la ficha del cliente y el resumen semanal siguen en neto**.
    - **El redondeo se decide una vez y se prueba:** por línea, a dos decimales, y el impuesto de la orden es la suma del de sus líneas. Con `Decimal`, no con `number`.
    - Los importes nuevos son `Importe` en el contrato, como `unitPrice`. Las órdenes anteriores no tienen tasa: `null` se lee como «sin impuesto».
    - Las compras no llevan impuesto: el coste medio se promedia con lo que se escribe en la orden, y eso no cambia.
  - **Criterio de aceptación:** con la tasa al 18 %, una venta de 3 × 100,00 devuelve subtotal 300,00, impuesto 54,00 y total 354,00; el margen de esa venta en `/reports` es el mismo que con la tasa a 0; subir después la tasa al 20 % no altera esa orden; una petición que mande sus propios totales no consigue que se guarden; con la tasa a 0 no cambia ninguna pantalla.
  - **Esfuerzo:** medio
  - **Depende de:** —

- [ ] **[T6-06] Vendedor y documento del cliente en la venta**
  - **Área:** Ventas / Clientes
  - **Ubicación:** `prisma/schema.prisma` (`SaleOrder`, `Customer`), `src/modules/sale-orders/`, `src/modules/customers/`, `src/contratos/api.ts`, `Stockly-F/src/modules/sale-orders/`, `Stockly-F/src/modules/customers/`, `docs/legal.md`
  - **Qué hacer:** dos datos que un comprobante lleva y la orden no tiene. **Quién la registró:** hoy solo consta en la auditoría (`CREATE` sobre `SaleOrder`), que solo lee `ADMIN`; la orden debe decirlo ella misma, con el correo y no con una clave foránea —como la auditoría y los conteos (`createdByEmail`)—, para que sobreviva a la cuenta. **El documento del cliente** (cédula, RNC, NIF): un campo en `Customer` y su instantánea en la orden, junto a `customerName`, `customerEmail` y `customerPhone` y por la misma razón que ellos.
  - **Migración de lo que ya existe:** el vendedor de las órdenes actuales se recupera de `audit_logs` (`action = CREATE`, `entity = SaleOrder`, por `entityId`); las que no tengan fila ahí se quedan sin él, y la migración cuenta cuántas.
  - **Atención:** el documento es un **dato personal nuevo**, y el correo del vendedor en la orden, una copia más de uno que ya se guarda: los dos van a la tabla de [legal.md §2.1](legal.md). **El documento no agrupa clientes:** la regla de `T5-06` sigue siendo una sola —el correo normalizado—, y una venta con documento y sin correo no se vincula a nadie. Si el mostrador de `T6-08` lo pide, cambiar esa regla es una decisión aparte, con su ficha.
  - **Criterio de aceptación:** una venta dice quién la registró aunque después se desactive esa cuenta; elegir un cliente con documento lo copia a la venta, y editar el cliente después no cambia la orden; borrar el cliente deja el documento en la instantánea, y `legal.md` lo recoge.
  - **Esfuerzo:** bajo
  - **Depende de:** —

- [ ] **[T6-07] Comprobante de venta en PDF**
  - **Área:** Ventas
  - **Ubicación:** `src/modules/sale-orders/` (ruta y generador nuevos), `src/contratos/api.ts` (`PERMISOS`), `Stockly-F/src/modules/sale-orders/`, `Stockly-F/src/modules/customers/components/CustomerDetailPage.tsx`
  - **Qué hacer:** no hay ningún papel que darle a quien compra: los únicos PDF son los informes y las etiquetas. Añadir `GET /sale-orders/:id/receipt`, que devuelve el comprobante de una venta enviada, hecho con PDFKit como los otros dos: logo y datos del negocio (`T6-03`), número (`T6-04`), fecha en la zona del negocio, cliente con su documento y quién la registró (`T6-06`), las líneas, y subtotal, impuesto y total (`T6-05`). Se descarga desde el detalle de la orden y desde la ficha del cliente, con `descargarDeLaApi` y no con un enlace.
  - **Decidido (2026-10-05):** es un **comprobante interno**, temporalmente. Se titula «Comprobante de venta» y lleva la leyenda «Documento sin valor fiscal»; la palabra «factura» no aparece ni en el PDF ni en la interfaz. Darle valor fiscal es otra tarea, y empieza por saber qué exige la autoridad tributaria del país donde se use.
  - **Atención:**
    - **PDFKit solo incrusta JPEG y PNG**, y `upload.middleware` admite también WebP: el logo hay que pedírselo a Cloudinary ya convertido. Traerlo es una llamada de red dentro de la petición: lleva tope de tiempo y, si falla, el comprobante sale sin logo, no con un 500.
    - **Qué órdenes lo tienen:** las enviadas. Una pendiente todavía no es una venta y responde 409 con su código; una cancelada después de enviarse lo conserva, marcado como «Anulada».
    - Sale en español, como el resto de exportaciones ([CONTEXTO.md §6](CONTEXTO.md)), y en A4, como en SistemaVenta. Un rollo térmico de 80 mm es otro formato y se decide con la impresora delante, como pasó con el ancho de las barras de las etiquetas.
  - **Criterio de aceptación:** el PDF de una venta de dos líneas con la tasa al 18 % lleva el número, los datos del negocio, las dos líneas y los tres importes de `T6-05`; un `USER` lo descarga; el de una orden pendiente responde 409; con Cloudinary caído sale sin logo; sin datos del negocio sale igualmente, sin huecos vacíos.
  - **Esfuerzo:** medio
  - **Depende de:** T6-03, T6-04, T6-05, T6-06

- [ ] **[T6-08] Venta de mostrador y rol de vendedor**
  - **Área:** Ventas / Autorización
  - **Ubicación:** `prisma/schema.prisma` (`Role`, `AuditAction`), `src/contratos/api.ts` (`rolSchema`, `PERMISOS`), `src/modules/sale-orders/` (ruta nueva), `Stockly-F/src/modules/sale-orders/` (pantalla nueva), `Stockly-F/src/modules/users/components/UsersPage.tsx`, `Stockly-F/src/routes/index.tsx`, `Stockly-F/e2e/flows.spec.ts`
  - **Qué hacer:** vender en Stockly son dos pasos —crear la orden, que solo puede `ADMIN`, y enviarla, que puede el almacén—, y ninguno de los tres roles es el de quien atiende un mostrador. Dos piezas:
    - **Una venta de un paso**, `POST /sale-orders/counter`: comprueba lo disponible como `create` y descuenta el stock, congela el coste, escribe los movimientos y deja la orden enviada como el envío, **todo en una transacción**. Esa segunda mitad vive hoy dentro de `update` (`sale-orders.service.ts`): se extrae y la comparten las dos rutas, no se copia. Todas las líneas llevan `productId`, y **el precio sale del producto, no de la petición**. El aviso de stock bajo sale después del `commit`, como ahora, y la venta deja rastro con un valor propio en `AuditAction`.
    - **Un rol `SELLER`**, con su pantalla: el buscador y el escáner de `T6-02`, las cantidades con su disponible, un cliente opcional, los totales de `T6-05` y, al terminar, el número de `T6-04` y el comprobante de `T6-07`.
  - **Primero, la matriz**, como en `T5-13`. Propuesta: `SELLER` entra en `TODOS` —lee lo mismo que `USER`— y en un grupo nuevo, con `ADMIN`, para `POST /sale-orders/counter`. **No** crea ni edita órdenes pendientes —fijan un precio—, no envía las de otros —eso es de `ALMACEN`—, no cancela una venta hecha —devolver stock es una decisión comercial— y no ve usuarios, ajustes, auditoría ni exportaciones.
  - **Atención:** `ProtectedRoute` solo sabe exigir **un** rol y esta pantalla la abren dos: se guarda por permiso (`usePuede`), no por rol. El mapa `ROL` de `UsersPage.tsx` no compila hasta tener la entrada nueva, que es para lo que se escribió así. La ruta necesita su título (`titulos.ts`). Es una pantalla para usar de pie y con el móvil: se revisa a 393 px y no lleva `CLASES_TABLA` ([design-system.md](../../Stockly-F/docs/design-system.md)). Tras la migración del enum, `Stockly_test` se sincroniza con `db push` ([CONTEXTO.md §4](CONTEXTO.md)).
  - **Criterio de aceptación:** un `SELLER` registra una venta de dos productos y, sin más pasos, el stock ha bajado, hay dos movimientos `OUT`, la orden está enviada con su coste congelado y el comprobante se descarga; recibe **403** al crear una orden pendiente, al cancelar una venta y al cambiar un precio, y la interfaz no le ofrece ninguno de los tres botones; mandar un precio distinto del catálogo no cambia el de la línea; pedir más de lo disponible responde 409 y no mueve nada; dos ventas simultáneas de la última unidad dejan una hecha y otra rechazada. `permisos.test.ts` recorre el rol nuevo y hay escenario E2E.
  - **Esfuerzo:** alto
  - **Depende de:** T6-02 (cerrada), T6-07

- [ ] **[T6-09] Ventas por día y productos más vendidos en el panel**
  - **Área:** Informes
  - **Ubicación:** `src/modules/reports/reports.service.ts` (`getSummary`), `src/shared/lib/resumenSemanal.ts`, `src/contratos/api.ts` (`resumenReporteSchema`), `Stockly-F/src/modules/dashboard/components/DashboardPage.tsx`
  - **Qué hacer:** el panel es de inventario: productos, stock bajo, valor a coste. Las ventas están en Informes y **por mes**; no hay ninguna cifra de ventas por día. Añadir al panel las ventas enviadas de los últimos siete días del negocio —cuántas y por qué importe cada día, con los días sin ventas **a cero**, no ausentes— y los cinco productos más vendidos por unidades en esa ventana. La consulta de «lo más vendido» ya existe para el resumen semanal (`reunirDatosDelResumen`): se comparte, no se escribe otra.
  - **Atención:** agrupar por día es un `GROUP BY` sobre una expresión, justo lo que [rendimiento.md §5](rendimiento.md) pide mirar dos veces. La ventana son siete días y la acota el índice `(status, shippedAt)`, pero se comprueba con `EXPLAIN` sobre `Stockly_carga`, no se supone: lo que se añada a `getSummary` lo paga cada visita al panel. Los días son los de la zona del negocio (`hoyEn`) y los importes van en neto, como el resto de informes (`T6-05`). Los colores, de `var(--color-chart-N)`.
  - **Criterio de aceptación:** con ventas enviadas hoy y hace tres días, el gráfico tiene siete barras, dos con valor y cinco a cero; una venta enviada a las 23:30 del negocio cuenta en ese día y no en el siguiente; una venta pendiente o cancelada no cuenta; el `EXPLAIN` de las dos consultas sobre el conjunto de carga queda anotado en [rendimiento.md](rendimiento.md).
  - **Esfuerzo:** bajo
  - **Depende de:** —

- [ ] **[T6-10] Alta de usuarios por invitación**
  - **Área:** Usuarios / Autenticación
  - **Ubicación:** `src/modules/users/` (ruta nueva), `src/modules/auth/auth.service.ts` (`resetPassword`), `src/shared/lib/nodemailer.ts`, `src/shared/i18n/correos.es.ts` y `correos.en.ts`, `src/contratos/api.ts` (`PERMISOS`), `Stockly-F/src/modules/users/components/UsersPage.tsx`
  - **Qué hacer:** un administrador no puede dar de alta a nadie: la persona se registra sola en la página pública, confirma su correo y después alguien le cambia el rol. Añadir `POST /users`, solo de `ADMIN`, con nombre, correo y rol, que crea la cuenta y manda una **invitación con enlace** para que la persona ponga su contraseña. SistemaVenta genera una contraseña y la manda por correo; aquí ninguna contraseña viaja por correo. El enlace reutiliza el token de restablecimiento (`resetToken`, que ya se guarda hasheado) y la página de `reset-password`, con una caducidad propia: la hora de «olvidé mi contraseña» es poco para una invitación.
  - **Atención:**
    - **`login` exige `isVerified`** y `resetPassword` no lo toca: una cuenta invitada que pusiera su contraseña seguiría sin poder entrar. Quien abre el enlace ha demostrado que el buzón es suyo, que es lo mismo que demuestra el correo de verificación: poner la contraseña con un token válido debe verificar la cuenta. Eso cambia también el caso de quien se registró, no confirmó y restablece la contraseña: se decide a sabiendas y se cubre con un test.
    - `User.password` es obligatorio: la cuenta nace con el hash de un secreto aleatorio que nadie conoce, no con una cadena vacía.
    - El correo necesita **idioma** y de la persona invitada no se conoce ninguno: va el de la petición del administrador (`idiomaDePeticion`), que se corrige solo en su primer inicio de sesión.
    - El correo sale **fuera de la transacción** ([ADR 0004](adr/0004-correo-fuera-de-la-transaccion.md)). Sin SMTP la ruta responde 503, como las demás que envían, y lo comprueba **antes** de crear la cuenta: creada y sin correo, no se la podría volver a invitar. Si la invitación caduca, «olvidé mi contraseña» hace el mismo papel, así que no hace falta una ruta para reenviarla.
    - Sin ruta pública nueva, ni la lista de exenciones de CSRF ni los límites de `/auth` cambian. Deja rastro en la auditoría: `CREATE` sobre `User`, con el rol.
  - **Criterio de aceptación:** un `ADMIN` invita a una persona como `WAREHOUSE`; con el enlace del correo pone su contraseña y entra con ese rol, sin pasar por la verificación; el enlace no sirve dos veces ni después de caducar; invitar un correo ya registrado responde 409; un `USER` recibe 403; el registro público sigue creando solo `USER`.
  - **Esfuerzo:** medio
  - **Depende de:** —

### Tier 5 — las dos que quedan

*Las dos cambian dónde vive el stock, así que tocan casi todos los módulos, las pruebas de carga y
los informes. Se listan para que no hacerlas sea una decisión consciente. **Ninguna empieza sin un
caso de uso real escrito en su ficha.***

- [ ] **[T5-14] Varios almacenes**
  - **Área:** Negocio / Arquitectura
  - **Ubicación:** transversal, los dos repositorios
  - **Qué hacer:** `Product.stock` es un único número. Con varios almacenes pasa a una tabla `StockLevel(productId, warehouseId, stock)`, cada movimiento lleva su almacén y aparece un movimiento nuevo, la **transferencia**, que es una salida y una entrada en la misma transacción. Compras, ventas, conteos, alertas de mínimo (¿por almacén o globales?) y todos los informes cambian.
  - **Decisión previa:** si `Product.stock` se mantiene como suma desnormalizada (lecturas rápidas, riesgo de que diverja) o desaparece (una fuente de verdad, consultas más caras). Medirlo con el conjunto de 100 000 productos de [rendimiento.md](rendimiento.md) antes de decidir, no después, y dejarlo en un ADR.
  - **Criterio de aceptación:** una transferencia de 10 unidades no cambia el stock total y deja dos movimientos enlazados; la migración pone todo el stock actual en un almacén por defecto y el total no cambia; la prueba de carga no empeora más de lo que el ADR haya aceptado.
  - **Esfuerzo:** alto
  - **Depende de:** nada pendiente (T5-03, T5-04 y T5-07 ya están cerradas)

- [ ] **[T5-15] Lotes y fechas de caducidad**
  - **Área:** Negocio
  - **Ubicación:** transversal, los dos repositorios
  - **Qué hacer:** solo tiene sentido con producto perecedero o con trazabilidad obligatoria (alimentación, farmacia, cosmética). Lote con fecha de caducidad al recibir, salida **FEFO** (primero lo que caduca antes) al enviar, aviso de lotes próximos a caducar y ajuste de caducados como merma.
  - **Criterio de aceptación:** enviar una venta consume primero el lote que caduca antes; un lote caducado no se asigna a una venta; el informe de caducidades lista lo que vence en los próximos N días con su valor a coste.
  - **Esfuerzo:** alto
  - **Depende de:** decidir junto a T5-14: si se van a hacer las dos, el nivel de stock es `(producto, almacén, lote)` y conviene diseñarlo una sola vez.

### Sin tarea: lo que hay que decidir, no consultar

Cabos que quedaron escritos al cerrar otras tareas. Ninguno es un defecto pendiente; son
decisiones de producto o mediciones sin repetir, y por eso no tienen ficha.

| Qué | Dónde está el detalle |
|---|---|
| **El recorrido con lector de pantalla no se ha hecho** (T4-17). Vuelve a la lista si aparece una máquina con NVDA o VoiceOver | [accesibilidad.md §4](accesibilidad.md) |
| **El buscador de texto del catálogo no mira el SKU.** La búsqueda exacta por SKU o código de barras sí existe (`GET /products/lookup`) | [rendimiento.md §7](rendimiento.md) |
| **Un informe por periodo de un año tarda ~1.8 s.** Lo que lo cambia de escala es una tabla con las cifras ya sumadas por mes y producto, no `work_mem` | [rendimiento.md §10](rendimiento.md) |
| **El trozo `vendor` del frontend sigue por encima de 250 kB** (346 kB el 2026-10-05). Separar React lo empeora, medido | comentario de `manualChunks` en `Stockly-F/vite.config.ts` |
| **La fila de la tabla de productos mide 48 px**, no los 36 del perfil denso: bajar exige quitar el SKU o encoger la miniatura | [CONTEXTO.md §6](CONTEXTO.md) |
| **La clase ABC podría filtrar al abrir un conteo físico**; hoy solo filtra la categoría | — |
| **La carga sostenida no se ha repetido** con las consultas de margen, reposición, periodo y ABC del Tier 5 | [rendimiento.md §8–§11](rendimiento.md) |
| **Lo legal que falta antes de tener usuarios reales o de cobrar**: privacidad, plazos de conservación, condiciones, marca | [legal.md §2](legal.md) |

---

## Una tarea nueva

Una ficha lleva **área, ubicación, qué hacer, criterio de aceptación, esfuerzo y dependencias**,
como las de arriba, y va en «Tareas abiertas». Si depende de una decisión de producto, la
ficha la nombra («Decisión previa») y la tarea no empieza hasta que esté tomada y anotada.

**Una ficha es una pista, no una descripción verificada.** Siete de las cerradas describían mal su
propio problema —la causa, el alcance o el remedio—; están marcadas en la columna «Nota» del
índice. Medir antes de arreglar, y medir otra vez después.

Para cerrarse, toda tarea cumple lo que ya cumplen las del Tier 5:

- **Migración solo hacia adelante** ([operaciones.md §6](operaciones.md)): columnas nuevas anulables o con valor por defecto.
- **Contrato regenerado y spec derivado**: una respuesta nueva se declara en `src/contratos/api.ts`, no a mano en el frontend.
- **Textos en español e inglés** y **errores con código estable**, nunca solo con `message`.
- **Permisos en la matriz `PERMISOS`**, no en una lista de roles junto a la ruta.
- **Auditoría:** una acción que cambia stock, costes o permisos añade su valor a `AuditAction` y deja rastro.
- **Estado con icono, no solo con color**, en las dos paletas.
- **Todo lo que mueve stock ocurre en una transacción** y con decremento condicional. Un flujo nuevo que toca inventario lleva **escenario E2E**.
- **`pnpm verify` en verde en los dos repositorios**, con los tests nuevos **falsificados**: se rompe a propósito lo que protegen y se comprueba que caen.

---

## Tareas cerradas

El índice. La ficha entera de cada una —con lo que se verificó y cómo— está en el
[histórico](historico/ROADMAP-2026-10-05.md), buscando por su identificador. Una tarea que se
cierre a partir de ahora añade aquí su fila; lo medido va en la nota y en el commit.

### Tier 0

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T0-01 | Resolver los alias `@/` en el JavaScript compilado | 2026-08-04 |  |
| T0-02 | Reparar la imagen Docker — cinco fallos independientes | 2026-08-04 |  |
| T0-03 | Reponer el stock al cancelar una orden de venta ya enviada | 2026-08-04 |  |
| T0-04 | Descontar el stock al cancelar una orden de compra ya recibida | 2026-08-04 |  |
| T0-05 | Tests de integración para las cancelaciones con efecto sobre el stock | 2026-08-04 |  |
| T0-06 | Eliminar la credencial personal versionada en el test E2E | 2026-08-04 |  |
| T0-07 | Revocar las sesiones activas al restablecer la contraseña | 2026-08-04 |  |
| T0-08 | Test de regresión de la revocación de sesiones tras reset | 2026-08-04 |  |

### Tier 1

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T1-01 | Guion de verificación local del backend | 2026-08-07 |  |
| T1-02 | Guion de verificación local del frontend | 2026-08-07 |  |
| T1-03 | Declarar `tagIds` en los esquemas de validación de producto | 2026-08-07 |  |
| T1-04 | Tests de asignación de etiquetas a productos | 2026-08-07 |  |
| T1-05 | Alinear el payload de `PATCH /settings` con el contrato del backend | 2026-08-07 |  |
| T1-06 | Corregir el tipo de `SettingEntry.value` en el frontend | 2026-08-07 |  |
| T1-07 | Añadir validación Zod al endpoint de configuración | 2026-08-07 |  |
| T1-08 | Eliminar el efecto de sincronización de `SettingsPage` | 2026-08-07 |  |
| T1-09 | Dejar `pnpm lint` en verde | 2026-08-07 |  |
| T1-10 | Corregir el `setState` en efecto de `App.tsx` y `ProductForm.tsx` | 2026-08-07 |  |
| T1-11 | Comprobar `isActive` en `requireAuth` | 2026-08-07 |  |
| T1-12 | Comprobar `isActive` también en el endpoint de refresh | 2026-08-07 |  |
| T1-13 | Centralizar `getActorEmail` y eliminar la consulta redundante | 2026-08-07 |  |
| T1-14 | Vincular los mensajes de error de formulario a sus campos | 2026-08-07 |  |
| T1-15 | Añadir los índices ausentes en la base de datos | 2026-08-07 |  |
| T1-16 | Sanear los parámetros de paginación para eliminar los 500 | 2026-08-07 |  |
| T1-17 | Reinicializar el formulario al editar una etiqueta | 2026-08-07 |  |
| T1-18 | Guardia de rol en las rutas de administración del frontend | 2026-08-07 |  |
| T1-19 | Sustituir la exención CSRF por prefijo por una lista explícita | 2026-08-07 |  |
| T1-20 | Exigir TLS en el transporte SMTP | 2026-08-07 |  |
| T1-21 | Ejecutar el contenedor con un usuario sin privilegios | 2026-08-07 | Verificada por ejecución el 2026-08-09 |
| T1-22 | Retirar la promoción automática a ADMIN del primer usuario | 2026-08-07 |  |
| T1-23 | Ampliar el smoke E2E a los flujos que estaban rotos | 2026-08-07 |  |
| T1-24 | Hacer reproducible la ejecución del E2E | 2026-08-07 |  |
| T1-25 | Corregir las rutas de API y el stack en los READMEs | 2026-08-07 |  |
| T1-26 | Resolver la contradicción sobre las variables de entorno obligatorias | 2026-08-07 |  |

### Tier 2

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T2-01 | Middleware 404 con respuesta JSON | 2026-08-09 |  |
| T2-02 | Bajar a SQL los agregados del resumen de reportes | 2026-08-09 |  |
| T2-03 | Paginar el listado de órdenes de compra en el backend | 2026-08-07 |  |
| T2-04 | Adaptar el frontend a la respuesta paginada de órdenes de compra | 2026-08-07 |  |
| T2-05 | Exportaciones por lotes y en streaming | 2026-08-09 |  |
| T2-06 | Reducir el chunk `vendor` del frontend | 2026-08-09 | Criterio cumplido a medias: `vendor` sigue por encima de 250 kB |
| T2-07 | No bloquear la respuesta HTTP con el envío de alertas | 2026-08-08 |  |
| T2-08 | Ajustar el lote de importación masiva al tamaño del pool | 2026-08-09 |  |
| T2-09 | Índice trigram para la búsqueda por nombre | 2026-08-09 |  |
| T2-10 | Logging estructurado con correlación de peticiones | 2026-08-08 |  |
| T2-11 | Enlace para saltar al contenido principal | 2026-08-08 |  |
| T2-12 | Respetar `prefers-reduced-motion` | 2026-08-09 |  |
| T2-13 | Nombres accesibles en la página de etiquetas | 2026-08-09 |  |
| T2-14 | Eliminar el anidamiento `<Link><Button>` de la tabla de productos | 2026-08-09 |  |
| T2-15 | Nombre accesible en las casillas de selección de fila | 2026-08-09 |  |
| T2-16 | Atributos ARIA y cierre con Escape en los menús de navegación | 2026-08-09 |  |
| T2-17 | Exponer el estado de los conmutadores de etiqueta del formulario de producto | 2026-08-07 |  |
| T2-18 | Gestión de foco y anuncio al cambiar de ruta | 2026-08-09 |  |
| T2-19 | Tests de las páginas de órdenes de venta y compra | 2026-08-09 |  |
| T2-20 | Tests de la página de gestión de usuarios | 2026-08-09 |  |
| T2-21 | Tests del dashboard y la página de reportes | 2026-08-09 |  |
| T2-22 | Umbrales de cobertura en ambos repositorios | 2026-08-09 |  |
| T2-23 | Cubrir las zonas de baja cobertura del backend | 2026-08-09 |  |
| T2-24 | Tests de contrato entre frontend y backend | 2026-08-09 |  |
| T2-25 | Healthcheck de aplicación y sonda de readiness | 2026-08-09 |  |
| T2-26 | Verificar la reproducibilidad del build de la imagen | 2026-08-09 |  |
| T2-27 | Externalizar las credenciales de PostgreSQL del compose | 2026-08-09 |  |
| T2-28 | Contenedorizar el frontend y añadirlo al compose | 2026-08-09 |  |
| T2-29 | Corregir el esquema `Product` de Swagger | 2026-08-07 |  |
| T2-30 | Documentar en Swagger los módulos ausentes | 2026-08-09 |  |
| T2-31 | Detección de reuso de refresh tokens | 2026-08-09 |  |
| T2-32 | Validar las imágenes por sus magic bytes | 2026-08-09 |  |
| T2-33 | Limitar el tamaño del cuerpo por ruta | 2026-08-09 |  |
| T2-34 | Descargar el CSV de movimientos vía axios y con codificación correcta | 2026-08-09 |  |
| T2-35 | Definir la capa de tokens semánticos en `@theme` | 2026-08-07 |  |
| T2-36 | Migrar `Button` y `Badge` a variantes semánticas | 2026-08-07 |  |
| T2-37 | Erradicar las utilidades de color crudas del resto de la interfaz | 2026-08-07 |  |
| T2-38 | Comunicar el estado con icono además de color | 2026-08-08 |  |
| T2-39 | Cifras tabulares en las columnas numéricas | 2026-08-08 |  |
| T2-40 | Densidad de tabla en escritorio y mínimo táctil en móvil | 2026-08-08 | Mínimo táctil, sí; la fila de 36 px, no: se quedó en 48 |
| T2-41 | Escala tipográfica explícita y recorte de pesos de Inter | 2026-08-08 |  |
| T2-42 | Permitir cancelar desde la interfaz una orden de venta ya enviada | 2026-08-08 |  |
| T2-43 | Índice por `createdAt` en `products` y revisión de `products_isActive_idx` | 2026-08-09 |  |
| T2-44 | Un único formato de importe en toda la interfaz | 2026-08-09 |  |
| T2-45 | Contener los scrollers horizontales para que no ensanchen el viewport en móvil | 2026-08-08 |  |
| T2-46 | Delimitar los ítems de los menús desplegables y separarlos entre sí | 2026-08-09 |  |
| T2-47 | La cabecera de la tabla de productos no debe partirse | 2026-08-09 |  |
| T2-48 | Volver al principio de la página al cambiar de ruta | 2026-08-09 |  |

### Tier 3

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T3-01 | Traducir los comentarios y el mensaje de error en inglés | 2026-08-10 |  |
| T3-02 | Convertir `User.role` y los campos de `AuditLog` a enums de Prisma | 2026-08-10 |  |
| T3-03 | Unificar el estilo de exportación del módulo de productos | 2026-08-10 | Ficha equivocada: eran cinco módulos, no uno |
| T3-04 | Simplificar el intercalado de enlaces de la navegación | 2026-08-10 |  |
| T3-05 | Unificar las cabeceras de exportación CSV entre repos | 2026-08-10 | Ficha equivocada: el botón nunca tuvo dos rutas |
| T3-06 | Decidir explícitamente sobre `.agents/skills/` en el control de versiones | 2026-08-10 |  |
| T3-07 | Limpiar los artefactos de build antes de compilar | 2026-08-04 | Resuelta como efecto de T0-01 |
| T3-08 | Marcar los iconos decorativos con `aria-hidden` | 2026-08-10 | Premisa falsa: Heroicons ya emitía `aria-hidden` |
| T3-09 | Evitar que el botón flotante tape la paginación en móvil | 2026-08-10 | Se quedaba corta: la paginación quedaba sin poder pulsarse |
| T3-10 | Añadir CHANGELOG y guía de contribución | 2026-08-10 |  |
| T3-11 | Registrar las decisiones de arquitectura como ADRs | 2026-08-10 |  |
| T3-12 | Declarar explícitamente que la aplicación no debe indexarse | 2026-08-10 |  |
| T3-13 | Asegurar `NODE_ENV=production` en entornos desplegados | 2026-08-10 |  |
| T3-14 | Unificar la escala de radios y sombras | 2026-08-10 |  |
| T3-15 | Documentar el sistema de diseño | 2026-08-10 |  |

### Tier 4

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T4-01 | Paquete compartido de contratos entre repositorios | 2026-08-10 | Se resolvió copiando el archivo, no con un paquete (ADR 0006) |
| T4-02 | Generar el OpenAPI desde los esquemas Zod | 2026-08-10 | Sin `zod-to-openapi`: lo hace Zod 4 |
| T4-03 | Modo oscuro | 2026-08-10 |  |
| T4-04 | Internacionalización | 2026-08-11 | Motor propio, sin `i18next` (ADR 0007) |
| T4-05 | Documentar la estrategia de backup y rollback | 2026-08-11 |  |
| T4-06 | Monitorización y alertas | 2026-08-11 |  |
| T4-07 | Auditoría de dependencias y licencias | 2026-08-11 |  |
| T4-08 | Pruebas de carga sobre los flujos de inventario | 2026-08-11 |  |
| T4-09 | Auditoría de navegador y de lector de pantalla | 2026-08-11 | Sin lector de pantalla: de ahí salió T4-17 |
| T4-10 | Navegación lateral en pantallas anchas | 2026-08-12 |  |
| T4-11 | Selector de tema en Configuración: claro, oscuro o automático | 2026-08-10 |  |
| T4-12 | Los correos siguen saliendo solo en español | 2026-08-12 |  |
| T4-13 | La versión de PostgreSQL no coincide entre el desarrollo y el compose | 2026-08-12 |  |
| T4-14 | El CLI de Prisma infla el árbol de producción | 2026-08-12 | La causa era otra: un *peer* opcional de `@prisma/client` |
| T4-15 | `GET /products/:id/movements` devuelve el histórico entero | 2026-08-12 | El alcance era mayor: la exportación tampoco iba por lotes |
| T4-16 | El dashboard a escala: `work_mem` y la consulta de rotación | 2026-08-12 | El remedio era otro: reescribir la consulta, no `work_mem` |
| T4-17 | Recorrido real con lector de pantalla | 2026-08-12 | **Descartada, no hecha** |

### Tier 5

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T5-01 | Coste del producto y coste medio ponderado | 2026-09-13 |  |
| T5-02 | Valor del inventario a coste y margen en los informes | 2026-09-13 |  |
| T5-03 | Stock comprometido y stock disponible | 2026-09-13 |  |
| T5-04 | Recepción parcial de órdenes de compra | 2026-09-13 |  |
| T5-05 | Plazo de entrega del proveedor y sugerencias de reposición | 2026-09-28 |  |
| T5-06 | Clientes como entidad | 2026-09-30 |  |
| T5-07 | Conteo físico de inventario | 2026-09-29 |  |
| T5-08 | Código de barras: búsqueda, escaneo y etiquetas | 2026-09-29 |  |
| T5-09 | Informes de ventas y compras por periodo | 2026-09-28 | Criterio del `EXPLAIN` relajado a «un mes» |
| T5-10 | Clasificación ABC de productos | 2026-09-29 |  |
| T5-11 | Resumen periódico por correo | 2026-10-01 |  |
| T5-12 | Notificaciones dentro de la aplicación | 2026-10-01 |  |
| T5-13 | Rol de almacén | 2026-09-29 |  |

### Tier 6

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T6-01 | La pantalla de ventas solo enseñaba las diez órdenes más recientes | 2026-10-05 | Índice nuevo por `createdAt`, decidido midiendo: sobre 330 000 órdenes el listado sin filtro pasa de 33 ms a 0,01 ms ([rendimiento.md §13](rendimiento.md)). El criterio de aceptación, comprobado en tests de los dos repositorios —falsificados: diez roturas, diez caídas— y en navegador con 26 órdenes, en escritorio y móvil. **La ficha se quedaba corta en una cosa:** el filtro nuevo metió un «Cancelado» oculto en la página y rompió un selector del E2E de `T0-03`, que ahora mira la insignia de su orden |
| T6-02 | El formulario de venta solo dejaba elegir los cien productos más recientes | 2026-10-06 | El desplegable se sustituye por `BuscadorDeProducto`, que consulta `GET /products?search=&isActive=true&limit=8` mientras se escribe, y un botón de escáner en los dos formularios; **el backend no se tocó**. El defecto, medido contra el servidor con 197 productos activos: `?limit=200&isActive=true` devuelve 100 y **no** trae el más antiguo; el buscador lo encuentra por su nombre, se vende y su stock baja de 10 a 7, en escritorio y a 393 px. El resto del criterio, en el escenario E2E nuevo (27 pasados en los dos proyectos) y en 14 tests de componente, falsificados: catorce roturas, catorce caídas. **La ficha no decía tres cosas:** que repetir un código suma una unidad a su línea en vez de abrir otra —decidido al hacerlo—; que la lista, dentro de un diálogo con scroll propio, quedaba cortada en la última línea con una sola opción a la vista —visto en una captura, no en un test: ahora se desplaza a la vista—; y que volver a «Escribir manualmente» no soltaba el `productId` del producto elegido antes —leído en el código, no reproducido—. Al cerrar, las dos puertas estaban en rojo por avisos ajenos (`proxy-addr`, `source-map-js`): [dependencias.md §2](dependencias.md) |
