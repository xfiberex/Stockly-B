# Operaciones — copia de seguridad, restauración, reversión y alertas

> Lo que hay que hacer **cuando algo ya ha pasado** —enterarse (§8), recuperar la base de datos
> (§3–§5) y deshacer un despliegue (§6)—, más dos cosas que se mantienen desde fuera del código: la
> versión de PostgreSQL (§9) y el resumen semanal (§10). El arranque normal está en
> [README-proyecto.md](README-proyecto.md); la puerta de calidad, en
> [CONTRIBUTING.md](../CONTRIBUTING.md).
>
> **Los números de sección no se cambian**: los citan el código, el workflow y el compose.

El valor de Stockly no es el código —se vuelve a compilar en dos minutos— sino el **histórico de
inventario**: `stock_movements` es un libro de asientos, y una fila perdida ahí no se deduce de
ninguna otra tabla. Todo lo que sigue existe para eso.

---

## 1. Qué se copia, y qué no

| Dato | Dónde vive | Cómo se recupera |
|---|---|---|
| Base de datos completa | PostgreSQL | `pnpm db:backup` → un volcado por copia |
| Imágenes de producto | Cloudinary | No se copia aquí: el proveedor las custodia. La base guarda la URL |
| Código y migraciones | git | El propio repositorio |
| Secretos (`.env`) | Fuera de git, a propósito | **No hay copia automática.** Ver §6 |

**El `.env` es el punto ciego consciente.** No se versiona (T0-06 obligó a reescribir el historial
por eso) y tampoco se vuelca aquí, así que una máquina perdida se lleva `JWT_SECRET` con ella. La
consecuencia concreta: al reponerlo con otro valor, **todas las sesiones y los refresh tokens
vigentes quedan invalidados**. Es aceptable en una recuperación —los usuarios vuelven a entrar—,
pero conviene saberlo antes y no descubrirlo con el sistema en pie.

## 2. Objetivos declarados

Se escriben para poder incumplirse a la vista, que es más útil que no tenerlos:

| | Valor | De dónde sale |
|---|---|---|
| **RPO** — datos que se aceptan perder | 24 h | Una copia diaria. Con el volumen actual (§5) cabe subir a cada hora sin coste apreciable |
| **RTO** — tiempo hasta volver a operar | < 30 min | La restauración medida tarda segundos; el resto es decidir, localizar el archivo y levantar |
| **Retención** | 14 días, y **nunca menos de 3 copias** | §3 |

## 3. Copia de seguridad

```bash
pnpm db:backup
```

Escribe `backups/stockly-<AAAAMMDD>-<HHMMSS>.dump` y poda lo caducado. El directorio está en
`.gitignore`: **un volcado es la base entera**, incluidos los hashes de `users`, y versionarlo
publica en el historial lo mismo que el `.env`.

| Variable | Por defecto | Para qué |
|---|---|---|
| `BACKUP_DIR` | `./backups` | Escribir en otro disco o en un recurso de red |
| `BACKUP_RETENTION_DAYS` | `14` | Antigüedad máxima |
| `BACKUP_RETENTION_MIN` | `3` | Copias que **nunca** se borran, tengan la edad que tengan |
| `PG_BIN` | autodetectado | Directorio de `pg_dump` si no está en el `PATH` |

Tres decisiones del guion que no son arbitrarias:

- **Formato `custom` (`-Fc`), no `.sql` plano.** Va comprimido, se restaura en paralelo y admite
  sacar una sola tabla del archivo. Un `.sql` no hace ninguna de las tres.
- **Se verifica antes de podar.** Tras el volcado se ejecuta `pg_restore --list`, que lee el índice
  del archivo; si falla, la copia se descarta y **no se borra nada**. Un volcado truncado que ocupa
  su tamaño y no se puede leer es el peor resultado posible, porque parece una copia.
- **El mínimo de copias es una guardia contra la propia retención.** Si los volcados llevan un mes
  fallando y nadie mira el registro, una poda por antigüedad a secas borra la última copia buena
  justo el día en que es lo único que queda.

### Programarla

**Linux / producción** — `crontab -e`, copia diaria a las 03:15:

```cron
15 3 * * * cd /ruta/a/Stockly-B && /usr/bin/pnpm db:backup >> /var/log/stockly-backup.log 2>&1
```

**Windows** — Programador de tareas, en una línea:

