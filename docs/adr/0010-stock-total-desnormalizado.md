# 0010 — `Product.stock` se conserva como total de los almacenes, y la base lo comprueba

**Estado:** aceptada · **Fecha:** 2026-10-10 (T5-14)

## Contexto

Con varios almacenes, el stock de un producto deja de ser un número y pasa a ser uno por
almacén (`stock_levels`). Queda por decidir qué pasa con el que había, `products.stock`:

- **Conservarlo** como suma de los niveles. Las lecturas siguen como estaban; a cambio hay un
  dato escrito en dos sitios, y dos sitios pueden dejar de decir lo mismo.
- **Quitarlo** y sumar los niveles al leer. Una sola fuente de verdad; a cambio, todo lo que
  hoy lee el stock de muchos productos a la vez pasa a agregar una tabla.

La ficha de la tarea pedía medirlo **antes** de decidir, sobre el conjunto de carga de
[rendimiento.md](../rendimiento.md): 100 000 productos, repartidos en tres almacenes
(297 665 niveles). Mejor de cinco pasadas, `work_mem` de fábrica:

| Lo que lee el stock de todo el catálogo | Con `products.stock` | Sumando niveles | |
|---|---:|---:|---:|
| Totales de inventario (panel) | 35,6 ms | 203,0 ms · a disco | ×5,7 |
| Stock y valor por categoría (panel) | 40,3 ms | 211,1 ms · a disco | ×5,2 |
| Top 10 por valor (panel) | 34,1 ms | 280,4 ms · a disco | ×8,2 |
| Stock bajo, los 20 primeros (panel) | 26,1 ms | 197,7 ms · a disco | ×7,6 |
| Stock bajo del resumen semanal | 16,8 ms | 196,8 ms · a disco | ×11,7 |
| Catálogo, una página | 0,01 ms | 0,18 ms | — |
| Un producto por su id | 0,32 ms | 0,34 ms | — |

| Lo que cuesta un movimiento (2 000 seguidos, ida y vuelta a la base incluida) | |
|---|---:|
| Antes de los almacenes: una escritura | 0,197 ms |
| Solo el nivel | 0,171 ms |
| El nivel y el total | 0,363 ms |
| El nivel, el total y la comprobación al confirmar | **0,408 ms** |

Las cuatro primeras filas son consultas que **cada visita al panel** lanza a la vez. Sumar los
niveles las multiplica por 5–8 y las manda a disco —que es justo lo que T4-16 quitó—; conservar
el total cuesta **0,2 ms más por movimiento**. Lo que se lee de uno en uno no nota la diferencia
en ninguno de los dos sentidos.

## Decisión

**`products.stock` se conserva, como el total de todos los almacenes.** La fuente de verdad son
los niveles; el total es una suma guardada porque se lee de 100 000 productos a la vez.

El riesgo de que diverja se cierra por los dos lados:

- **Un solo sitio lo escribe.** [`shared/lib/stock.ts`](../../src/shared/lib/stock.ts) tiene las
  funciones que mueven stock —`entrar`, `sacar`, `fijar`, `aplicar`, `transferir`,
  `altaConStock`— y cada una escribe el nivel y el total en la misma transacción. Ningún
  servicio hace `product.update({ stock })`.
- **La base no confirma un descuadre.** Un disparador de restricción diferido (`stock_cuadra`, en
  la migración) comprueba al `COMMIT` que el total de cada producto tocado es la suma de sus
  niveles, y si no, deshace la transacción. Es una **comprobación, no un mantenimiento**: el
  total lo escribe el código, a la vista; el disparador solo se niega si se equivoca.

Se descartó que el disparador *mantuviera* el total él solo: funcionaría igual, pero el dato
cambiaría sin que ninguna línea del código lo dijera, y quien lea un servicio no sabría de
dónde sale.

Tres decisiones que cuelgan de esta:

- **Los niveles son dispersos.** Sin fila es cero: dar de alta un almacén no escribe 100 000
  filas, y un producto que nunca ha estado en él no ocupa nada.
- **La clave de `stock_levels` es un `id` propio**, no `(producto, almacén)`. Con lotes
  (`T5-15`) el nivel será `(producto, almacén, lote)`: una columna y un índice único más
  ancho, no rehacer la tabla.
- **El mínimo y el coste medio siguen siendo del producto**, no del almacén. El aviso de stock
  bajo y la reposición comparan con el total —decisión de producto del 2026-10-10—, y lo que
  costó una unidad no depende de en qué local esté.

## Consecuencias

- **Cada movimiento son dos escrituras y una comprobación.** Con el servidor sin saturar no se
  nota: una petición detrás de otra, registrar un movimiento tarda lo mismo antes y después
  (15 ms de mediana en los dos casos; la resolución del reloj no deja ver menos). Con la
  prueba de carga —diez usuarios, y el panel saturando el servidor— la escritura sube de
  **339 a 410 ms de media (+21 %)** y de 1,13 a 1,34 s en p(95), y el rendimiento global baja de
  19,7 a 19,0 peticiones por segundo. **Eso es lo que esta decisión acepta**: hasta un 25 % en
  la media de la escritura bajo esa mezcla. El detalle, y por qué esa prueba ya no cumplía sus
  umbrales antes de esta tarea, en [rendimiento.md §15](../rendimiento.md).
- **El disparador vive solo en el SQL de la migración.** `schema.prisma` no sabe expresarlo, así
  que `prisma db push` no lo crea: una base sincronizada así se queda sin la guarda y no avisa.
  La de tests se sincroniza ejecutando el archivo de la migración
  ([CONTEXTO.md §4](../CONTEXTO.md)), y `varios-almacenes.test.ts` falla si el disparador no está.
- **Un producto con stock no se puede insertar sin su nivel**, ni siquiera en un test o a mano:
  las dos filas van en la misma transacción. Los tests usan `crearProducto` y `ponerStock`, de
  `helpers.ts`; el seed, un `create` anidado.
- **Una corrección a mano tiene que tocar los dos sitios** en la misma transacción, o la base la
  rechaza. Es el precio de que no se pueda descuadrar por descuido.
- **No hay `CHECK (stock >= 0)` en los niveles, y se probó.** Que un nivel no baje de cero lo
  garantiza el decremento condicional ([ADR 0001](0001-decremento-condicional-de-stock.md)), que
  ahora se aplica al nivel. La restricción rompía lo que quería proteger: un stock negativo
  heredado se copia tal cual, y con ella la primera recepción que no lo dejara en positivo
  acababa en un 500.
- **La migración reescribe `stock_movements`** para dar a cada movimiento su almacén: 77 s con
  1,2 millones de movimientos, con la tabla bloqueada. Se aplica con la aplicación parada
  ([operaciones.md §6](../operaciones.md)).
