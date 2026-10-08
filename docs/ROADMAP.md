# ROADMAP — Stockly

La fuente de verdad del **trabajo pendiente** de los dos repositorios. Cada tarea tiene un
identificador `T{tier}-{nº}` que se cita en commits y documentos:
`fix(T0-01): resolver alias de rutas en el build de producción`.

> **Estado al 2026-10-08: 134 de 139 cerradas.** Quedan tres del Tier 6, abierto el 2026-10-05,
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
| **6** | Venta de mostrador y documento de venta: lo que SistemaVenta hace y Stockly no | 7 / 10 |
| | **Total** | **134 / 139** |

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
grep -c '^- \[ \] \*\*\[T' docs/ROADMAP.md    # abiertas: 5
grep -c '^| T[0-9]-[0-9]* |' docs/ROADMAP.md  # cerradas: 134
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

**Orden.** `T6-01` y `T6-02` corregían defectos, iban primero y están cerradas, como las cinco siguientes, de `T6-03` a `T6-07`. `T6-08` necesita `T6-07` y el buscador y el escáner de `T6-02`. `T6-09` y `T6-10` son
independientes del resto.

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
  - **Depende de:** T6-02 y T6-07 (cerradas)

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
| T6-03 | Datos del negocio y moneda configurable | 2026-10-07 | **Decisión previa, tomada el 2026-10-07:** símbolo libre de 1 a 5 caracteres y formato numérico fijo, como recomendaba la ficha. Seis ajustes nuevos, `GET /settings/business` para cualquier rol y `PUT`/`DELETE /settings/logo`; sin migración. El formato pasa a ser uno solo, `escribirImporte`, en el contrato. El criterio, de punta a punta en `moneda.test.ts` —el ajuste en la base, la petición y lo que PDFKit escribe—: con `RD$`, los dos PDF de informes, las etiquetas y el resumen semanal no dejan ni un `$` suelto; un `USER` lee la moneda y recibe 403 en `GET /settings`; sin nada guardado todo sale como antes. En el frontend, el símbolo se espera en `ProtectedRoute`: el primer importe de una pantalla ya sale con la moneda buena (`monedaDelNegocio.test.tsx`). En navegador, a 1280 px, Reportes entero en `RD$`, ejes incluidos; y un logo de 800×400 subido de verdad a Cloudinary volvió como PNG de 600×300. **La ficha no decía cuatro cosas:** que «libre» tiene un límite que pone el PDF —la Helvetica de PDFKit dibuja `₡ ₲ ₱ ₹ ₩ ₺ ₽` con ancho 0, medido—, así que el validador solo admite lo que se imprime y un test mide cada carácter contra la fuente; que los dos formateadores no coincidían —un negativo salía `$-1,234.50` en el PDF y `-$1,234.50` en pantalla—; que la URL del logo no puede ser un ajuste del catálogo, porque `T6-07` la va a pedir desde el servidor y un `PATCH` la apuntaría a cualquier sitio; y que convertir el logo a PNG al subirlo le quita a `T6-07` la mitad de su «Atención». Y una quinta, que salió al repasar lo que quedaba sin comprobar: **multer respondía 500** a una imagen de más de 2 MB, a un tipo no admitido y a un archivo en otro campo, también en productos; ahora son 413 `IMAGE_TOO_LARGE`, 422 y 400, con código. Tests falsificados en total: 63 roturas, 63 caídas. Escenario E2E nuevo, en los dos proyectos (29 pasados, 1 omitido): la tarjeta cabe a 393 px, el nombre se guarda y lo lee el almacén, y con `RD$` Reportes no deja un `$`. **En ese escenario la moneda no se guarda de verdad:** se cambia lo que la página recibe de `GET /settings/business`, porque el símbolo es de toda la instalación y los escenarios de al lado comprueban importes en `$`; la mitad del servidor la prueba `moneda.test.ts`. El logo quitado desapareció de la cuenta (404 por la API de administración); la CDN lo siguió sirviendo unos minutos |
| T6-04 | Número correlativo de venta | 2026-10-07 | Cada venta lleva `number`, un entero consecutivo que se enseña con seis cifras (`#000123`): en la lista, la ficha del cliente, la nota de los movimientos, el aviso de venta sin stock, el resumen semanal y la exportación (columna `orderNumber`, además de `orderId`). Sale de **una fila de `counters`** —tabla nueva, por clave, para que un número fiscal sea otra fila— que se incrementa con un `INSERT … ON CONFLICT DO UPDATE` dentro de la transacción que crea la orden (`siguienteNumeroDeVenta`); no es una secuencia. Si la fila falta —la base de tests, que se levanta sin migraciones— arranca en la última orden. `GET /sale-orders?number=` busca exacto (`123` y `000123` son la misma) y responde 400 a lo que no son dígitos; la pantalla lo pide al dejar de teclear y acepta el número pegado con su `#`. La migración numera por `createdAt` e `id` y deja el contador en la última; las notas y los avisos ya escritos no se tocan, y un aviso sin `orderNumber` se sigue leyendo por el principio de su id. **El criterio, comprobado:** veinte ventas a la vez, veinte números consecutivos —también cuando compiten por crear el contador—; un 409 no gasta número, y tampoco uno tomado en una transacción que se deshace después; la migración, ejecutando su propio SQL en un test y sobre la base de desarrollo real (16 órdenes: 1 a 16 en orden de fecha, contador en 16); buscar `12` trae solo la `#000012`. Falsificado: 29 roturas, 29 caídas —entre ellas tomar el número fuera de la transacción y el «leer el último y sumar uno» de SistemaVenta—. E2E: la venta se busca por su número en los dos proyectos, y el seed numera sus órdenes por fecha. Vista la pantalla a 1280 y a 393 px. **Sin comprobar:** el resumen semanal y la exportación solo en tests, no abriendo el correo ni el CSV en Excel —que quitará los ceros de `orderNumber` al leerlo como número—. **A saber:** las ventas se crean de una en una mientras dura la transacción de cada una; es el precio de una serie sin huecos por rechazo. |
| T6-05 | Impuesto en la venta | 2026-10-07 | Dos ajustes nuevos en los datos del negocio: `taxRate` —de 0 a 100, dos decimales como mucho, **0 por defecto**— y `taxName`, que viaja en `GET /settings/business`. Al crear la orden la tasa se congela en cada línea (`sale_order_items.taxRate`, anulable: las líneas anteriores se quedan en `NULL`, que se lee «sin impuesto»). `subtotal`, `tax` y `total` —de la orden y de cada línea— **no se guardan**: los calcula `conTotales` al responder, con `Decimal`, y la interfaz deja de sumar. **El redondeo, decidido una vez** (`totalesDeLinea`): por línea, a dos decimales, medio céntimo hacia arriba; el impuesto de la orden es la suma del de sus líneas. `unitPrice` sigue sin impuesto, así que informes, ficha del cliente —que enseña el subtotal— y resumen semanal siguen en neto sin tocarlos. La exportación conserva `totalLine` sin impuesto y añade `taxRate`, `taxLine` y `totalLineWithTax`. **El criterio, comprobado:** 3 × 100,00 al 18 % da 300,00 / 54,00 / 354,00; el margen de `/reports` es idéntico con la tasa a 0 y al 18 %; subir al 20 % no altera la orden; totales o tasa enviados en el cuerpo se descartan; con la tasa a 0 el pie de la venta es el de siempre. Falsificado: 32 roturas, 31 caídas; la que pasa —leer la tasa del cuerpo— es equivalente, porque el validador ya la descarta antes. Un test se reforzó al falsificar: el de coma flotante no distinguía `number` de `Decimal`. E2E, solo en `chromium` porque la tasa es global: la venta nace al 18 %, la tasa pasa por el 20 % y vuelve a 0, y la pantalla sigue diciendo «ITBIS (18 %)». Vista la venta y el ajuste a 1280 y a 393 px. **Sin comprobar:** el CSV abierto en Excel. **A saber:** en el móvil el pie de importes queda dentro del desplazamiento horizontal de la tabla de líneas, como ya quedaba el total; el nombre del impuesto no se congela con la orden —si se renombra, las ventas antiguas enseñan el nombre nuevo con su tasa de entonces—; y el formulario de nueva venta no enseña el impuesto antes de guardar, porque calcularlo ahí sería volver a sumar en el navegador: lo necesitará el mostrador de `T6-08`. |
| T6-06 | Vendedor y documento del cliente en la venta | 2026-10-08 | Tres columnas nuevas, anulables: `customers.document`, `sale_orders.customerDocument` y `sale_orders.createdByEmail`. **Quién la registró** lo pone el servidor con el correo de la sesión, como texto; no viene en la petición y el `PATCH` no lo toca: quien edita, envía o cancela no pasa a ser quien vendió. **El documento** es texto libre de hasta 40 caracteres, sin caracteres de control —acaba en el comprobante de `T6-07`—; la venta copia el del cliente elegido si no trae uno propio, y el cliente que una venta crea por su correo nace con él. No es único y **no vincula**: una venta con documento y sin correo no va a ningún cliente. `GET /customers?search=` lo busca también. La exportación de ventas añade `customerDocument` y `createdByEmail`. **La migración** recupera el vendedor de la fila `CREATE` de `audit_logs` —la más antigua con correo— y avisa con un `RAISE NOTICE` de cuántas órdenes se quedan sin él. Sobre la base de desarrollo: 9 órdenes, 3 recuperadas —las creadas por la API, las tres coinciden con la auditoría— y 6 sin vendedor, que son las del seed; el seed ya las siembra con vendedor. **El criterio, comprobado:** la orden sigue diciendo quién la registró con la cuenta desactivada y también borrada; elegir un cliente copia su documento, editarlo después no cambia la orden y borrarlo deja el documento en la instantánea; `legal.md §2.1` recoge los dos datos. Falsificado: 32 roturas, 31 caídas; la que pasa —tomar el vendedor del cuerpo— es equivalente, porque el validador descarta el campo antes. Un test se reforzó al falsificar: el de la migración no distinguía una fila de auditoría sin correo. E2E, en los dos proyectos, dentro del escenario de `T5-06`: el documento escrito en una venta crea el cliente con él, la siguiente lo trae al elegirlo, el detalle dice «Registrada por» y la lista de clientes lo encuentra por su documento. Vistas la venta, su formulario y el del cliente a 1280 y a 393 px. **Sin comprobar:** el aviso de la migración solo se ve en el registro de PostgreSQL —`prisma migrate deploy` no lo enseña—; el recuento de arriba se sacó con una consulta. **A saber:** el correo de quien vendió lo lee todo el que lee ventas, `USER` incluido, que es lo que pedía la ficha; borrar un cliente no borra su documento de sus órdenes, y `legal.md` dice cómo se atiende una petición de supresión; y el E2E falló dos veces de cuatro al relanzarlo sin pausa tras otra pasada —esperas agotadas y un `ECONNRESET` en escenarios que no tocan ventas— y pasó limpio las dos veces que se esperó unos segundos: [CONTEXTO.md §4](CONTEXTO.md). |
| T6-07 | Comprobante de venta en PDF | 2026-10-08 | `GET /sale-orders/:id/receipt`, para los tres roles: un PDF en A4 y en español con el logo y los datos del negocio, el número, la fecha del envío en la zona del negocio, el cliente con su documento, quién la registró, las líneas y subtotal, impuesto y total. Se titula «Comprobante de venta» y lleva «Documento sin valor fiscal» en la cabecera y en el pie de cada página. **No calcula nada:** pinta los importes de `conTotales`, los mismos de la pantalla; sin impuesto, el pie es solo el total. **Qué órdenes lo tienen** lo dice `tieneComprobante`, en el contrato, para los dos lados: las enviadas, y las canceladas después de enviarse —`shippedAt` sobrevive a la cancelación—, que salen marcadas «ANULADA» en la cabecera y en el pie. Una pendiente o una cancelada sin enviar responde 409 `SALE_ORDER_NOT_SHIPPED`, y la interfaz no les pone el botón. `shippedAt` entra en el contrato de la orden: la API ya lo mandaba. **El logo** lo trae `traerLogoDelNegocio`, la única petición que el servidor hace a una URL guardada: tope de 3 s, solo `https://res.cloudinary.com`, sin redirecciones, 2 MB como mucho y solo PNG o JPEG por su firma; pase lo que pase devuelve `null` y el papel sale sin logo. **Lo que no hay no deja hueco:** sin datos del negocio no hay bloque del negocio, y sin cliente ni vendedor no hay bloque del cliente. La descripción de una línea no se recorta: la fila crece. En la interfaz, `BotonDeComprobante` —por `descargarDeLaApi`, no un enlace—: en el detalle de la venta y, como icono, en cada fila del historial del cliente. La paleta y el recorte de texto de los PDF pasan a `shared/lib/pdf.ts`; `conTotales` deja de perder el tipo de la línea. **El criterio, comprobado:** dos líneas al 18 % llevan número, datos del negocio, las dos líneas y `RD$2,968.00` / `ITBIS (18 %)` `RD$534.24` / `RD$3,502.24`; un `USER` y un `WAREHOUSE` lo descargan; la pendiente responde 409; con Cloudinary caído —y con otros siete fallos suyos— sale sin logo; sin datos del negocio sale sin líneas vacías. Falsificado: 54 roturas, 53 caídas a la primera; la que pasó —no mirar la firma de la imagen— tenía una segunda red en PDFKit y se le añadió un test propio: 54 de 54. E2E en los dos proyectos: la pendiente no lo ofrece y la API responde 409; enviada por la interfaz, se descarga y el texto del PDF —leído con pdf.js— lleva número, cliente, documento, vendedor, líneas y el total de la API; se descarga también desde la ficha del cliente; cancelada, dice «ANULADA». Y el de `T6-05` comprueba en el papel `Subtotal 300.00 · ITBIS (18 %) 54.00 · Total 354.00`. Vistos cuatro PDF de muestra —completo, anulado, mínimo y de tres páginas— y las dos pantallas a 1280 y a 393 px; en la ficha del cliente el botón iba el último y a 393 px quedaba fuera de la pantalla: va el segundo. **Sin comprobar:** el logo contra Cloudinary de verdad —los tests simulan `fetch`, y en este equipo no hay credenciales—; y el papel impreso. **A saber:** las notas de la orden no salen, que son internas. Lo que no está en Latin-1 **no se imprime**: la Helvetica de PDFKit mide «株式会社» con ancho cero y pierde la `Ł` de «Łódź», sin error; ya les pasaba a los nombres de producto en los informes, y arreglarlo es incrustar una fuente. La palabra vetada no está en el PDF ni en los textos de la interfaz, con test en los dos lados; «facturación», la de la clasificación ABC, es otra palabra y se queda. **Dos defectos encontrados al pasar el E2E, ninguno del comprobante:** una lista que se está cargando por primera vez cuando termina una mutación no se vuelve a pedir, y se queda con lo que leyó antes —reproducido: enviar una venta dentro de los 300 ms del filtro por número la deja en «Pendiente» con el aviso de éxito—; es de todos los módulos y **no se ha arreglado**. Y el `ECONNRESET` intermitente del E2E era la reutilización de conexiones que Node cierra a los 6 s: arreglado en `e2e/helpers.ts`. Los dos, en [CONTEXTO.md §4](CONTEXTO.md). |