```powershell
schtasks /create /tn "Stockly backup" /tr "cmd /c cd /d C:\ruta\a\Stockly-B && pnpm db:backup" /sc daily /st 03:15
```

**Con la pila en contenedores**, la copia se lanza desde el host contra el puerto publicado por
`db`; no hace falta entrar al contenedor. En `docker-compose.prod.yml` ese puerto está cerrado a
propósito, así que ahí se ejecuta dentro:

```bash
docker compose exec -T db pg_dump -U postgres -d Stockly -Fc -Z 6 > backups/stockly-$(date +%Y%m%d-%H%M%S).dump
```

> **Programar no es tener copias.** Lo único que demuestra que el mecanismo sigue vivo es §4, y por
> eso tiene calendario propio.

## 4. Restauración

```bash
# Ensayo: restaura en Stockly_restauracion, sin tocar la base de la aplicación
pnpm db:restaurar backups/stockly-20260811-163633.dump

# Recuperación real: exige --forzar, escrito a mano
pnpm db:restaurar backups/stockly-20260811-163633.dump --a Stockly --forzar
```

**Por defecto no toca la base de la aplicación.** El ensayo hay que hacerlo a menudo —una copia que
no se ha restaurado nunca no es una copia, es un archivo— y el comando del ensayo no puede ser el
mismo que el del desastre.

Tras restaurar, el guion cuenta las filas de las siete tablas de negocio y las migraciones
aplicadas. Falta una comprobación que ninguna consulta hace, y es la que de verdad decide si la
copia sirve:

```bash
DATABASE_URL="postgresql://usuario:contraseña@localhost:5433/Stockly_restauracion" \
  pnpm exec prisma migrate status     # → «Database schema is up to date!»
```

### Recuperación completa, en orden

1. **Parar la aplicación**, no la base: `docker compose stop backend frontend`. Restaurar con el
   servidor escribiendo mezcla datos nuevos con los del volcado.
2. **Elegir el archivo** y comprobarlo antes de nada: `pg_restore --list <archivo> | head`.
3. **Restaurar** con `--forzar`, o mejor en una base nueva y renombrar después: deja la dañada a
   mano por si contenía algo posterior al volcado.
4. **Verificar** con `prisma migrate status` y con los recuentos que imprime el guion.
5. **Levantar** y confirmar con `/api/v1/ready`, que sondea la base de verdad — `/health` responde
   200 mientras el proceso viva, incluso con la base caída (T2-25).
6. **Anotar** en el registro de §5 qué se perdió y por qué.

## 5. Ensayo de restauración — registro

El criterio de aceptación de T4-05 no es que exista el procedimiento, sino que **se haya ejecutado
una restauración con éxito**. Esta es. Se repite el primer lunes de cada mes y se añade una fila.

| Fecha | Origen | Resultado |
|---|---|---|
| 2026-08-11 | `Stockly` en PostgreSQL 17.10 (`localhost:5433`), 31 MB | ✅ Ver detalle abajo |
| 2026-08-12 | `Stockly` en PostgreSQL 17.10 (`localhost:5433`), 81.1 KB de volcado | ✅ **restaurado en la pila del compose** (T4-13) |

**Detalle del ensayo del 2026-08-11.** Base de 31 MB → volcado de **76.7 KB** con 101 objetos en
**0.2 s**; restauración en una base nueva en **0.3 s**. Casi todo el tamaño de la base son índices,
que no se vuelcan: se reconstruyen al restaurar.

Comprobado, en este orden:

| Comprobación | Origen | Restaurada |
|---|---|---|
| `products` / `stock_movements` / `audit_logs` | 52 / 106 / 374 | **idénticas** |
| `sale_orders` / `purchase_orders` / `price_history` / `users` | 34 / 8 / 30 / 3 | **idénticas** |
| Migraciones aplicadas | 12 | 12 |
| `md5` del inventario (`id`+`stock`+`price` de las 52 filas) | `df86bea7…cebbc7ce` | **igual** |
| Tablas / índices / claves foráneas / enums | 16 / 46 / 12 / 6 | 16 / 46 / 12 / 6 |
| `pg_dump --schema-only`, comparado línea a línea | — | **idéntico** salvo el testigo aleatorio `\restrict` que 17.10 escribe en cada volcado |
| `prisma migrate status` | — | «Database schema is up to date!» |
| Integridad viva: un `INSERT` con `productId` inexistente | — | rechazado por `stock_movements_productId_fkey` |
| La aplicación real arrancada contra la copia | — | `GET /api/v1/ready` → **200** |

