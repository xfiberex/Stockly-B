# Rendimiento con datos reales

Pruebas de carga y medición de consultas sobre un conjunto de datos representativo (T4-08).
La auditoría del 2026-08-04 **no midió nada**: sus hallazgos de base de datos salían de leer
el esquema. Esto es lo que pasa al ejecutarlos.

**Fechas:** 2026-08-11 (§1–§4, T4-08), 2026-08-12 (§5–§6, T4-15 y T4-16), del 2026-09-13 al 2026-09-29 (§8–§11, las consultas del Tier 5) y 2026-10-10 (§15, T5-14, con la carga sostenida repetida por primera vez desde agosto). **Máquina:** Windows 11, PostgreSQL 17.10 local (puerto 5433), backend
compilado (`dist/`) contra esa base. Los números absolutos son de este equipo; lo que viaja
entre máquinas son las proporciones y los planes.

---

## 1. El conjunto de datos

`pnpm carga:sembrar` construye **`Stockly_carga`**, una base aparte. Nunca toca la de la
aplicación: si el nombre coincide con el de `DATABASE_URL`, aborta.

| | Filas |
|---|---:|
| Productos | 100 000 *(5 % inactivos)* |
| Movimientos de stock | 1 100 000 |
| Historial de precios | 30 000 |
| Registros de auditoría | 200 000 |
| **Tamaño** | **467 MB** |

Los movimientos se reparten **a lo largo de dos años**, no todos «ahora»: sin eso, cualquier
consulta por rango de fechas leería la tabla entera o ninguna fila, y las del dashboard son
por rango.

**Y hay un producto caliente con 100 000 movimientos él solo.** Con el reparto uniforme, la
media son once movimientos por producto — un inventario real no se parece a eso, y esa media
esconde justo el caso que rompe. La sección 4 es enteramente sobre él.

### Dos defectos del propio generador, encontrados midiendo

**El primero invalidó una tabla entera de resultados.** La categoría salía de `i % 20` y el
estado activo de `(i % 20) <> 0`: dos atributos del mismo módulo quedan **perfectamente
correlacionados**, así que una categoría entera resultó inactiva y las otras diecinueve
activas al 100 %. La consulta del catálogo —`isActive AND categoryId = …`— devolvía **cero
filas**, y una consulta que no encuentra nada parecía decir que el índice la empeoraba. Ahora
el reparto es aleatorio con semilla fija: reproducible sin quedar correlacionado.

**El segundo era de método:** al principio los identificadores se buscaban con una
subconsulta dentro de la sentencia medida, que metía en el plan un `Seq Scan on products`
ajeno a lo que se estaba midiendo — y se llevaba la etiqueta del plan. Ahora se resuelven
antes y entran como literales.

---

## 2. Los índices de T1-15, medidos

`pnpm carga:consultas` **quita los 19 índices no únicos, mide, los vuelve a poner y mide otra
vez**. Mismo dato, misma máquina, misma sesión: la única diferencia es el índice. El «antes»
no se puede sacar del historial, porque los índices existen desde el 2026-08-07 y la base de
desarrollo tiene 48 productos, donde todo es instantáneo.

Mejor de cinco pasadas:

| Consulta | Sin índices | Con índices | Efecto |
|---|---:|---:|---:|
| Histórico de un producto | 62.7 ms | **0.2 ms** | ×384 |
| Total del histórico (paginación) | 62.6 ms | **0.2 ms** | ×350 |
| Registro de auditoría | 29.3 ms | **0.1 ms** | ×349 |
| Catálogo filtrado por categoría | 24.0 ms | **0.2 ms** | ×143 |
| Historial de precios | 2.8 ms | **0.1 ms** | ×43 |
| Auditoría por entidad y acción | 29.7 ms | 25.7 ms | ×1.2 |
| Movimientos por mes (dashboard) | 167.3 ms | 222.4 ms | **×0.75** |
| Rotación de 30 días (dashboard) | 302.0 ms | 480.5 ms | **×0.63** |

**T1-15 queda validada donde importaba.** El criterio de aceptación pedía que el histórico de
un producto pasara de `Seq Scan` a `Index Scan`: pasa de `Parallel Seq Scan` a `Bitmap Heap
Scan` y de 62.7 ms a 0.2 ms. Cuatro consultas mejoran entre ×143 y ×384, y son las que
crecen sin parar con el uso.

### Las dos que salen peor no acusan al índice, acusan a `work_mem`

Es el hallazgo que no estaba en la ficha. Sin índices, PostgreSQL **no tiene más remedio** que
un `Parallel Seq Scan` y el plan entero corre con dos trabajadores. Con el índice disponible
elige un `Index Scan` en serie, y entonces el `Sort` que va encima —que antes eran tres
ordenaciones paralelas pequeñas— pasa a ser una sola grande que **no cabe en `work_mem` y se
va a disco**:

```
Movimientos por mes   Sort Method: external merge  Disk: 5632kB
Rotación de 30 días   Sort Method: external merge  Disk: 7976kB
```

`work_mem` en este servidor es **4 MB**, el valor de fábrica. Subiéndolo a 64 MB en la misma
sesión, con los mismos índices:

| Consulta | Sin índices | Índices + `work_mem` 4 MB | Índices + `work_mem` 64 MB |
|---|---:|---:|---:|
| Rotación de 30 días | 302.0 ms | 480.5 ms | **121.6 ms** |
| Movimientos por mes | 167.3 ms | 222.4 ms | **165.3 ms** |

