# Área 01 · Código · hallazgos provisionales

Revisado (profundidad *rápida*, dirigida por riesgo; solo Crítico y Alto):
- **Leído entero:** `src/modules/reports/reports.service.ts` (762 líneas), `reports.caducidades.ts`, `shared/lib/totalesDeVenta.ts`; `sale-orders.service.ts` por tramos (`reservarDisponible`, `despachar`, `ventaDeMostrador`).
- **Por búsqueda:** `isActive`/«descatalog» en sale-orders, stock.ts, lotes.ts, product.service, inventory-counts, purchase-orders; `@ts-ignore`, `any`, `catch` vacíos y `console.*` en `src/` (sin tests); manejo de errores en `error.middleware.ts` (solo las líneas de respuesta 500).
- **Contraste con docs:** `CONTEXTO.md`, `adr/` y `ROADMAP.md` (búsqueda de «descatalog», «inactiv», «desactiv»).
- **No se abrió:** `reports.abc.ts` (salvo `resumen`), `reports.pdf.ts`, `reports.periodo.ts`, `reports.controller.ts`, auth, usuarios, clientes, frontend, `stock.ts` y `lotes.ts` enteros (solo búsquedas).

Herramientas ejecutadas: ninguna externa (Read, Grep, git grep de solo lectura). La línea base trae lint con 0 avisos. Sin skills de apoyo.
Modelo: claude-sonnet-5-5 (Sonnet 5.5) · esfuerzo medium.

Resumen: **Crítico 0 · Alto 0**. Los dos temas encargados (informes con almacenes/lotes y orden PENDING con producto desactivado) quedan en Medio o por debajo; por la profundidad rápida no puntúan, y sus conclusiones están en «Debajo del umbral» para que la consolidación las tenga.

## Hallazgos

Ninguno de severidad Crítica o Alta en el alcance revisado.

## Debajo del umbral de la profundidad rápida (Medio o Bajo; no puntúan)

1. **Orden PENDING con un producto que después se desactiva: se puede despachar y cobrar (candidato Medio, confianza Alta, estática). Es una incoherencia, no una decisión documentada.**
   - `sale-orders.service.ts:141,373-378`: solo `ventaDeMostrador` rechaza productos inactivos (`INACTIVE_PRODUCT_SALE`). `reservarDisponible` selecciona `isActive` pero no lo comprueba; `despachar` (`:181-236`) lee los ítems y llama a `sacar` sin mirar `isActive`; `stock.ts` no contiene ninguna referencia a `isActive`. `product.service.ts:477-483` (`delete`) solo pone `isActive:false` y no mira órdenes PENDING.
   - Búsqueda de «descatalog/inactiv» en `CONTEXTO.md`, `adr/` y `ROADMAP.md`: la única regla escrita es la del mostrador (T6-08) y el rechazo del movimiento manual (`product.service.ts:731`, `INACTIVE_PRODUCT_MOVEMENT`). Para la orden normal no hay decisión escrita. Confirma la hipótesis 3 de `07-arquitectura.md` (crear) y la extiende al envío.
   - Consecuencia: se vende un producto descatalogado y el stock sale con normalidad. Gravedad acotada: lo hace un empleado autorizado y no hay usuarios reales.
   - Arreglo sugerido: la misma guarda `INACTIVE_PRODUCT_SALE` en `create` y en `despachar`, o decidir y documentar que una orden ya creada se honra.

2. **Informes con varios almacenes y lotes: sin dobles conteos ni errores de suma (conclusión negativa), con incoherencias de criterio (Medio/Bajo).**
   - Panel (`reports.service.ts:353-389`): valor (`price*stock`, `costPrice*stock`), stock bajo y desglose por categoría salen de `products.stock`, el total desnormalizado (ADR 0010). No hay `JOIN` con `stock_levels` ni con `lots` en esas consultas, así que no cuenta doble. No admiten filtro por almacén.
   - (a) Ese valor incluye la mercancía de almacenes desactivados y de lotes caducados, mientras que la venta trata lo caducado como no disponible (`sale-orders.service.ts:130-133`). El informe de caducidades (`reports.caducidades.ts:60-81`) sí lo separa por almacén y lote. Es coherente como informe distinto, pero el panel no avisa. Medio-Bajo.
   - (b) El panel y el top de valor excluyen productos inactivos (`WHERE "isActive" = true`, `:367,378,386,438`) aunque conserven stock físico, mientras que caducidades los incluye a propósito (`:56-58`). El valor del panel infravalora lo que hay. Medio-Bajo.
   - (c) Ventas, margen y más vendidos usan `quantity * unitPrice` sin ITBIS, coherente con lo congelado en el ítem y con `totalesDeLinea`; no hay descuentos en el modelo (sin resultados en `schema.prisma`). Compras: `sm.delta * poi."unitPrice"` por movimiento `IN` de orden no cancelada (`:212-215`); una recepción parcial cuenta cada movimiento una vez. Sin hallazgo.
   - Las ventas `SHIPPED` devueltas a `PENDING` sin devolver stock (P-07-01) distorsionarían los informes; ya cubierto allí.

3. **Sin ruido de depuración ni tipado suelto relevante.** `console.log` solo en el banner de arranque (`server.ts:16-31`) y en la CLI (`cli/resumen-semanal.ts:44-47`); sin `@ts-ignore`, `: any` ni `catch` vacío en `src/` fuera de tests. El único `catch(() => undefined)` es deliberado y comentado (`reports.service.ts:315`). Los 500 no filtran el mensaje en producción (`error.middleware.ts:108-110`).

## Matriz de autorización
No aplica (solo el área 2).

## Hipótesis por verificar

1. Con un producto con stock en dos almacenes, uno desactivado, comprobar en ejecución que el panel suma el total (la lectura estática dice que sí, por `products.stock`).
2. Qué hace `GET /reports/caducidades?warehouseId=` con un almacén desactivado según `almacenDelFiltro` (`shared/lib/almacenes.ts`, no abierto entero).

## Pendiente de verificar en ejecución

- Despachar una orden `PENDING` con un producto desactivado después de crearla (esperado según el código: 200 y stock descontado).
- Que el panel y el informe de caducidades den cifras distintas para un producto con lotes caducados en un almacén desactivado (esperado por el criterio distinto).

## Para escalar

- Transferencias entre almacenes con lotes y caducidad: no las abrí.
- `reports.abc.ts` y `reports.pdf.ts` (ABC con productos inactivos y PDF con las cifras del panel): no revisados.

## Puntos fuertes

- Consultas de informes agregadas en la base, con decisiones medidas y comentadas (`reports.service.ts:262-305`); ninguna agregación cruza `stock_levels` con líneas de venta.
- El redondeo del impuesto vive en un solo sitio (`totalesDeVenta.ts:26-40`), por línea y con `Decimal`; los totales de la orden no se guardan.
- Los ítems sin coste no se suman como coste cero y se informan aparte (`reports.service.ts:115-126`).
- Errores con código y mensaje genérico en producción; sin supresiones de tipos.

## Para otras áreas

- Área 7: la regla de productos inactivos no es uniforme (mostrador la aplica; orden normal y envío no). Es la hipótesis 3 de `07-arquitectura.md`; que la consolidación la trate como un solo asunto.
- Producto/UX: el panel no avisa de que el valor de inventario incluye lo caducado y el stock de almacenes desactivados, y excluye productos inactivos.
