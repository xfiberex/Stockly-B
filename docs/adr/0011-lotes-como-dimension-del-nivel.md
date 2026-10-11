# 0011 — El lote es una dimensión del nivel de stock, y de qué lote sale cada unidad lo decide una sola sentencia

**Estado:** aceptada · **Fecha:** 2026-10-10 (T5-15)

## Contexto

Con lotes y fechas de caducidad, lo que hay de un producto en un almacén deja de ser un número:
son tantos como lotes tenga allí. Había que decidir **dónde vive esa cantidad** y **quién elige
de qué lote sale** cada unidad.

El caso de uso es un comercio de **catálogo mixto** —parte perecedero, parte no—: los lotes se
activan producto a producto, y la mayor parte del catálogo no los lleva. Tres decisiones de
producto, tomadas el 2026-10-10: los lotes son de los productos que se marquen; al recibir, la
fecha de caducidad es obligatoria y el código, opcional; y al vender elige siempre Stockly, por
orden de caducidad (FEFO).

Para la cantidad había dos formas:

- **Una tabla aparte** (`lot_levels`) que desglosa el nivel de `stock_levels`. Los niveles se
  quedan como estaban, pero pasa a haber **tres copias** del mismo dato —el total del producto,
  el nivel del almacén y la suma de sus lotes— y dos cuadres que vigilar en vez de uno.
- **Abrir el nivel por lote**: `stock_levels` pasa de `(producto, almacén)` a
  `(producto, almacén, lote)`. Sigue habiendo una sola fuente de verdad y un solo cuadre, el del
  [ADR 0010](0010-stock-total-desnormalizado.md). A cambio, lo que hay en un almacén ya no es
  una fila: es una suma.

## Decisión

**El nivel se abre por lote.** `stock_levels` gana una columna `lotId`, y su índice único pasa a
ser `(productId, warehouseId, lotId)`. Era lo previsto en el ADR 0010, que dejó la clave de la
tabla como un `id` propio para esto. El disparador `stock_cuadra` no cambia: ya sumaba todas las
filas del producto.

Cinco decisiones que cuelgan de esta, y que son las que no conviene deshacer:

- **«Sin lote» es una fila más**, la de `lotId` a `NULL`. Ahí está todo el stock de un producto
  que no lleva lotes, y lo que uno que sí los lleva tenía **antes de marcarse**. Por eso marcar
  o desmarcar un producto no mueve nada ni exige nada: `tracksLots` gobierna solo si **las
  entradas piden lote**. La salida por orden de caducidad y el bloqueo de lo caducado miran los
  lotes que haya, esté el producto marcado o no. Se descartó la regla más limpia —«un producto
  con lotes no tiene nada sin lote»— porque obligaba a fechar todo el stock existente antes de
  poder marcarlo, y dejaba sin sitio la devolución de una venta anterior.
- **De qué lote sale cada unidad lo decide `shared/lib/stock.ts`, en una sentencia.** Ningún
  servicio recorre lotes. El orden es: primero lo que no tiene lote —es lo más antiguo—, después
  por fecha de caducidad, y a igual fecha por código. La suma que decide si alcanza, el reparto
  y la resta van en el mismo `UPDATE`, como el decremento condicional del
  [ADR 0001](0001-decremento-condicional-de-stock.md) del que viene. Antes hay un **camino
  corto**: si lo que no tiene lote alcanza, sale de ahí con el decremento de siempre, que es lo
  que hace que un producto sin lotes no pague el reparto.
- **«Caducado» no es un estado: es una fecha comparada con hoy.** No hay tarea programada que
  marque lotes ni columna que pueda quedarse vieja. Un lote caduca **al terminar su día en la
  zona del negocio** (`hoyDelNegocio`); el que vence hoy todavía se vende. Lo caducado sigue en
  el stock y en el total —está en la estantería— hasta que alguien lo da de baja, pero no está
  **disponible**: `disponible = stock − caducado − comprometido`.
- **Lo que se deshace vuelve a su lote.** Cada línea de venta anota de qué lotes salió
  (`sale_order_item_lots`): es lo que imprime el comprobante y lo que deja devolver cada unidad
  al suyo si la venta se cancela, aunque entretanto haya caducado. Cancelar una compra retira
  lo recibido **del lote en el que entró**, no del que toque por caducidad.
- **Dar de baja lo caducado es un `ADJUSTMENT`, no un `OUT`.** La rotación y la reposición
  cuentan salidas, y tirar no es vender. No tiene ruta propia: es el movimiento a mano de
  siempre con `lotId` y cantidad cero.

## Consecuencias

- **Una operación puede dejar varios movimientos.** Una línea de venta que toca dos lotes son
  dos movimientos `OUT`, cada uno con su lote y con lo que quedaba después de él; una
  transferencia, dos por lote. Quien cuente movimientos para saber cuántas operaciones hubo
  cuenta de más: las transferencias ya cuentan productos distintos.
- **Lo que hay en un almacén es una suma.** `nivelesEn` agrega; quien lea `stock_levels` a mano
  esperando una fila por producto y almacén se equivoca desde ahora.
- **Un lote agotado no deja fila.** El nivel sigue siendo disperso: si no, cada lote que ha
  pasado por cada almacén se quedaría para siempre en la suma. Su rastro son sus movimientos.
- **El índice único es `NULLS NOT DISTINCT`, y eso vive solo en el SQL de la migración.**
  Prisma no sabe escribirlo. Sin ello, dos filas «sin lote» del mismo producto y almacén serían
  distintas para el índice y cada entrada crearía una nueva. Es la segunda cosa —tras el
  disparador del ADR 0010— que `prisma db push` no trae; `lotes.test.ts` falla si falta. Pide
  PostgreSQL 15 o posterior; el proyecto fija la 17.
- **Lo que un ajuste encuentra de más queda sin lote.** Un conteo que cuenta seis donde había
  cuatro no sabe de qué lote son las dos que sobran: van a «sin lote», que sale primero. Lo que
  falta sale por orden de caducidad. El conteo sigue siendo por producto, no por lote.
- **El coste sigue siendo uno por producto.** El informe de caducidades valora cada lote al
  coste medio del producto, no a lo que costó ese lote.
- **Un producto sin lotes paga poco, y uno con lotes, más.** Medido sobre 100 000 productos, por
  movimiento y con su transacción: una entrada pasa de 1,21 a 1,30 ms y una salida de 1,23 a
  1,37 ms; una salida que de verdad reparte entre lotes, 2,2 ms. Sin el camino corto, toda
  salida costaba 1,70 ms ([rendimiento.md §16](../rendimiento.md)).
- **La migración es rápida, pero no expansiva.** Son dos columnas que nacen vacías y un cambio de
  índice —2,6 s sobre 297 665 niveles—, pero la versión anterior de la aplicación escribe los
  niveles con `ON CONFLICT ("productId", "warehouseId")`, y ese índice deja de existir. Se
  aplica con la aplicación parada ([operaciones.md §6](../operaciones.md)).
- **Lo que no hay.** No se elige el lote al vender; la importación por CSV no crea lotes; no hay
  retirada de un lote con la lista de a quién se vendió —el dato está, en
  `sale_order_item_lots`, pero no la pantalla—; y el resumen semanal no habla de caducidades.