La rotación pasa de perder por ×0.63 a ganar por ×2.5. **No sobra ningún índice**; falta
memoria de trabajo. → **T4-16**.

> **Esta conclusión resultó ser la mitad de la historia, y la mitad equivocada.** Al abordar
> T4-16 se midió la alternativa que aquí no se probó —reescribir la consulta— y deja la
> rotación en **20.0 ms con `work_mem` de fábrica**: seis veces mejor que subirlo a 64 MB. No
> faltaba memoria de trabajo, sobraba trabajo. Ver [§5](#5-t4-16--el-dashboard-a-escala).

---

## 3. Carga sostenida — la línea base

`pnpm carga:ejecutar --sin-caliente`. Diez usuarios concurrentes durante 60 s, con escalones
de subida y bajada de 10 s. Cada iteración recorre histórico, catálogo, dashboard y una
escritura.

| Ruta | media | p(90) | p(95) | máx |
|---|---:|---:|---:|---:|
| Histórico de un producto | 37 ms | 57 ms | **177 ms** | 645 ms |
| Catálogo filtrado | 69 ms | 183 ms | **287 ms** | 693 ms |
| Movimiento manual (escritura) | 354 ms | 730 ms | **789 ms** | 945 ms |
| **Dashboard** | **1.43 s** | 1.83 s | **1.91 s** | 2.12 s |

**1495 peticiones, 18.55 req/s, 0 % de errores**, todos los umbrales cumplidos.

**El dashboard es el más caro con diferencia**, y no por un descuido: T2-02 ya bajó sus
agregados a SQL y no materializa el catálogo en memoria. Lo que queda es la consulta de
rotación de la sección anterior, que agrega sobre los 95 000 productos activos **antes** de
quedarse con veinte. A 100 000 productos eso son ~1.4 s por carga, y es la primera pantalla
tras el login.

**Dos trampas que la prueba encontró en sí misma**, y las dos daban resultados creíbles y
falsos:

- **Un umbral sin muestras se da por cumplido.** La primera pasada reventó en `setup` —la
  envoltura de la API es `data.data` y no `data`— y k6 informó de cuatro `p(95)=0s` **en
  verde**. Ahora hay umbrales sobre `checks` y sobre el número de peticiones: una prueba que
  no llega a ejecutarse ya no se lee como una que va perfecta.
- **Un 2 % de las escrituras fallaba, y la aplicación tenía razón.** Los movimientos iban a
  productos elegidos al azar, y el 5 % del catálogo está inactivo: la API responde 400, como
  debe. Era un fallo de la prueba disfrazado de fallo del sistema.

---

## 4. El hallazgo: `GET /products/:id/movements` no pagina

`product.service.ts` lo pide sin `take`. Devuelve **todos** los movimientos del producto.

Con el reparto uniforme —once por producto— no se nota. Con el producto caliente, con la
misma prueba y la misma máquina:

| | Sin el histórico grande | Con él | |
|---|---:|---:|---|
| Peticiones completadas | 1495 | 432 | **−71 %** |
| Rendimiento | 18.55 req/s | 5.27 req/s | **−72 %** |
| Datos transferidos | 14 MB | **1.6 GB** | ×114 |
| Dashboard p(95) | 1.91 s | 4.87 s | ×2.5 |
| Histórico normal p(95) | 177 ms | 3.17 s | **×18** |
| Escritura p(95) | 789 ms | 2.19 s | ×2.8 |
| Histórico grande p(95) | — | **5.26 s** | |

**La base de datos no tiene ninguna culpa.** Esa misma consulta, medida directamente:

```
Index Scan using "stock_movements_productId_createdAt_idx"
  (actual time=0.068..12.885 rows=100019 loops=1)
Execution Time: 15.192 ms
```

**15 ms en la base, 3.3 s de media en la API.** El 99.5 % del tiempo se va en hidratar 100 000
objetos en Prisma y serializarlos a ~19 MB de JSON, y eso ocurre en el bucle de eventos: por
eso **degrada al resto de peticiones**, que no tienen nada que ver. El histórico de un
producto normal pasa de 177 ms a 3.17 s sin que haya cambiado nada suyo.

Es exactamente la métrica que T4-06 expone como retraso del bucle de eventos, y aquí se ve de
dónde saldría la alerta.

Un detalle del plan, de propina: el planificador estima **15 filas** donde hay 100 019. Da
igual para esta consulta —el índice es el correcto de todas formas— pero explica por qué en
un `JOIN` podría elegir mal: asume reparto uniforme, y un inventario real no lo es.

→ **T4-15**.

### Lo que se dio por resuelto y no lo estaba

Aquí decía que `GET /products/:id/movements/export` **no** tenía el problema, porque «las
exportaciones se escriben por lotes desde T2-05». **Es falso, y se comprobó al abordar
T4-15.** Lo que T2-05 convirtió en lotes fue la exportación del **catálogo**; la del
histórico de un producto seguía haciendo un `findMany` sin `take` y construyendo el archivo
entero en una cadena. El comentario del controlador lo justificaba —«va acotado a un
producto, así que no necesita streaming»— y esa es exactamente la suposición que rompe un
producto caliente: **el histórico de uno solo puede pesar más que el catálogo entero.**

Se deja escrito el error en lugar de corregirlo en silencio: una frase que dice «esto ya
está bien» es lo que hace que nadie vuelva a mirarlo.

---

## 5. T4-16 — el dashboard a escala

Medido el 2026-08-12 sobre el mismo conjunto, con `EXPLAIN (ANALYZE, BUFFERS)`, mejor de
cinco pasadas. **`work_mem` sigue en 4 MB**, el valor de fábrica, en todas las filas salvo
donde se indica.

### La consulta de rotación

| Variante | Tiempo | Ordenación |
|---|---:|---|
| Original (`LEFT JOIN` desde `products`) | 401.6 ms | `external merge`, **8 072 kB en disco** |
| Original + `work_mem` 64 MB | 121.1 ms | en memoria |
| **Reescrita, `work_mem` de fábrica** | **20.0 ms** | `top-N heapsort`, 83 kB |

**Por eso `work_mem` no se sube.** El ajuste daba ×3.3 y la reescritura da ×20 sin tocar la
configuración — y `work_mem` se reserva **por conexión y por nodo de ordenación**, así que
subirlo a 64 MB para tapar una consulta multiplica por todo lo demás lo que el servidor
puede llegar a pedir. Se arregla la causa.

Lo que cambia es de dónde se parte: el `LEFT JOIN` agregaba los **95 051 productos activos**
—85 000 de ellos sin una sola salida en el mes— para quedarse con veinte. Partiendo de los
movimientos son **31 501 filas y 9 967 grupos**. Las dos formas devuelven los mismos veinte
productos con los mismos totales, comparados fila a fila.

Una variante intermedia, para que conste: filtrar `isActive` **dentro** del agregado es
exacto por construcción pero devuelve el `Seq Scan` sobre el catálogo y cuesta **56 ms**. Se
prefirió el margen de 500 con vuelta atrás exacta si devuelve menos de 20 filas — medido, 17
de los 500 primeros por rotación están inactivos.

### La consulta que la ficha no nombraba

| Variante | Tiempo | Ordenación |
|---|---:|---|
| `GROUP BY TO_CHAR("createdAt",'YYYY-MM'), type` | 275.6 ms | `external merge`, **7 800 kB en disco** |
| Mes a mes con `LATERAL`, agrupando solo por `type` | **74.8 ms** | `quicksort`, 26 kB |

El motivo es distinto y vale la pena entenderlo: agrupar por una **expresión** deja a
PostgreSQL sin estadísticas de cuántos grupos saldrán. Estima muchos, descarta el
`HashAggregate` y elige `GroupAggregate`, que **ordena las 360 725 filas de la ventana para
devolver 24**. Recorriendo mes a mes, cada mes agrupa por `type` —columna real, cuatro
valores— y vuelve el `HashAggregate`.

**Las dos formas dan las mismas cifras**, comprobado cubo a cubo **con el instante de corte
fijado**. Sin fijarlo parecen distintas: la ventana rueda desde `NOW()` y el primer cubo
—que es parcial— pierde filas entre una consulta y la siguiente. Esa rareza del gráfico se
conserva a propósito; cambiarla es una decisión de producto.

### Las siete consultas del dashboard, después

```
count total                  7.1 ms  sin ordenación
count activos                9.0 ms  sin ordenación
valor de inventario         33.2 ms  sin ordenación
stock por categoría         41.2 ms  quicksort  Memory: 25kB
top 10 por valor            36.1 ms  top-N heapsort  Memory: 27kB
movimientos por mes         74.9 ms  quicksort  Memory: 26kB
stock bajo                  28.8 ms  top-N heapsort  Memory: 29kB
rotación                    20.1 ms  top-N heapsort  Memory: 83kB
```

**Ninguna ordena en disco**, que es la mitad del criterio de aceptación. Se miran las siete
y no solo la de rotación porque el criterio decía «ninguna de sus consultas» — y ahí estaba
la segunda.

---

## 6. Carga sostenida, después de T4-15 y T4-16

Misma prueba, misma máquina, **con** el producto caliente:

| | Línea base (T4-08) | Tras T4-15 | Tras T4-16 |
|---|---:|---:|---:|
| Rendimiento | 18.55 req/s | 29.34 | **90.82 req/s** |
| Peticiones completadas | 1495 | 2358 | **7293** |
| Datos transferidos | 14 MB *(sin el caliente)* · 1.6 GB *(con él)* | 22 MB | 69 MB |
| Dashboard p(95) | 1.91 s | 1.38 s | **337 ms** |
| Histórico p(95) | 177 ms *(sin el caliente)* | 317 ms | **254 ms** |
| Histórico grande p(95) | 5.26 s | 325 ms | **179 ms** |
| Catálogo p(95) | — | 275 ms | **128 ms** |
| Escritura p(95) | 789 ms | 558 ms | **280 ms** |
| Errores | 0 % | 0 % | **0 %** |

**La columna del medio es la que enseña algo.** Con T4-15 sola, los dos históricos cruzaban
su umbral de 300 ms por poco —317 y 325— pese a haber casi duplicado el rendimiento. No era
suyo: el dashboard seguía costando 1.04 s de media en las mismas diez VUs y saturaba el
bucle de eventos, así que la cola de todo lo demás era suya. Arreglado el dashboard, los dos
históricos bajan sin que se tocara ni una línea de su código.

`ruta_historico_grande` **tiene ahora umbral y antes no**, y eso también es un resultado:
mientras el endpoint no paginaba, ponerle un límite habría sido fingir que su número era
aceptable.

---

## 7. Hallazgo menor: el buscador del catálogo ignora el SKU

`where.name.contains` y nada más (`product.service.ts`). Buscar `SKU-CALIENTE` no devuelve el
producto cuyo SKU es exactamente ese — se descubrió porque la prueba de carga no encontraba
su producto. El buscador de usuarios sí mira dos campos (nombre y correo). No se toca aquí:
no es rendimiento, y cambiar lo que busca una pantalla es una decisión de producto.

**Desde T5-08 (2026-09-29) hay búsqueda exacta por SKU y por código de barras**, en
`GET /products/lookup`: dos consultas por índice único, sin `ILIKE`. Es la que usa el escáner, y
la que escribe un código a mano en su campo. El buscador de texto del catálogo sigue igual.

---

## 8. T5-02 — el valor a coste y el margen, sobre el conjunto de carga

El criterio de T5-02 pedía que las consultas nuevas no ordenaran en disco con este conjunto,
y **el conjunto no tenía ventas**: `load/sembrar.js` genera productos, movimientos y
auditoría, pero ni una orden de venta. Para medir se sembraron a mano en `Stockly_carga`,
con un guion que no se ha versionado —ver la salvedad del final—:

- **coste** en el 90 % de los productos, entre el 50 y el 80 % de su precio;
- **330 000 órdenes** repartidas en un año —300 000 enviadas, 20 000 pendientes, 10 000
  canceladas— con **660 000 ítems**, el 85 % de lo enviado con coste congelado. Quedan
  **24 580 envíos en la ventana de 30 días** y **99 860 productos distintos** vendidos.

| Consulta | Mejor de 5 | Plan | ¿A disco? |
|---|---:|---|---|
| Totales de inventario (con valor a coste) | **47.9 ms** | `Parallel Seq Scan` + agregado parcial, una pasada | no |
| Margen total de la ventana | **74.3 ms** | `Bitmap Index Scan` sobre `sale_orders_status_shippedAt_idx` + `Parallel Hash Join` | no |
| Margen por categoría | **149.6 ms** | `HashAggregate` de 20 grupos, `quicksort` en 29 kB | no |
| Top 10 productos por margen | **187.3 ms** | agrupa 30 863 productos; `top-N heapsort` en 27 kB, `quicksort` de 2 MB por worker | no |

**Un error propio de la siembra, que se vio en el plan y no en el resultado:** la primera
pasada devolvía **una sola fila** en el top y en el desglose por categoría. El `random()`
estaba dentro de la condición del `JOIN` que asignaba producto a cada ítem, y el
planificador lo evaluó una vez: las 660 000 líneas apuntaban al mismo producto, y las
consultas salían rapidísimas por agrupar un solo grupo. Sorteando el producto en una
subconsulta materializada antes del `JOIN`, los números son los de la tabla.

**Las tres consultas de margen corren en paralelo con el resto del resumen**, no después. La
primera versión las esperaba al final, y eso sumaba sus ~190 ms a la primera pantalla tras el
login; ahora arrancan a la vez que las demás. **No se ha repetido `pnpm carga:ejecutar`**, así
que el p(95) de 337 ms del §6 no está medido de nuevo con estas consultas.

**Salvedad, resuelta en T5-09:** `load/sembrar.js` no generaba ventas, así que rehacer
`Stockly_carga` las borraba y estas cuatro filas no se podían repetir. Desde el 2026-09-28 el
generador siembra costes, ventas y compras con recepciones con las proporciones de arriba (§10).
**Estas cuatro filas no se han vuelto a medir** con él.

---

## 9. T5-05 — las sugerencias de reposición, sobre el conjunto de carga

Medido el 2026-09-28 sobre `Stockly_carga` —100 000 productos, 1.1 M movimientos y 660 000 líneas
de venta—, mejor de cinco pasadas con `EXPLAIN (ANALYZE, BUFFERS)`:

| Consulta | Tiempo | ¿Ordena en disco? |
|---|---:|---|
| Página de 50 sugerencias, con el último precio pagado | **231 ms** | no (`top-N heapsort`, 46 kB) |
| Recuento total (3 549 sugerencias) | **174 ms** | no |

Las dos corren a la vez, así que la pantalla espera la más lenta. **El grueso no es de la fórmula**:
son ~160 ms de agregar lo comprometido en ventas pendientes, que recorre las 660 000 líneas de venta
(`Seq Scan` + `Hash Join` con las órdenes pendientes) para quedarse con 40 000. Es la misma cuenta
que hace T5-03 en el catálogo. Si alguna vez molesta, el sitio es esa agregación —partir de las
ventas `PENDING` y no de las líneas—, no `work_mem` (§5).

**Lo que no está medido:** cuando se midió, `load/sembrar.js` no generaba órdenes de compra —desde
T5-09 sí, pero esto no se ha repetido—, así que el `LATERAL` del
último precio pagado y lo pendiente de recibir corren aquí sobre una tabla vacía. Con compras reales
el `LATERAL` se hace solo para las 50 filas de la página y usa el índice de
`purchase_order_items(productId)`.

---

## 10. T5-09 — ventas y compras por periodo, sobre el conjunto de carga

Medido el 2026-09-28 sobre `Stockly_carga` rehecha con el generador versionado: 100 000
productos, 1.2 M movimientos, **660 000 líneas de venta** (330 000 órdenes en un año) y **90 000
líneas de compra con 105 384 recepciones** (30 000 órdenes). Mejor de cinco pasadas con
`EXPLAIN (ANALYZE, BUFFERS)` sobre las consultas **tal como las lanza el servicio**, con sus
parámetros; `work_mem` de fábrica (4 MB).

| Consulta | Un mes | Un trimestre | Un año |
|---|---:|---:|---:|
| Totales de ventas | 113 ms | 139 ms | 223 ms |
| Totales de compras | 282 ms | 325 ms | 701 ms · **4.5 MB a disco** |
| Por categoría | 299 ms | 359 ms | 489 ms |
| Por mes | 350 ms | 545 ms | 1 784 ms · hash en 4 lotes, 4.5 MB a disco |
| Por producto (51 filas) | 350 ms | 601 ms · 3.6 MB a disco | 1 031 ms · **~7 MB a disco** por proceso |

Las cinco corren a la vez, así que la pantalla espera la más lenta. **Con un mes ninguna toca
el disco.**

**Tres defectos de la primera versión que salieron aquí y no en los tests:**

- `COUNT(DISTINCT so.id)` para contar órdenes **ordena todas las líneas**: un año eran 443 000
  filas a disco y 1.2 s. Ahora las ventas se cuentan en `sale_orders` y las compras con un
  `EXISTS`.
- El desglose por producto agregaba ventas y compras por separado y las cruzaba con un
  `FULL JOIN`, más un `COUNT(*) OVER ()` para el total: todo ordenado en disco, **1.8 s**. Ahora
  es un `UNION ALL` y un único `HashAggregate` con la fila más estrecha posible —clave y cuatro
  sumas `int8`/`float8`—, el `LIMIT` antes de buscar nombres, y un «hay más» en vez del recuento.
- El desglose por meses recorría el periodo mes a mes con un `LATERAL`, como el gráfico de T4-16,
  y con un año eran **443 000 búsquedas por índice y 3.9 s**. Ahora es una pasada: los meses van
  como `VALUES` —de `generate_series` el planificador supone 1 000 filas y eligió un `Merge
  Join` que ordenaba en disco—, y el cruce de órdenes y líneas va tras un `OFFSET 0`, porque del
  cruce con los meses el planificador estimaba una fila de cada doscientas y prefería buscar las
  líneas por índice (1.7 s de los 2.3 de esa versión intermedia).

**Lo que queda a disco con un año, y por qué se deja.** El agregado por producto son ~100 000
grupos, y no caben en los 8 MB de hash que da el `work_mem` de fábrica. Se probó **en memoria**
con `SET LOCAL work_mem = '16MB'` dentro de una transacción solo para esa consulta —distinto de lo
que T4-16 rechazó, que era subirlo en el servidor—: en memoria de verdad (un lote, `quicksort` de
11.5 MB), y **más lenta, 1.2 s frente a 0.76 s**, en las cinco pasadas. Se quitó. La ordenación de
las compras (4.5 MB) es de las líneas de compra para un `Merge Join` contra el índice de
`purchaseOrderItemId`; no se ha perseguido.

**Decisión (2026-09-29): el criterio de la ficha se relaja a «un mes».** Con un año la pantalla
espera ~1.8 s, la del desglose por meses. Si los informes anuales pasan a ser habituales, lo que
lo cambia de escala no es `work_mem` sino no agregar las líneas en cada petición: una tabla con
las cifras ya sumadas por mes y producto, mantenida al enviar y al recibir. Sería tarea propia.

**Un tropiezo del propio guion de medición**, anotado por si se repite: al interceptar
`$queryRaw` para lanzar el `EXPLAIN`, el cliente de una transacción interactiva de Prisma hereda el
método interceptado del cliente global, y la consulta «dentro» de la transacción se ejecutaba
fuera, con el `work_mem` de fábrica. Las pasadas alternaban entre 16 MB y 4 MB hasta que se
comprobó con `current_setting('work_mem')` antes de cada `EXPLAIN`.

**El gráfico de movimientos del dashboard, a meses naturales:** la forma nueva frente a la de
T4-16, las dos aisladas y sobre la misma base, **77.6 → 76.3 ms**. Dentro del resumen del
dashboard sale en ~180 ms porque corre a la vez que las otras diez consultas.

---

## 11. T5-10 — la clasificación ABC, sobre el conjunto de carga

Medido el 2026-09-29 sobre `Stockly_carga` recién sembrada (el mismo generador que §10:
100 000 productos, 660 000 líneas de venta en un año). Periodo `2025-09-01`–`2026-08-31` en
`America/Santo_Domingo`: **99 624 productos con ventas**. `work_mem` de fábrica. El guion de
medición repite a mano el SQL de `reports.abc.ts`.

**La primera versión no terminaba.** Para que los empates compartieran clase, la suma acumulada
de «los que facturan más» usaba `RANGE … CURRENT ROW EXCLUDE GROUP`. Con una exclusión en el marco,
PostgreSQL **no puede ir acumulando la suma fila a fila**: la recalcula entera para cada fila, y
eso es cuadrático. Con 99 624 filas pasaron **más de cinco minutos** sin respuesta y hubo que
cancelarla en el servidor (cortar el cliente no la para). Los tests, con cinco productos, no lo
podían ver.

**La corrección es aritmética, no de planificador.** Las cifras son céntimos enteros, así que
«facturar estrictamente más» es «facturar al menos un céntimo más»: `ORDER BY centimos::bigint
DESC RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING`. Dice lo mismo, sin exclusión, y el marco
empieza en `UNBOUNDED PRECEDING`, que es lo que permite acumular. Los 19 tests pasan igual con
las dos formas.

| Paso | Tiempo |
|---|---:|
| Clasificar (la consulta, `EXPLAIN ANALYZE`) | **2.3 s** · agregado por producto en disco (~12 MB en paralelo) y la ventana, 6.4 MB |
| Recálculo completo: `DELETE` + `INSERT` de ~100 000 filas | **4.9–5.4 s** (cinco pasadas) |
| Catálogo filtrado por A, página 1 | 2.6 ms |
| Recuento de A | 154 ms |
| Catálogo filtrado por C, página 1 | 0.1 ms |
| Recuento de C (incluye los ~400 sin ventas) | 89 ms |

**Por qué el recálculo no se persigue más.** Corre como mucho una vez al día y **nadie lo
espera**: el catálogo sirve la clasificación anterior y lo lanza en segundo plano. Solo lo espera
el primer listado de una base que no tiene ninguna. El agregado en disco es el mismo que §10
dejó a sabiendas con un año de datos.

**El reparto de este conjunto no es el de un negocio real**: 50 085 A, 24 984 B y 24 555 C. Las
ventas del generador se sortean con la misma probabilidad para todos los productos, así que no
hay pocos productos que facturen casi todo, que es justo lo que el ABC existe para destapar. Las
cifras sirven para medir el coste, no para juzgar la clasificación.

**Los recuentos de los filtros** se midieron con SQL escrito a mano equivalente al que genera
Prisma (`EXISTS` para A y B, `LEFT JOIN … IS NULL OR` para C), no capturando el suyo.

---

## 12. Repetir las mediciones

```bash
pnpm carga:sembrar                    # ~3 min 20 s; recrea Stockly_carga desde cero, con órdenes
pnpm carga:sembrar --productos=10000 --movimientos=200000
pnpm carga:consultas                  # EXPLAIN ANALYZE con y sin índices
pnpm build && pnpm carga:ejecutar     # k6 en Docker; --sin-caliente para la línea base
```

**La prueba de carga no está en `pnpm verify`** y no debe estarlo: tarda minutos, necesita
Docker y sus números dependen de la máquina. Un umbral que falla porque el portátil está
compilando otra cosa enseña a ignorar la puerta.

Los planes completos quedan en `load/planes.txt` y el resumen de k6 en `load/resultado.json`;
los dos están en `.gitignore`, porque se regeneran y cambian en cada equipo. Lo que se
versiona es este documento.

**k6 se ejecuta en Docker a propósito.** No está instalado en la máquina de desarrollo y no
hace falta que lo esté: `grafana/k6` en un contenedor deja la prueba reproducible sin añadir
una herramienta más al PATH.

---

## 13. T6-01 — el listado de ventas, sobre el conjunto de carga

Medido el 2026-10-05 sobre `Stockly_carga`: 330 000 órdenes de venta de un año (300 000 enviadas,
20 000 pendientes, 10 000 canceladas). Mediana de cinco `EXPLAIN ANALYZE` de SQL escrito a mano
equivalente al `findMany` y al `count` de `saleOrderService.getAll`, no capturando el de Prisma.

La pregunta era si el filtro por fecha de creación necesitaba un índice. **Lo necesitaba, y el
listado sin filtro más que el filtro:** los tres índices de `sale_orders` empiezan por `status` o
por `customerId`, así que la pantalla de ventas, que al abrirse lista por `createdAt` sin filtrar
por nada, recorría y ordenaba la tabla entera. Era así desde antes de `T6-01`.

| Consulta | Sin el índice | Con `sale_orders_createdAt_idx` |
|---|---:|---:|
| Página 1, sin filtro | 33,40 ms *(recorrido secuencial + ordenación)* | 0,01 ms |
| Página 1000, sin filtro (`OFFSET 9990`) | 40,47 ms | 2,37 ms |
| Página 1, un día | 27,98 ms | 0,02 ms |
| Recuento, un día | 27,27 ms | 0,09 ms |
| Página 1, un mes | 27,63 ms | 0,01 ms |
| Recuento, un mes | 28,75 ms | 2,05 ms |
| Página 1, pendientes de un mes | 0,01 ms | 0,01 ms *(usa `status, createdAt`)* |
| Recuento, enviadas de un mes | 2,14 ms | 2,01 ms *(usa `status, createdAt`)* |
| **Recuento, sin filtro** | 28,80 ms | **28,97 ms** |
| **Recuento, todas las enviadas** | 31,72 ms | **27,89 ms** |

**Lo que el índice no arregla** son las dos últimas filas: contar las 330 000 órdenes, o las
300 000 enviadas, sigue siendo un recorrido de la tabla, y es lo que cuesta ahora abrir la
pantalla —unos 29 ms, donde antes eran 62—. No se ha tocado: es el precio de enseñar el total
exacto, y a este tamaño no se nota.

La columna «con» se midió creando el índice **dentro de una transacción que se deshizo**: la
base de carga quedó como estaba, sin él. `pnpm carga:sembrar` la recrea con las migraciones, así
que la próxima vez que se siembre lo tendrá.

---

## 14. T6-09 — las ventas del panel, sobre el conjunto de carga

Medido el 2026-10-09 sobre `Stockly_carga` recién sembrada —330 000 órdenes y 660 000 líneas, con
**5 413 ventas enviadas en la ventana de siete días**, unas 770 al día—, con
`EXPLAIN (ANALYZE, BUFFERS)`, cinco pasadas y `work_mem` de fábrica (4 MB). Son las dos consultas
que `T6-09` añade a `getSummary`, y las paga cada visita al panel.

| Consulta | Mejor | Mediana | Plan | ¿A disco? |
|---|---:|---:|---|---|
| **Ventas por día**, un `LATERAL` por día | **105,2 ms** | 109,8 ms | `Index Scan` por `sale_orders_status_shippedAt_idx`, siete veces; ordena 1 547 filas por día para el `COUNT(DISTINCT)` | no (`quicksort`, 132 kB) |
| Ventas por día, `GROUP BY` sobre el día *(descartada)* | 117,9 ms | 121,3 ms | `Bitmap Index Scan` + `Gather Merge` con dos procesos; ordena las 10 826 líneas por la expresión | no (`quicksort`, 1 230 kB) |
| **Más vendidos** de la ventana | **79,2 ms** | 84,4 ms | `Bitmap Index Scan` por el mismo índice, `HashAggregate` de 10 245 nombres y `top-N heapsort` | no (4 241 kB de tabla hash) |

**Ninguna recorre una tabla entera ni ordena en disco**: las dos entran por `(status, shippedAt)`,
que acota la ventana, y llegan a las líneas por `sale_order_items_saleOrderId_idx`. Casi todo el
tiempo es eso último, 5 413 búsquedas de dos líneas cada una.

**El `LATERAL` gana por poco, y no es por lo que gana por lo que se eligió.** A este tamaño el
`GROUP BY` sobre `("shippedAt" AT TIME ZONE …)::date` tampoco se va a disco —son siete días, no
los seis meses de §5—, pero ordena por una expresión sin estadísticas, estima 4 968 grupos donde
hay siete y necesita dos procesos en paralelo para quedarse en 120 ms. El `LATERAL` no ordena por
el día, no depende de esa estimación y **devuelve los días sin ventas a cero** sin un `LEFT JOIN`
contra la serie.

Lo que las dos suman al panel no son 185 ms: corren a la vez que el resto de `getSummary`, cuyo
tramo más lento ya era el margen (~190 ms, §8). **No se ha medido el panel entero con k6** tras
añadirlas; es una fila más de la carga sostenida que sigue sin repetirse.

Para medir hubo que **arreglar `load/sembrar.js`**: desde `T6-04` insertaba ventas sin `number`,
que es obligatorio, y la siembra fallaba a medias. Ahora numera por fecha y deja el contador en
el último.

---

## 15. T5-14 — varios almacenes, y la carga sostenida repetida

Medido el 2026-10-10. Tres cosas: la decisión previa de la ficha, las consultas nuevas y la
prueba de carga, **antes y después** del cambio.

### La decisión previa: ¿`products.stock` se mantiene o desaparece?

La tabla y la decisión están en el [ADR 0010](adr/0010-stock-total-desnormalizado.md). En corto:
derivar el stock de `stock_levels` multiplica por 5–8 las cuatro consultas del panel que leen el
catálogo entero y las manda a disco; conservarlo cuesta 0,2 ms más por movimiento. Se conserva.

Se midió sobre `Stockly_carga` con tres almacenes creados a mano —el stock de cada producto
repartido al 60, 25 y 15 %, 297 665 niveles— y cada consulta en sus dos formas, comprobando que
daban las mismas cifras.

### La migración, sobre 1,2 millones de movimientos

`prisma migrate deploy` de la migración de T5-14 sobre la base de carga: **77 s**. Casi todo es
reescribir `stock_movements` —cada fila recibe su almacén y su saldo de almacén— y
`sale_orders`. El total antes y después: 14 940 100 unidades, y ni un producto cuyo stock no
sea la suma de sus niveles.

### Las consultas nuevas

Sobre `Stockly_carga` resembrada con el generador ya adaptado —tres almacenes, 297 665
niveles—, mejor de cinco pasadas con `EXPLAIN (ANALYZE, BUFFERS)`, `work_mem` de fábrica:

| Consulta | Tiempo | Plan | ¿A disco? |
|---|---:|---|---|
| Niveles de una página del catálogo (10 productos) | 0,14 ms | `Bitmap Index Scan` por `(productId, warehouseId)` | no |
| Niveles de una página de 100 | 0,80 ms | ídem | no |
| Comprometido por almacén, página de 10 | 0,87 ms | `Nested Loop` desde las líneas de esos productos | no |
| Comprometido por almacén, página de 100 | 9,16 ms | ídem | no |
| Catálogo filtrado por almacén, página 1 | 0,12 ms | `Index Scan` por `createdAt` + sonda al nivel | no |
| Catálogo filtrado por almacén, recuento | 91,7 ms | `Hash Join` en paralelo | no |
| Ventas de un almacén, página 1 | 0,02 ms | `sale_orders_warehouseId_createdAt_idx` | no |
| Ventas de un almacén, recuento | 8,1 ms | `Index Only Scan` | no |
| ¿Le quedan existencias a un almacén? (al desactivarlo) | 22,1 ms | `Bitmap Heap Scan` por `warehouseId` | no |
| **Lo que guarda cada almacén** (`GET /warehouses/summary`) | **201 ms** | agrega los 297 665 niveles | no |

**La última fila cambió el diseño.** La primera versión devolvía esas cifras en
`GET /warehouses`, que es la lista que pide **cada formulario** para pintar su selector: 200 ms
de agregado en casi todas las pantallas para saber cómo se llaman tres almacenes. Ahora la
lista va sin cifras, y las cifras tienen su ruta, que solo pide la pantalla de almacenes.

Estas cifras se tomaron con otra carga en la máquina —la suite del frontend corriendo—: valen
para el orden de magnitud y para el plan, no al milisegundo.

### La carga sostenida: antes y después

Es la primera vez que se repite `pnpm carga:ejecutar` desde agosto (§6). Para compararlo en la
misma máquina y el mismo día se sembraron **dos bases** —`Stockly_carga_antes`, con el código y
las migraciones anteriores a T5-14, y `Stockly_carga`, con los de ahora— y se lanzó la prueba
dos veces contra cada una, alternando el orden.

| | Antes (dos pasadas) | Después (dos pasadas) |
|---|---:|---:|
| Rendimiento | 19,4 · 20,1 req/s | 19,3 · 18,7 req/s |
| Dashboard, media · p(95) | 1,50 · 2,18 s — 1,51 · 2,31 s | 1,38 · 2,04 s — 1,36 · 2,14 s |
| Catálogo, media · p(95) | 166 · 887 ms — 154 · 712 ms | 180 · 674 ms — 193 · 718 ms |
| **Escritura, media · p(95)** | 324 ms · 1,14 s — 353 ms · 1,12 s | **391 ms · 1,33 s — 428 ms · 1,34 s** |
| Histórico, media · p(95) | 118 · 448 ms — 103 · 445 ms | 132 · 428 ms — 218 · 960 ms |
| Histórico grande, media · p(95) | 79 · 260 ms — 68 · 224 ms | 107 · 435 ms — 163 · 818 ms |
| Errores | 0 % | 0 % |

**Lo que cambia con T5-14:** la escritura sube un **21 %** de media (339 → 410 ms) y un 18 % en
p(95). Es lo esperable: un movimiento era una escritura y ahora son dos y una comprobación, más
la lectura del almacén predeterminado. El rendimiento global baja un 4 %. Los dos históricos
salen peor en las dos pasadas de «después», pero con una dispersión —428 y 960 ms de p(95)— que
no deja atribuirlo: la consulta es la misma, con tres columnas más por fila.

**Con el servidor sin saturar, no se nota.** Las mismas rutas, una petición detrás de otra
(500 escrituras y 200 lecturas de cada una, dos rondas): registrar un movimiento tarda 15 ms
de mediana antes y después, con p(95) de 17,2–17,5 ms antes y 17,8–18,5 ms después; el catálogo,
15,6 ms; el panel, 300 ms. La resolución del reloj en esta máquina es de unos 15 ms, así que
no se ve nada por debajo. **El 21 % de la tabla es el coste del cambio amplificado por la cola**
que forma el panel.

### El hallazgo: la prueba ya no cumplía sus umbrales antes de esta tarea

**La columna «antes» incumple cuatro de sus cinco umbrales**, con el código anterior a T5-14:

| Umbral | Límite | Antes de T5-14 | Tras T4-16 (§6) |
|---|---:|---:|---:|
| Dashboard p(95) | 2 s | **2,18 – 2,31 s** | 337 ms |
| Escritura p(95) | 1 s | **1,12 – 1,14 s** | 280 ms |
| Catálogo p(95) | 500 ms | **712 – 887 ms** | 128 ms |
| Histórico p(95) | 300 ms | **445 – 448 ms** | 254 ms |
| Rendimiento | — | 19,4 – 20,1 req/s | 90,8 req/s |

El panel pasó de 337 ms a más de 2 s y arrastra a todo lo demás, que es lo mismo que §6 contó al
revés. Entre aquella medición y esta, `getSummary` ganó las consultas de margen (T5-02), las de
ventas por día y más vendidos (T6-09) y otras; cada una se midió sola al entrar, con su
`EXPLAIN`, y ninguna ordena en disco —pero **juntas y con diez usuarios a la vez saturan la
base**, y eso solo lo ve esta prueba, que no se había vuelto a lanzar. Una petición suelta al
panel tarda hoy 300 ms; diez a la vez, 1,5 s de media.

No es de T5-14 y no se arregla aquí: es el cabo que el ROADMAP llevaba como «la carga sostenida
no se ha repetido», y ahora tiene cifra. **Salvedad:** el proyecto se trabaja en dos equipos y
la tabla de §6 no dice en cuál se midió; si fue en el otro, parte de la diferencia es de la
máquina. La comparación de arriba —antes y después de T5-14— sí es de la misma máquina y la
misma hora.

### Repetirlo

`pnpm carga:sembrar` ya siembra tres almacenes y reparte el stock entre ellos; los productos y
sus niveles van en una transacción, porque la base comprueba el cuadre al confirmar. La base de
«antes» no se puede rehacer con el árbol actual —necesita el generador y las migraciones del
commit anterior a T5-14—, y se borró al terminar.
