# Operaciones — copia de seguridad, restauración, reversión y alertas

> **T4-05** y **T4-06.** Este documento cubre lo que hay que hacer **cuando algo ya ha pasado**:
> enterarse (§8), recuperar la base de datos y deshacer un despliegue. El arranque normal está en
> [README-proyecto.md](README-proyecto.md); la puerta de calidad, en
> [CONTRIBUTING.md](../CONTRIBUTING.md).

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

Con `pnpm verify` en verde antes de desplegar (`prisma generate → migrate deploy → check →
test:coverage → build → smoke`), el escenario que queda es el de la migración.

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

> ⚠️ **Discrepancia de versión abierta.** El servidor de desarrollo de este equipo es **PostgreSQL
> 17.10** y el `docker-compose.yml` levanta **`postgres:16-alpine`**. Un volcado tomado de 17 **no
> se restaura** en un servidor 16: es un fallo duro, y aparece el día de la recuperación. No se
> arregla desde esta tarea porque cambiar la imagen del compose invalida el directorio de datos del
> volumen existente y exige `pg_upgrade` o un ciclo de volcado y restauración. → **T4-13**.