**Un detalle que ahorra un paso clásico:** las claves primarias son `text` (cuid de Prisma), no
`serial`. La base no tiene **ni una secuencia**, así que aquí no existe el `setval` de reajuste que
suele hacer falta tras restaurar y que, olvidado, hace que la primera escritura choque con una
clave duplicada.

## 6. Reversión

### De la aplicación

Las imágenes se reconstruyen desde git, así que revertir es volver a un commit y levantar:

```bash
git checkout <tag-o-commit-anterior>
docker compose up -d --build backend frontend
```

Con `pnpm verify` en verde antes de desplegar, el escenario que queda es el de la migración.

### De la base: **solo hacia adelante**

**Prisma no genera migraciones de bajada.** No hay `migrate down` y no lo va a haber: revertir un
esquema es escribir una migración nueva que deshaga la anterior. La regla operativa:

- **Una migración desplegada no se edita ni se borra.** `_prisma_migrations` guarda un `checksum`
  del SQL aplicado; tocar el archivo hace que `migrate deploy` se plante en el arranque, que es
  exactamente lo que debe hacer.
- **Para deshacer, se añade.** `pnpm db:migrate --name revertir_<lo_que_sea>` con el SQL inverso.
- **Lo que destruye datos no se revierte con SQL, se restaura.** Un `DROP COLUMN` desplegado se
  arregla desde el volcado de §4, no con un `ADD COLUMN`: la columna vuelve vacía.

Por eso las migraciones peligrosas se parten en dos despliegues (**expansiva → contractiva**):
primero se añade lo nuevo y el código escribe en los dos sitios; cuando la versión anterior ya no
está en pie, un segundo despliegue borra lo viejo. Entre los dos, revertir la aplicación es gratis,
porque el esquema sirve a las dos versiones. Renombrar una columna de golpe rompe la versión
anterior en cuanto se despliega, y entonces el rollback de aplicación ya no es una opción.

**Antes de cualquier despliegue con migración, una copia manual**: `pnpm db:backup`. Es el
único momento en que el RPO de 24 h se queda corto a propósito.

### Migraciones que mueven datos: comprobar después

Algunas migraciones no solo cambian el esquema, también reparten los datos que ya había. **Lo que
hicieron no se ve al aplicarlas**: `prisma migrate deploy` no enseña los avisos de PostgreSQL, así
que su recuento se consulta a mano después de desplegar.

**T5-06 — clientes.** La migración crea un cliente por cada correo distinto de las órdenes de
venta y las vincula. Las órdenes sin correo se quedan sin cliente, a propósito: no se agrupa por
nombre. Cuántas quedaron de cada lado:

```sql
-- T5-06: órdenes vinculadas a un cliente, órdenes sin cliente y clientes creados
SELECT
    (SELECT COUNT(*) FROM "sale_orders" WHERE "customerId" IS NOT NULL) AS vinculadas,
    (SELECT COUNT(*) FROM "sale_orders" WHERE "customerId" IS NULL) AS sin_cliente,
    (SELECT COUNT(*) FROM "customers") AS clientes;
```

`src/tests/clientes-migracion.test.ts` ejecuta esta misma consulta: si se edita aquí, se prueba.
Sobre los datos del seed antes de T5-06, la migración vinculó **las 4 órdenes a 4 clientes**
(2026-09-30); todas tenían correo.

**T5-14 — varios almacenes.** La migración crea un almacén, «Principal», y le asigna todo lo que
ya había: el stock de cada producto, sus movimientos, las órdenes y los conteos. **Se aplica con
la aplicación parada**: reescribe `stock_movements` entera, con la tabla bloqueada, y sobre
1,2 millones de movimientos tardó 77 s ([rendimiento.md §15](rendimiento.md)). Después, que el
total no haya cambiado y que cuadre:

```sql
-- T5-14: el total de antes es el de los niveles, y ningún producto descuadra
SELECT
    (SELECT SUM("stock") FROM "products") AS total,
    (SELECT SUM("stock") FROM "stock_levels") AS en_almacenes,
    (SELECT COUNT(*) FROM "products" p
       LEFT JOIN (SELECT "productId", SUM("stock") AS suma FROM "stock_levels" GROUP BY 1) l ON l."productId" = p."id"
      WHERE p."stock" <> COALESCE(l.suma, 0)) AS descuadrados,
    (SELECT COUNT(*) FROM "warehouses" WHERE "isDefault") AS predeterminados;
```

