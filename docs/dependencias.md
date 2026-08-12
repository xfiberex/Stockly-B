# Dependencias: vulnerabilidades y licencias

Análisis de composición de los dos repositorios (T4-07). La auditoría del 2026-08-04 dejó
esta zona sin cubrir: se revisó el código propio, no el ajeno, que es la mayor parte de lo
que se despliega.

**Fecha del análisis:** 2026-08-11. Los recuentos envejecen con cada `pnpm install`; lo que
no envejece es la puerta automática de la sección 5, que vuelve a comprobarlo en cada
`pnpm verify`.

---

## 1. Qué se mira y qué no

Solo **dependencias de producción** (`--prod`). Las de desarrollo no se despliegan: una
vulnerabilidad en `eslint` no es alcanzable por nadie desde fuera, y meterlas en la puerta
la llenaría de ruido que acabaría desactivándola.

| | Stockly-B | Stockly-F |
|---|---|---|
| Dependencias directas de producción | 23 | 16 |
| Árbol completo de producción | **296** paquetes | **118** paquetes |
| Licencias distintas | 11 | 7 |

**Fuera del alcance de esta herramienta**, y conviene no confundirlo con «revisado»:

- La **imagen base de Docker** (`node:22-alpine`) y el sistema que trae. `pnpm audit` mira
  el registro de npm y nada más.
- **PostgreSQL**, que corre como servicio aparte.
- Las **acciones y binarios** del entorno de desarrollo.

---

## 2. Vulnerabilidades

```
Stockly-B  crítica 0, alta 0, moderada 0, baja 0, info 0   (296 paquetes)
Stockly-F  crítica 0, alta 0, moderada 0, baja 0, info 0   (118 paquetes)
```

Ninguna, en ninguna severidad. Ayuda que las dependencias se subieran hace poco: la propia
`pnpm` pasó de 11.2.2 a 11.21.0 el 2026-08-09 precisamente por avisos de path traversal y de
ejecución de *lifecycle scripts*.

---

## 3. Licencias

**No hay GPL, LGPL, AGPL ni SSPL en ninguno de los dos árboles.** Es el resultado que
importa: ninguna dependencia de producción impone condiciones sobre la licencia del producto.

### Stockly-B (296 paquetes)

| Licencia | Paquetes |
|---|---:|
| MIT | 230 |
| ISC | 27 |
| Apache-2.0 | 26 |
| BSD-3-Clause | 5 |
| Unlicense | 2 |
| BSD-2-Clause, EPL-2.0, MIT-0, 0BSD, «MIT and ISC», «(MIT AND Zlib)» | 1 cada una |

### Stockly-F (118 paquetes)

| Licencia | Paquetes |
|---|---:|
| MIT | 98 |
| ISC | 13 |
| BSD-3-Clause | 2 |
| MPL-2.0 | 2 |
| Apache-2.0, OFL-1.1, «MIT AND ISC» | 1 cada una |

### Las tres que no son permisivas sin más

**EPL-2.0 — `elkjs`** (Stockly-B, transitiva). Copyleft **por archivo**: la obligación se
dispara al modificar los archivos de la propia biblioteca, no al depender de ella. No se
toca su código. Llega por una cadena que merece su propia nota, la sección 4.

**MPL-2.0 — `lightningcss`** (Stockly-F, transitiva). Mismo tipo de copyleft por archivo, y
además es una herramienta de compilación dentro de la cadena de Tailwind/Vite: su código no
viaja en el paquete que se sirve al navegador.

**OFL-1.1 — `@fontsource/inter`** (Stockly-F, directa). **Esta sí traía una obligación que
no se estaba cumpliendo.** Los `.woff2` de Inter se copian a `dist/`, así que la aplicación
distribuye la tipografía, y la OFL exige que el aviso de licencia la acompañe. Lo mismo vale,
en menor grado, para la MIT: *«this permission notice shall be included in all copies or
substantial portions of the Software»*, y el paquete de JavaScript es exactamente eso.

Resuelto generando `Stockly-F/public/AVISOS-DE-TERCEROS.txt` —118 paquetes con el texto de
su licencia, unos 290 KB— con:

```bash
pnpm auditoria --informe          # en Stockly-F
```

`public/` se copia tal cual a `dist/`, así que el aviso queda servido junto a la aplicación
y no olvidado en el repositorio. **Hay que regenerarlo cuando cambien las dependencias:** no
está atado al `build` a propósito, porque un `build` que escribe en el árbol de fuentes
ensucia cualquier comprobación de que el repositorio está limpio.

Cinco de los 118 paquetes no incluyen el texto de su licencia; el aviso lo dice en lugar de
inventarlo.

---

## 4. Hallazgo: el CLI de Prisma viaja en la imagen de producción

> **Resuelto en T4-14 (2026-08-12), y con la causa distinta de la que se escribió aquí.** Lo
> que sigue es el hallazgo original; la corrección va debajo.

`prisma` está en `dependencies`, no en `devDependencies`, y **está puesto ahí a propósito**:
el contenedor arranca con `prisma migrate deploy && node dist/server.js`, así que el CLI
tiene que estar en la imagen. Está documentado en el `Dockerfile`.

Lo que no era evidente es el precio. `prisma` arrastra `@prisma/studio-core`, que es una
interfaz gráfica, y con ella su árbol de gráficos y diagramas: `elkjs`, `@visx/vendor`,
`robust-predicates`. **Ahí está la única EPL-2.0 del proyecto**, y buena parte de la
diferencia entre 296 paquetes de producción y los ~100 que necesita el servidor para
funcionar.

