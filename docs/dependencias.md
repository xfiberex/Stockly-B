# Dependencias: vulnerabilidades y licencias

Análisis de composición de los dos repositorios (T4-07): lo que se despliega y no es código propio.

**Recuentos del 2026-10-05.** Envejecen con cada `pnpm install`; lo que no envejece es la puerta
del §4, que lo vuelve a comprobar en cada `pnpm verify`.

---

## 1. Qué se mira y qué no

Solo **dependencias de producción** (`--prod`). Las de desarrollo no se despliegan: una
vulnerabilidad en `eslint` no es alcanzable desde fuera, y meterlas en la puerta la llenaría de un
ruido que acabaría desactivándola.

| | Stockly-B | Stockly-F |
|---|---|---|
| Dependencias directas de producción | 21 | 18 |
| Árbol de producción (`pnpm licenses list --prod`) | **159** paquetes | **114** paquetes |
| Licencias distintas | 8 | 8 |
| Vulnerabilidades conocidas, en cualquier severidad | 0 | 0 |

**Fuera del alcance de esta herramienta**, y conviene no confundirlo con «revisado»: la imagen
base de Docker (`node:22-alpine`) y su sistema, PostgreSQL, y las acciones y binarios del entorno
de desarrollo. `pnpm audit` mira el registro de npm y nada más.

---

## 2. Vulnerabilidades: qué hacer cuando la puerta se pone roja

**Un árbol limpio no se queda limpio solo.** Sin tocar una dependencia, `verify` amaneció en rojo
el 2026-09-13 —diez avisos altos, dos semanas— y otra vez el 2026-09-30, en los dos repositorios.
El patrón que salió de ahí:

1. **Directa, y hay arreglo en la misma versión mayor:** se sube. Así se resolvieron `multer` y
   `axios`.
2. **Directa, y la rama actual no recibe el arreglo:** salto de mayor, leyendo antes qué rompe.
   `nodemailer` pasó de la 9 a la 10 porque su única ruptura era exigir Node 20, y el proyecto usa
   22; `smtp-tls.test.ts` ejercita el transporte real, sin mock.
3. **Transitiva con un rango que ya admite la versión corregida:** `pnpm update <paquete>`. Fue el
   caso de `ip-address`.
4. **Transitiva que su dueño fija a versión exacta:** `overrides` en `pnpm-workspace.yaml`. Subir
   al dueño no sirve si la versión nueva la sigue fijando.
5. **No tomar una versión publicada hace horas.** Es justo lo que la cadena de suministro
   aconseja dejar reposar: se toma la anterior que ya lleve el arreglo.

**Cada `override` es deuda**, y el comentario del propio archivo dice cuándo retirarlo. Hoy hay
cuatro: `mysql2`, `deepmerge-ts` y `fast-uri`, que cuelgan del CLI de Prisma, y `qs`, de express.
El CLI se poda de la imagen (§5), pero `pnpm why <paquete> --prod` lo sigue alcanzando a través de
`@prisma/client`, así que la auditoría lo cuenta. Al subir Prisma o express, se mira con ese
comando si ya traen la versión corregida.

---

## 3. Licencias

**No hay GPL, LGPL, AGPL ni SSPL en ninguno de los dos árboles**: ninguna dependencia de
producción impone condiciones sobre la licencia del producto. Todas son compatibles con la
AGPL v3 de Stockly.

| Licencia | Stockly-B | Stockly-F |
|---|---:|---:|
| MIT | 133 | 94 |
| ISC | 8 | 13 |
| Apache-2.0 | 11 | 1 |
| BSD-3-Clause | 3 | 2 |
| BSD-2-Clause · MIT-0 · 0BSD · «(MIT AND Zlib)» | 1 cada una | — |
| MPL-2.0 · OFL-1.1 · «MIT AND ISC» · «(MIT OR CC0-1.0)» | — | 1 cada una |

### Las que no son permisivas sin más

- **OFL-1.1 — `@fontsource/inter`** (frontend, directa). **Traía una obligación que no se estaba
  cumpliendo**: los `.woff2` de Inter se copian a `dist/`, así que la aplicación distribuye la
  tipografía y la OFL exige que el aviso de licencia la acompañe.
- **MPL-2.0 — `lightningcss`** (frontend, transitiva). Copyleft por archivo, y además es una
  herramienta de compilación: su código no viaja al navegador.
- **«(MIT OR CC0-1.0)» — `type-fest`** (frontend, transitiva de `zxing-wasm`). Doble licencia a
  elegir; se toma la MIT. Solo trae tipos.
- **El `.wasm` del escáner es ZXing-C++, que es Apache-2.0**, aunque `zxing-wasm` declare MIT —la
  de sus enlaces en JavaScript—. `pnpm licenses` no puede saberlo: `scripts/auditoria.js` lleva
  una lista `EMBEBIDOS` con lo que viaja dentro de otro paquete.

### El aviso de terceros

`Stockly-F/public/AVISOS-DE-TERCEROS.txt` recoge el texto de la licencia de cada paquete de
producción, y `public/` se copia tal cual a `dist/`: el aviso queda servido junto a la aplicación.

```bash
pnpm auditoria --informe          # en Stockly-F
```