`total` y `en_almacenes` tienen que coincidir, `descuadrados` ser 0 y `predeterminados`, 1. Medido
el 2026-10-10: 14 940 100 = 14 940 100 sobre la base de carga, y 975 = 975 sobre la de desarrollo.
El almacén se puede renombrar después desde la pantalla de almacenes.

**Y no es una migración expansiva: después de aplicarla, volver a la versión anterior de la
aplicación no funciona.** El código anterior escribe el stock en un solo sitio y movimientos sin
almacén; la base rechaza las dos cosas —una por el disparador, otra por la columna obligatoria—.
Partirla en dos despliegues no lo arreglaba: lo que hace incompatible a la versión anterior es
justo la guarda que se quiere tener. **Revertir este despliegue es restaurar la copia de antes**
(§4), y por eso aquí el `pnpm db:backup` previo no es una recomendación.

**El disparador que impide el descuadre no lo conoce `schema.prisma`**: vive en el SQL de esa
migración. Restaurar un volcado lo trae; `prisma db push` contra una base vacía, no. Para saber
si una base lo tiene: `SELECT tgname FROM pg_trigger WHERE tgname LIKE '%cuadra'` —dos filas—.

**T5-15 — lotes y caducidad.** No mueve datos: añade `products.tracksLots` (a `false` en todo el
catálogo), `stock_levels.lotId` y `stock_movements.lotId` (vacías), y las tablas `lots` y
`sale_order_item_lots`. Todo el stock se queda en su fila de siempre, que pasa a ser la de «sin
lote». Sobre la base de carga, 2,6 s ([rendimiento.md §16](rendimiento.md)). **Tampoco es
expansiva, y se aplica con la aplicación parada**: cambia el índice único de `stock_levels` de
`(producto, almacén)` a `(producto, almacén, lote)`, y la versión anterior de la aplicación
escribe cada nivel con `ON CONFLICT` sobre el que desaparece —toda entrada de stock daría 500—.
A diferencia de `T5-14`, esta **debería** tener vuelta atrás sin restaurar mientras nadie haya
creado un lote: reponiendo el índice anterior, la biblioteca de stock de la versión anterior
funciona contra el esquema nuevo —así se midió el «antes» de [rendimiento.md §16](rendimiento.md)—.
**No se ha ensayado con la aplicación anterior entera**, así que el camino seguro sigue siendo
la copia previa. Con lotes creados ya no hay otro: dos filas del mismo producto y almacén no
caben en el índice de antes.

```sql
-- T5-15: el total sigue cuadrando, y el índice único trata dos «sin lote» como la misma fila
SELECT
    (SELECT SUM("stock") FROM "products") AS total,
    (SELECT SUM("stock") FROM "stock_levels") AS en_almacenes,
    (SELECT i.indnullsnotdistinct FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = 'stock_levels_productId_warehouseId_lotId_key') AS sin_lote_es_una_fila;
```

`sin_lote_es_una_fila` tiene que ser `true`. Es lo segundo que `schema.prisma` no sabe expresar:
el índice es `NULLS NOT DISTINCT`, y sin eso cada entrada de un producto sin lotes crearía una
fila nueva en vez de sumar a la suya. Pide **PostgreSQL 15 o posterior** (§9: el proyecto fija la 17).

## 7. Trampas ya pagadas

Las cuatro se encontraron montando esto, y las cuatro fallan en silencio o con un mensaje que
apunta a otro sitio.

- **El `DATABASE_URL` del `.env` no le vale a `pg_dump`.** La contraseña de este proyecto lleva una
  `@` sin codificar: Prisma la admite —tiene su propio analizador— y libpq no, que parte por la
  **primera** `@` y termina buscando un socket llamado `@localhost`. El error no menciona la
  contraseña. Los guiones lo resuelven con `new URL()`, que parte por la última y devuelve la
  contraseña ya codificada; si hay que escribir la URL a mano en otro sitio, la `@` va como `%40`.
- **`pg_restore` termina con código 0 aunque haya errores.** Por defecto continúa tras cada fallo, y
  una restauración a medias se anuncia como buena. Los guiones pasan `--exit-on-error`.
