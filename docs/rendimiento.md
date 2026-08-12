# Rendimiento con datos reales

Pruebas de carga y medición de consultas sobre un conjunto de datos representativo (T4-08).
La auditoría del 2026-08-04 **no midió nada**: sus hallazgos de base de datos salían de leer
el esquema. Esto es lo que pasa al ejecutarlos.

**Fecha:** 2026-08-11. **Máquina:** Windows 11, PostgreSQL 17.10 local (puerto 5433), backend
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

### Lo que sí estaba resuelto

`GET /products/:id/movements/export` **no** tiene este problema: las exportaciones se
escriben por lotes desde T2-05. El listado se quedó fuera de aquella tarea porque entonces
nadie tenía diez mil movimientos en un producto.

---

## 5. Hallazgo menor: el buscador del catálogo ignora el SKU

`where.name.contains` y nada más (`product.service.ts`). Buscar `SKU-CALIENTE` no devuelve el
producto cuyo SKU es exactamente ese — se descubrió porque la prueba de carga no encontraba
su producto. El buscador de usuarios sí mira dos campos (nombre y correo). No se toca aquí:
no es rendimiento, y cambiar lo que busca una pantalla es una decisión de producto.

---

## 6. Repetir las mediciones

```bash
pnpm carga:sembrar                    # ~2 min 30 s; recrea Stockly_carga desde cero
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
