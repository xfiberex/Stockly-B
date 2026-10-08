# Aspectos legales: qué está cubierto y qué no

**Fecha:** 2026-09-30, tras pasar a la AGPL v3 ([ADR 0009](adr/0009-licencia-agpl.md)).

Esto es una **revisión técnica, no asesoramiento jurídico**. Dice qué hace el código y qué
falta alrededor de él; antes de ofrecer Stockly a usuarios reales, y sobre todo antes de
cobrar por él, lo que aquí aparece como pendiente tiene que revisarlo un profesional.

---

## 1. Cubierto

| | Dónde |
|---|---|
| **Licencia del proyecto:** AGPL-3.0-only, con el texto oficial y el copyright a nombre del autor | `LICENSE` y `package.json` de los dos repositorios, sección «Licencia» de los README |
| **Cláusula 13 de la AGPL:** quien usa la aplicación por la red puede llegar al código | «Perfil → Acerca de Stockly» (`Stockly-F/src/shared/lib/codigoFuente.ts`) y la especificación de Swagger |
| **Licencias de las dependencias,** todas compatibles con la AGPL v3 | [dependencias.md §3](dependencias.md), con puerta automática en cada `pnpm verify` |
| **Avisos de terceros del frontend,** incluidos la tipografía Inter (OFL-1.1) y el lector ZXing del `.wasm` (Apache-2.0) | `Stockly-F/public/AVISOS-DE-TERCEROS.txt`, generado por `scripts/auditoria.js --informe` |
| **Código publicado antes del 2026-09-30:** sigue siendo MIT para quien lo tenga, y no se puede revocar | README y ADR 0009 |
| **Doble licencia:** posible mientras el autor sea el único titular | ADR 0009 y [CONTRIBUTING](../CONTRIBUTING.md#licencia-de-las-contribuciones) |

---

## 2. No cubierto

### 2.1 Protección de datos personales

**Es lo más importante de esta lista, y la licencia no dice nada de ello.** El RGPD —o la ley
equivalente del país donde se use— obliga a **quien opera el despliegue**, que es el
responsable del tratamiento: si Stockly lo monta el autor para sus clientes, es el autor; si lo
monta una empresa con el código, es esa empresa.

**Qué datos personales guarda Stockly** (medido sobre `prisma/schema.prisma` y el código):

| Dato | Dónde | Observaciones |
|---|---|---|
| Nombre, correo, idioma y hash de la contraseña de cada usuario | `users` | Un usuario **no se borra**: solo se desactiva (`PATCH /users/:id/deactivate`) |
| Correo de quien hizo cada operación | `audit_logs.userEmail`, `inventory_counts.createdByEmail` / `closedByEmail`, `inventory_count_lines.countedByEmail`, `sale_orders.createdByEmail` (T6-06) | Se guardan como texto y no como clave foránea **a propósito**, para que el registro sobreviva al usuario. Nada los purga |
| Nombre, correo, teléfono, **documento de identidad o fiscal** y notas de cada cliente | `customers` (T5-06; `document`, T6-06) | Se crea al darlo de alta o al vender con un correo nuevo. **Se puede borrar**, pero sus órdenes conservan la instantánea de la fila siguiente |
| Nombre, correo, teléfono y **documento** del cliente de un pedido de venta | `sale_orders.customerName` / `customerEmail` / `customerPhone` / `customerDocument` (T6-06) | Opcionales. Pueden ser de una persona física. Es la instantánea de a quién se vendió: no cambia al editar ni al borrar el cliente |
| **El documento del cliente (T6-06), en particular** | Las dos filas de arriba | Cédula, NIF o equivalente: en una persona física es un **identificador nacional**, que varias leyes tratan con más cuidado que un correo. Es opcional y texto libre; lo lee todo el que lee ventas o clientes, sale en la exportación de ventas —solo `ADMIN`— y saldrá en el comprobante (T6-07). Borrar el cliente **no** lo borra de sus órdenes: atender una petición de supresión exige además vaciar `customerDocument` en ellas, que hoy se hace orden a orden con `PATCH /sale-orders/:id` |
| **El comprobante de venta (T6-07)** | No se guarda: se genera en cada descarga (`GET /sale-orders/:id/receipt`) | Un PDF con el nombre, el documento, el correo y el teléfono del cliente, y el **correo de quien registró la venta**, además de los datos del negocio. Lo descarga cualquier usuario con sesión, y está hecho para **entregarse a quien compra**: a partir de ahí es un papel fuera de la aplicación, que ni se corrige ni se borra desde ella. Vaciar el documento de una orden (`PATCH`) cambia los comprobantes que se descarguen después, no los ya entregados. El correo del empleado en un papel que sale del negocio es una decisión del negocio: si no se quiere, hoy no hay ajuste para quitarlo |
| Correo y teléfono de proveedores | `suppliers` | Suelen ser de empresas, pero pueden ser de una persona |
| Nombre, documento fiscal, dirección, teléfono y correo **del negocio** | `app_settings`, claves `business*` (T6-03) | Son de una empresa, salvo que el negocio sea de un autónomo: entonces su nombre, su documento y su domicilio son datos personales suyos. Los lee **cualquier usuario con sesión** (`GET /settings/business`), porque encabezan el comprobante de venta. Se borran vaciando el campo |
| A qué administradores se envió cada resumen semanal | `weekly_digests.sentToUserIds` (T5-11) | Solo el identificador del usuario, no su correo. El resumen que reciben no lleva nombres de clientes |
| Qué avisos tiene cada usuario y cuándo los leyó | `notifications` (T5-12) | Del usuario solo el identificador; del asunto, nombres de productos y proveedores, **no de clientes**: la venta se cita por su número. Los leídos se borran a los 90 días |
| IP y cabeceras (entre ellas el *user-agent*) de cada petición | Registros de `pino-http` en producción | `authorization`, `cookie` y `set-cookie` se ocultan; la IP no. Dónde y cuánto tiempo se guarden depende de la plataforma de despliegue |
| Todo lo anterior, en copia | Copias de seguridad, **14 días** y nunca menos de 3 | [operaciones.md](operaciones.md) |

**Terceros que reciben datos** (encargados del tratamiento), según lo que se configure:

- **Proveedor SMTP:** recibe el nombre y el correo de los destinatarios de cada correo.
- **Cloudinary:** recibe las imágenes de producto y, desde T6-03, el logo del negocio. En
  principio no son datos personales, salvo que alguien suba una foto con personas. Quitar el
  logo lo borra también de allí. Desde T6-07 el servidor **descarga** el logo de Cloudinary cada
  vez que hace un comprobante: es una petición de lectura, que no envía ningún dato de la venta.
- **El alojamiento** de la base de datos, el servidor y los registros.

**Cookies.** La aplicación pone tres: `token`, `refreshToken` y la de CSRF, todas de sesión y
seguridad. No hay analítica ni publicidad. Las cookies estrictamente necesarias suelen estar
exentas de consentimiento, pero **debe confirmarlo un profesional** para el país del despliegue.

**Qué falta:**

- [ ] **Política de privacidad**, enlazada desde el registro y desde «Acerca de Stockly».
- [ ] **Base legal** de cada tratamiento (contrato con el cliente, interés legítimo en la
  auditoría…) y **registro de actividades** si la ley lo exige.
- [ ] **Plazos de conservación** de `audit_logs`, de los correos guardados en conteos y pedidos,
  y de los registros de peticiones. Hoy son indefinidos.
- [ ] **Derechos de los interesados.** No hay un procedimiento para exportar, corregir o
  **borrar o anonimizar** los datos de una persona concreta: desactivar un usuario no los
  borra, y su correo sigue en la auditoría. Desde T5-06 los datos de un **cliente** viven en un
  sitio (`customers`) y se corrigen o se borran desde su ficha, pero borrarlo deja su nombre,
  su correo y su teléfono en la instantánea de cada orden.
- [ ] **Contratos de encargo del tratamiento** con el proveedor SMTP, Cloudinary y el
  alojamiento. Los grandes proveedores los ofrecen como parte de sus condiciones.
- [ ] **Procedimiento ante una brecha de seguridad:** a quién se avisa y en qué plazo (72 horas
  en el RGPD).

### 2.2 Condiciones del servicio

La AGPL excluye la garantía y limita la responsabilidad **sobre el software** (secciones 15 y
16). **No regula la relación con quien paga por usarlo**: si Stockly se ofrece como servicio,
hacen falta condiciones propias (disponibilidad, soporte, qué pasa con los datos al darse de
baja, precio, ley aplicable).

- [ ] Términos y condiciones del servicio, si se comercializa.

### 2.3 El nombre «Stockly»

No se ha comprobado si es una marca registrada. Hay varios productos de inventario con nombres
parecidos, y una marca ajena puede obligar a cambiar el nombre después de haber invertido en él.

- [ ] Buscar el nombre en los registros de marcas del mercado donde se venda (en España, la
  OEPM; en la UE, la EUIPO) antes de comercializarlo.

### 2.4 Contribuciones externas

Mientras el autor sea el único titular puede vender licencias comerciales. **La primera
contribución externa aceptada sin un acuerdo de cesión (CLA) cierra esa puerta** para esa parte
del código.

- [ ] Si la doble licencia sigue en los planes, redactar el CLA **antes** de aceptar la primera
  contribución.

### 2.5 Aviso de terceros del backend (opcional)

El backend no genera un archivo de avisos como el del frontend. La obligación se cumple igual:
cada paquete lleva su licencia dentro de `node_modules`, que viaja en la imagen de Docker. Un
archivo único solo facilitaría la revisión a quien reciba la imagen.

- [ ] Opcional: generar `AVISOS-DE-TERCEROS.txt` en el backend con el mismo
  `scripts/auditoria.js --informe`.

---

## 3. Cuándo revisar este documento

- **Antes del primer despliegue con usuarios reales:** §2.1 entera.
- **Antes de cobrar:** §2.2 y §2.3.
- **Antes de aceptar la primera contribución externa:** §2.4.
- **Al añadir un dato personal nuevo** a `schema.prisma`, un proveedor externo o una cookie:
  actualizar las tablas de §2.1.