- **La versión del cliente no da igual.** Uno más antiguo que el servidor se niega en seco —eso se
  ve—, pero uno más **nuevo** vuelca sin protestar y puede meter sintaxis que el servidor de destino
  no entienda; el problema aparece al restaurar. `scripts/postgres.js` elige el cliente que coincide
  con la versión mayor del servidor y avisa si no lo encuentra. En Windows el instalador **no** deja
  las herramientas en el `PATH`; ahí está la autodetección de `C:\Program Files\PostgreSQL\*\bin`.
- **`dropdb` se queda esperando** si alguien tiene la base abierta —un Prisma Studio olvidado, el
  `pnpm dev`—, y parece que la restauración se ha colgado. Se usa `--force`.

---

## 8. Monitorización y alertas (T4-06)

Antes de esto, un incidente en producción se detectaba de una sola forma: alguien lo
contaba. La respuesta tiene **dos capas que no se sustituyen**, y conviene entender por qué
antes de quitar una.

| | Alerta en proceso | Prometheus + Alertmanager |
|---|---|---|
| Dónde vive | Dentro del backend, `src/shared/lib/alertas5xx.ts` | Dos contenedores aparte |
| Qué detecta | Un pico de 5xx, contando sucesos | 5xx, latencia, bucle de eventos y **el servicio caído** |
| Cuánto tarda | Inmediato: al 5.º error de la ventana | ~8 min y medio desde el primer error *(medido, ver abajo)* |
| Qué no puede hacer | Avisar de que el proceso ha muerto — un proceso muerto no manda correos | Nada, si nadie la despliega |
| Requisitos | Ninguno | Infraestructura que hay que mantener |

### La capa que no depende de nada

El backend cuenta sus propios 5xx en una ventana deslizante. Al cruzar el umbral escribe
una línea de nivel `error` con el marcador `alerta: "pico_5xx"` —las rutas afectadas y un
`requestId` con el que recuperar la traza entera (T2-10)— y **avisa por correo a los
administradores**, por el mismo camino que la alerta de bajo stock.

| Variable | Por defecto | Qué es |
|---|---|---|
| `ALERTA_5XX_HABILITADA` | `true` *(en `test`, `false`)* | Apagarla del todo |
| `ALERTA_5XX_UMBRAL` | `5` | Errores que disparan el aviso |
| `ALERTA_5XX_VENTANA_MIN` | `5` | Ventana deslizante, en minutos |
| `ALERTA_5XX_ENFRIAMIENTO_MIN` | `30` | Silencio tras un aviso |

El enfriamiento no es un detalle: una avería real produce cientos de 5xx por minuto y sin
él el aviso útil queda enterrado bajo sus propias repeticiones. En `test` viene apagada
porque el `.env` trae credenciales SMTP de verdad y cualquier suite que provoque un 500
acabaría enviando correo.

### `/metrics`

`GET /api/v1/metrics` expone el formato de Prometheus: `http_requests_total`,
`http_request_duration_seconds` (histograma), `http_server_errors_total` y las métricas del
proceso —retraso del bucle de eventos, montón, recolector de basura—, que son las que
distinguen «la API va lenta» de «la base va lenta».

**Está protegido, y por defecto cerrado en producción.** Con `METRICS_TOKEN` configurado
exige `Authorization: Bearer`; sin él, en producción responde **404** —no 401: confirmar
que la ruta existe ya es media pista—. Un despliegue que se olvide del token se queda sin
métricas, que se nota; el descuido contrario no se notaría nunca.

Las etiquetas usan la **plantilla** de la ruta (`/api/v1/products/:id`), nunca la URL
pedida. Con la URL, cada identificador crearía una serie temporal nueva y cualquiera desde
fuera podría hacer crecer la memoria del proceso pidiendo URLs inventadas.

### La capa que mira desde fuera

```bash
# 1. Preparar lo que no se versiona (ni Prometheus ni Alertmanager expanden ${VARIABLES})
cp observabilidad/alertmanager.example.yml observabilidad/alertmanager.yml   # y rellenar los CAMBIAR_*
mkdir -p observabilidad/secretos
printf %s "$METRICS_TOKEN" > observabilidad/secretos/metrics-token
printf %s "$SMTP_PASS"     > observabilidad/secretos/smtp-password

# 2. Levantar
docker compose -f docker-compose.yml -f docker-compose.observabilidad.yml up -d
```