**Hay que regenerarlo cuando cambien las dependencias.** No está atado al `build` a propósito: un
`build` que escribe en el árbol de fuentes ensucia cualquier comprobación de que el repositorio
está limpio. Los paquetes que no incluyen el texto de su licencia se listan como tales, en lugar
de inventarlo. El backend no genera un archivo equivalente: cada paquete lleva su licencia dentro
de `node_modules`, que viaja en la imagen ([legal.md §2.5](legal.md)).

---

## 4. La puerta automática

`pnpm verify` termina en `pnpm auditoria` en los dos repositorios
([backend](../scripts/auditoria.js), [frontend](../../Stockly-F/scripts/auditoria.js)).

| Comprobación | Necesita red | ¿Rompe la compilación? |
|---|---|---|
| Vulnerabilidad **alta o crítica** en producción | Sí | **Sí** |
| Vulnerabilidad moderada, baja o informativa | Sí | No, se informa |
| Licencia fuera de la lista permitida | No | **Sí** |
| No se pudo auditar (sin red) | — | No, avisa. Con `--estricto`, sí |

- **El corte está en «alta» a propósito.** Una puerta que salta con cualquier aviso de severidad
  baja se acaba desactivando.
- **Sin red avisa y deja pasar**, porque «no se puede saber» no es «hay un problema»: una puerta
  que se pone roja sin conexión se acabaría esquivando. Antes de publicar,
  `pnpm auditoria --estricto`.
- **La comprobación de licencias es dura y no depende de la red**: sale del lockfile. Una
  dependencia nueva con una licencia que no esté en la lista para la compilación hasta que
  alguien la mire.
- **La lista permitida es de cada repositorio** (`LICENCIAS_PERMITIDAS` en su
  `scripts/auditoria.js`), y son distintas a propósito: una común sería la unión de las dos y
  dejaría pasar en un repositorio lo que solo se revisó para el otro.

**La trampa que hubo que esquivar:** `pnpm audit --json` con el registro caído puede imprimir un
informe con las cinco severidades a cero. La auditoría que nunca se hizo se lee igual que la que
salió limpia; lo que las separa es la clave `error` del JSON, no el código de salida.

**Lo vigila** `src/tests/auditoria.test.ts`, en los dos repositorios, con informes fabricados: con
el árbol limpio, ejecutar el guion sale en verde tanto si la puerta funciona como si no comprueba
nada, así que solo se demuestra dándole una vulnerabilidad alta de mentira y una GPL.

---

## 5. El CLI de Prisma y la imagen de producción (T4-14)

El hallazgo: la imagen del backend llevaba dentro una interfaz gráfica (`@prisma/studio-core`,
42 MB, con la única EPL-2.0 del proyecto), `effect`, TypeScript y un PostgreSQL para navegador.
Nada de eso lo ejecuta un servidor.

**La causa no era que `prisma` estuviera en `dependencies`.** `@prisma/client` declara `prisma` y
`typescript` como *peers* opcionales y pnpm los instala solos: bajarlo a `devDependencies` dejaba
el árbol exactamente igual, medido en un contenedor limpio.

**Cómo se quitó:** las migraciones salen del `CMD` a un servicio `migrate`, que corre antes y
termina, y el árbol se poda con [`scripts/podar-produccion.js`](../scripts/podar-produccion.js),
que corta los dos *peers* y barre lo que deja de ser alcanzable desde los enlaces de la raíz.
Resultado: **1.81 GB → 426 MB** y **313 → 183 paquetes**.

- **Es una regla, no una lista.** La primera versión enumeraba paquetes y dejaba 292 de las 313
  entradas, porque las transitivas del CLI no estaban en ella; y una lista escrita a mano envejece
  con la siguiente versión de Prisma.
- **Podar en un `RUN` posterior al `install` no encoge la imagen**: la capa de abajo viaja igual.
- **Lo que hay en la imagen y lo que cuenta la puerta son medidas distintas.** La puerta mira el
  grafo declarado; los paquetes de la imagen se cuentan en el `build`. Auditar de más es lo
  correcto.

---

## 6. La licencia del proyecto

Desde el 2026-09-30 es la **AGPL-3.0-only** ([ADR 0009](adr/0009-licencia-agpl.md)): `LICENSE`
con el texto oficial y `"license": "AGPL-3.0-only"` en los dos `package.json`. Antes fue MIT, y
antes de T4-07 el `package.json` del backend declaraba ISC con un archivo `LICENSE` que era MIT:
la clase de incoherencia que no molesta hasta que alguien pregunta bajo qué licencia se
distribuye esto. Lo que la licencia no cubre, en [legal.md](legal.md).

---

## 7. Repetir el análisis

```bash
pnpm auditoria                # informe y puerta, en cualquiera de los dos repositorios
pnpm auditoria --estricto     # sin red es fallo, no aviso — antes de publicar
pnpm auditoria --informe      # regenera AVISOS-DE-TERCEROS.txt (solo Stockly-F)

pnpm audit --prod             # el detalle, cuando la puerta se pone roja
pnpm licenses list --prod     # el listado completo por licencia
pnpm why <paquete> --prod     # de dónde sale una dependencia que no esperabas
```