### La corrección (T4-14)

**No era por estar en `dependencies`.** `@prisma/client` declara `prisma` —y `typescript`—
como **peers opcionales**, y pnpm los instala solos. Bajar `prisma` a `devDependencies` deja
el árbol **exactamente igual**, y está medido: `pnpm install --prod` en un contenedor limpio
da **313 paquetes con los dos manifiestos**. El remedio que proponía la ficha, por sí solo,
no habría cambiado nada — y encima habría roto el `CMD`, porque el CLI deja de enlazarse.

Lo que sí viajaba, medido dentro de la imagen:

| Paquete | Tamaño | Qué es |
|---|---:|---|
| `@prisma/studio-core` | 42 MB | una interfaz gráfica, con React y sus diagramas (`elkjs` ← **la única EPL-2.0**) |
| `effect` | 34 MB | vía `@prisma/config` |
| `typescript` | 24 MB | peer de tipos; el servidor ejecuta JavaScript compilado |
| `@electric-sql/pglite` | 23 MB | un PostgreSQL para el navegador, vía `@prisma/dev` |
| `@prisma/dev` | 18 MB | se llama «dev» |

**Cómo se quitó:** las migraciones salen del `CMD` a un servicio `migrate` que corre antes y
termina, y el árbol se poda con
[`scripts/podar-produccion.js`](../scripts/podar-produccion.js), que **corta los dos peers y
barre lo que deja de ser alcanzable** desde los enlaces de la raíz. Resultado: **1.81 GB → 426
MB** y **313 → 183 paquetes**.

> **Por qué una regla y no una lista.** La primera versión enumeraba paquetes: recortaba
> tamaño pero dejaba **292 de 313 entradas**, porque las transitivas del CLI no estaban en la
> lista. Y una lista escrita a mano envejece con la siguiente versión de Prisma sin que nadie
> se entere.

### Lo que esto **no** cambia: la cifra de la puerta

`pnpm auditoria` sigue diciendo **296 paquetes de producción**, y no es un descuido. Mide el
grafo **declarado** —lo que `pnpm licenses list --prod` resuelve, peers incluidos—, que es un
**superconjunto** de lo que acaba en la imagen. Para una puerta de vulnerabilidades y
licencias eso es lo correcto: audita de más, nunca de menos. Los 183 de la imagen son otra
medida, y se toma en el `build`.

---

## 5. La puerta automática

`pnpm verify` termina en `pnpm auditoria` en los dos repositorios
([`Stockly-B/scripts/auditoria.js`](../scripts/auditoria.js),
[`Stockly-F/scripts/auditoria.js`](../../Stockly-F/scripts/auditoria.js)).

| Comprobación | Necesita red | ¿Rompe la compilación? |
|---|---|---|
| Vulnerabilidad **alta o crítica** en producción | Sí | **Sí** |
| Vulnerabilidad moderada, baja o informativa | Sí | No, se informa |
| Licencia fuera de la lista permitida | No | **Sí** |
| No se pudo auditar (sin red) | — | No, avisa. Con `--estricto`, sí |

**El corte está en «alta» a propósito.** Una puerta que salta con cualquier aviso de
severidad baja se acaba desactivando, y entonces no protege de nada.

**Sin red avisa y deja pasar,** porque «no se puede saber» no es «hay un problema». Este
proyecto no tiene CI —decisión del 2026-08-06—, así que `verify` se ejecuta en portátiles;
una puerta que se pone roja sin conexión se acabaría esquivando con `--no-verify`, que es
peor que no tenerla. Antes de publicar, `pnpm auditoria --estricto` convierte ese aviso en
fallo.

**La comprobación de licencias sí es dura y no depende de la red:** sale del lockfile. Es la
que de verdad vigila el día a día — una dependencia nueva que llegue con una licencia que no
esté en la lista para la compilación hasta que alguien la mire y decida.

### La trampa que hizo falta esquivar

`pnpm audit --json` **con el registro caído puede seguir imprimiendo un informe con las cinco
severidades a cero**. Leer `metadata` sin más da un verde falso: la auditoría que nunca se
hizo se lee exactamente igual que la que salió limpia. Lo que separa los dos casos es la
clave `error` del JSON — no el código de salida, que varía según cómo falle.

**Lo vigila:** [`src/tests/auditoria.test.ts`](../src/tests/auditoria.test.ts) en los dos
repositorios, con informes fabricados. Hacen falta porque hoy el árbol está limpio: ejecutar
el guion sale verde tanto si la puerta funciona como si no comprueba nada, así que la única
forma de demostrar que se pone roja es darle una vulnerabilidad alta de mentira y una GPL.

### Añadir una licencia a la lista

En `LICENCIAS_PERMITIDAS` de `scripts/auditoria.js`, **del repositorio que la necesita**. Las
dos listas son distintas a propósito: el navegador trae MPL-2.0 y OFL-1.1, el servidor trae
EPL-2.0. Una lista común sería la unión de ambas y dejaría pasar en un repositorio lo que
solo se revisó para el otro.

---

## 6. Licencia declarada

`Stockly-B/package.json` declaraba **ISC** mientras que su archivo `LICENSE` es **MIT**, que
es lo que T4-07 anticipaba. Es la clase de incoherencia que no molesta hasta que alguien
tiene que responder bajo qué licencia se distribuye esto.

Corregido: los dos repositorios declaran ahora `"license": "MIT"` y su autor, y los dos
archivos `LICENSE` son el mismo texto MIT a nombre de Ricky Angel Jiménez Bueno.

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