**El paso 1 no se puede saltar «para probar».** Docker no falla cuando el origen de un
*bind mount* no existe: **lo crea como directorio vacío**. La pila levanta, Prometheus monta
una carpeta sin `metrics-token`, el raspado sale 404 y el objetivo aparece caído — el
síntoma apunta a la API, no al montaje. En Windows deja además rastro en el repositorio: la
traducción de rutas mete el sufijo del montaje en el nombre y aparecen carpetas como
`observabilidad;O` (de `:ro`) en la raíz. Están vacías y no las ve `git status` —git no
registra directorios vacíos—, así que sobreviven a cualquier limpieza que se guíe por él.

Prometheus queda en `127.0.0.1:9090` y Alertmanager en `127.0.0.1:9093`, **solo en el bucle
local**: la interfaz de Prometheus no tiene autenticación y enseña el tráfico entero del
servicio. Para verla desde fuera, un túnel SSH.

Las cinco reglas están en [`observabilidad/alertas.yml`](../observabilidad/alertas.yml):
servicio caído, proporción de 5xx por encima del 5 %, sonda de base de datos en 503, p95 de
latencia por encima de 1 s y bucle de eventos atascado.

### Las reglas están probadas, no solo escritas

Una regla de alerta es código que **solo se ejecuta el día del incidente**: un `job=` mal
escrito o un umbral con el signo cambiado no se descubre hasta que hace falta, y ese día lo
que se nota es el silencio, indistinguible de que todo va bien.

```bash
docker run --rm --entrypoint promtool -v "$PWD/observabilidad:/o" \
  prom/prometheus:v3.1.0 test rules /o/pruebas-alertas.yml     # → SUCCESS
```

[`pruebas-alertas.yml`](../observabilidad/pruebas-alertas.yml) reproduce series sintéticas y
comprueba las dos mitades: que la alerta **dispara** con un 20 % de errores y que **no**
dispara con tráfico sano. De ahí sale un dato que a ojo no se ve: entre el primer 5xx y la
alerta pasan ~8 min y medio, y el `for: 2m` solo explica dos de ellos — el resto lo pone la
ventana de `rate(...[5m])`, que arrastra los minutos sanos anteriores. **Ese hueco es
exactamente lo que cubre la alerta en proceso.**

### Agregación de logs

No hay agregador desplegado, y no hace falta añadir nada al código para ponerlo: desde
T2-10 los logs de producción ya salen en **JSON por línea** con nivel, `requestId` y
credenciales censuradas, que es lo que cualquier recolector espera. Basta apuntar el que se
use (Loki, Vector, el agente del proveedor) a la salida estándar del contenedor. El campo
sobre el que alertar sin depender de Prometheus es `alerta: "pico_5xx"`.

---

## 9. La versión de PostgreSQL (T4-13)

**El compose levanta `postgres:17-alpine`.** Hasta el 2026-08-12 levantaba `16-alpine` mientras el
servidor de desarrollo del proyecto era **17.10**, y esa diferencia convertía cada copia de
seguridad en un archivo que no se podía restaurar en la pila.

**La regla, y su dirección:** `pg_restore` solo va **hacia adelante**. Un volcado de 16 entra en un
servidor 17; uno de 17 **no entra** en un 16. De ahí la regla que sigue el proyecto:

> La imagen del `docker-compose.yml` **nunca por debajo del servidor más nuevo** que se use en
> cualquier equipo del proyecto. Subirla es barato; descubrir que no se puede restaurar, no.

**Cómo se manifestaba, medido** —volcado de 17.10 restaurado a mano en un `postgres:16-alpine`
desechable—:

```
pg_restore: error: could not execute query: ERROR:  unrecognized configuration parameter "transaction_timeout"
La orden era: SET transaction_timeout = 0;
```

`transaction_timeout` es un parámetro que aparece en PostgreSQL 17. **El error no menciona la
versión por ningún lado**, y llega con la base de destino ya borrada y recreada: el día de la
recuperación, eso son horas de depurar lo que no es.

**Por eso `pnpm db:restaurar` lo comprueba antes de tocar nada.** Lee la versión de la cabecera del
volcado (`pg_restore -l`, que no necesita servidor), la compara con la del destino y **aborta sin
haber borrado la base**:

```
✗ el volcado viene de PostgreSQL 17 y este servidor es 16.
  pg_restore no va hacia atrás: la restauración fallaría a medias, con la base de
  destino ya borrada. No se ha tocado nada.
```

Si no puede saberlo —un volcado sin esa línea, un servidor que no responde— **avisa y deja pasar**,
el mismo criterio que la auditoría de dependencias: «no se puede saber» no es «hay un problema».

### Subir la versión de la imagen

Cambiar el número de `image:` **no basta y no es inocuo**: PostgreSQL se niega a arrancar sobre un
directorio de datos de otra versión mayor, y el contenedor entra en bucle de reinicio con
`database files are incompatible with server`. El ciclo completo, con la pila en marcha:

```bash
cd Stockly-B
pnpm db:backup                    # ① la copia va del servidor de desarrollo, no del contenedor
docker compose down -v            # ② -v borra el volumen: es lo que exige el cambio de versión
# editar `image:` en docker-compose.yml
docker compose up -d              # ③ inicializa un directorio de datos nuevo
pnpm db:restaurar backups/<archivo>.dump --a Stockly --forzar
```

**El `-v` del paso ② borra los datos**, así que el ① no es opcional. En una máquina de producción
la alternativa es `pg_upgrade` con los dos binarios instalados; para este proyecto, donde la pila
del compose se recrea a diario, el ciclo de volcado y restauración es más corto y se comprueba solo.

**Ejecutado el 2026-08-12** en este equipo: volcado de 17.10 (81.1 KB, 102 objetos) restaurado en la
pila ya sobre `postgres:17-alpine` en **0.2 s**, con las siete tablas y las 13 migraciones
completas; después, seed, `/health` 200, `/ready` 200 y login hasta el dashboard.

---

## 10. El resumen semanal por correo (T5-11)

Cada administrador activo recibe, en su idioma, lo vendido la **semana natural anterior** —de lunes
a domingo, en la zona horaria del negocio— y lo que sigue pendiente hoy: productos en stock bajo,
ventas sin enviar y compras fuera de plazo. **El backend no tiene planificador**: el correo lo
envía un comando que se programa desde fuera, igual que la copia de §3. Dentro del proceso, saldría
una vez por réplica en cuanto hubiera más de una.

```bash
pnpm resumen:enviar                  # en desarrollo
node dist/cli/resumen-semanal.js     # en producción, tras `pnpm build`: ahí no hay `tsx`
```

**Antes de programarlo:** activar *Resumen semanal por correo* en **Configuración** —está apagado
por defecto— y tener el SMTP configurado. Con el ajuste apagado el comando no envía nada y sale
con 0, así que se puede dejar programado y encenderlo después.

### Programarlo

Los lunes por la mañana, con la semana recién cerrada. La hora es la del servidor; lo que decide
qué semana se resume es la zona del negocio.

**Linux / producción** — `crontab -e`, los lunes a las 08:00:

```cron
0 8 * * 1 cd /ruta/a/Stockly-B && /usr/bin/node dist/cli/resumen-semanal.js >> /var/log/stockly-resumen.log 2>&1
```

**Windows** — Programador de tareas, en una línea:

```powershell
schtasks /create /tn "Stockly resumen" /tr "cmd /c cd /d C:\ruta\a\Stockly-B && node dist\cli\resumen-semanal.js" /sc weekly /d MON /st 08:00
```

**Con la pila en contenedores**, dentro del servicio `backend`, que ya tiene el `.env` y el código compilado:

```bash
docker compose exec -T backend node dist/cli/resumen-semanal.js
```

### Qué pasa si se lanza de más, o si falla

| Situación | Qué hace | Sale con |
|---|---|---|
| El ajuste está apagado | Nada | 0 |
| Ya se envió el de esa semana | Nada: es **un resumen por semana**, se lance el día que se lance | 0 |
| Otra ejecución lo está enviando | Nada | 0 |
| Falló el envío a algún administrador | Lo dice. **Al repetir el comando se reintenta solo con ese** | 1 |
| Activado, pero sin SMTP configurado | Dice qué variables faltan, sin reclamar la semana | 1 |
| Se dio de alta un administrador después | Al repetirlo, lo recibe solo él | 0 |

El código de salida distinto de cero es lo que tiene que vigilar el planificador. La tabla
`weekly_digests` guarda una fila por semana enviada y a qué usuarios les llegó; una ejecución que
muere a medias deja la semana reclamada **15 minutos**, y después cualquier otra la retoma.

**Programarlo a diario no manda un correo diario**: los seis días restantes sale con «ya se envió».
Es la forma barata de que una semana en la que el servidor estuvo apagado el lunes no se quede sin
resumen.
