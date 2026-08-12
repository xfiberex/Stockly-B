# Auditoría de navegador y accesibilidad

Lighthouse y recorrido de teclado sobre la **aplicación desplegada** (T4-09). Los hallazgos de
accesibilidad de la auditoría del 2026-08-04 eran estáticos: leían el código, no lo ejecutaban.

**Fecha:** 2026-08-11. **Sobre qué:** la pila del compose —build de producción servido por
nginx, un solo origen— en `http://localhost:8080`, no el servidor de desarrollo. **Con qué:**
Lighthouse (escritorio) y CDP para el recorrido de teclado y el árbol de accesibilidad.

---

## 1. Lighthouse: antes y después

La línea base del 2026-07-15 daba **96** en accesibilidad sobre el servidor de desarrollo. La
primera pasada de esta auditoría, ya sobre el build de producción:

| Pantalla | Antes | Después |
|---|---:|---:|
| Iniciar sesión | 93 | **100** ✅ |
| Dashboard | 100 | **100** ✅ |
| Productos | 94 | **100** ✅ |
| Movimientos de stock | 95 | **100** ✅ |

El criterio pedía ≥ 95 y **el login estaba en 93**, que es la primera pantalla del producto y
la única que se ve sin sesión. Buenas prácticas: **100** en las cuatro.

### Los tres fallos, y por qué ninguno se notaba

**Ocho desplegables sin nombre accesible** (`select-name`), repartidos por cuatro pantallas:
los filtros de productos, auditoría, movimientos y usuarios. Se anunciaban como «cuadro
combinado» y nada más. El texto que se ve es **la opción elegida** —«Todas las categorías»—,
que dice el valor, no de qué es el filtro: mirando la pantalla se entiende por su posición, y
sin mirarla no hay forma de saberlo. Resuelto con `aria-label` desde el catálogo de i18n.

**Las siete pantallas sin sesión no tenían landmark `<main>`** (`landmark-one-main`). No pasan
por `App.tsx`, así que no heredaban el suyo, y la cadena del marco estaba **copiada en las
siete**. Ahora es una constante compartida y el elemento es `<main>`. Sin landmarks, un lector
de pantalla pierde el atajo para saltar al contenido y solo puede recorrer la página entera.

**Enlaces distinguidos solo por el color** (`link-in-text-block`), en el login y el registro:
`text-info hover:underline` deja el subrayado para cuando pasa el ratón, así que en reposo lo
único que separa «Regístrate» del texto que lo rodea es el color. Es la misma regla —WCAG
1.4.1— por la que en este proyecto ningún estado se comunica solo con color. Ahora el
subrayado está siempre y **desaparece al pasar el ratón**, que es el gesto que confirma que es
pulsable.

**Y uno más, del árbol de accesibilidad y no de Lighthouse:** el botón del menú de usuario
enseñaba «Admin Principal» y se anunciaba «Menú de usuario». Es `label-content-name-mismatch`,
WCAG 2.5.3: quien maneja el ordenador **por voz** dice lo que ve —«pulsa Admin Principal»— y
no ocurre nada, porque ese texto no está en el nombre accesible. Ahora el nombre lo contiene.

**Lo vigila:** [`src/tests/accesibilidad.test.ts`](../../Stockly-F/src/tests/accesibilidad.test.ts)
—tres guardias estáticas— y un test de nombre accesible en `itemDeMenu.test.tsx`. Se comprueba
sobre el texto de los componentes y no sobre el DOM renderizado porque **el fallo se comete al
escribir un `<Select>` nuevo**, y lo que hace falta es que salte en `pnpm verify` el día que
alguien lo repita.

---

## 2. Core Web Vitals sobre el build de producción

Traza del dashboard, sin limitación de CPU ni de red:

| Métrica | Línea base (2026-07-15, dev) | Producción (2026-08-11) | Objetivo |
|---|---:|---:|---|
| LCP | 556 ms | **420 ms** ✅ | < 2.5 s |
| CLS | 0.02 | **0.02** ✅ | < 0.1 |
| Errores de consola | ninguno | **ninguno** ✅ | ninguno |

El LCP se reparte en 2 ms de TTFB y 418 ms de retraso de render: el servidor no es el cuello,
lo es el arranque de la SPA. Está muy por debajo del umbral, así que no hay nada que hacer
aquí; queda anotado por si algún día sube.

---

## 3. Los dos flujos del criterio, solo con teclado

### Alta de producto

`Tab` desde el arranque llega primero al enlace **«Saltar al contenido principal»**, que
aparece al enfocarse (44 px de alto, con su anillo). `Enter` sobre «Nuevo producto» abre el
diálogo, que es `role="dialog"` con `aria-modal="true"` y `aria-labelledby`.

**La trampa se comprobó por sus dos bordes, que es donde se rompe:** con el foco en el
**último** elemento del diálogo, `Tab` vuelve al primero; con el foco en el **primero**,
`Shift+Tab` vuelve al último. En ningún caso el foco sale al fondo. `Escape` cierra y
**devuelve el foco al botón que lo abrió**.

### Movimiento de stock

Recorrido completo sin ratón, y **ejecutado de verdad**: `Space` marca la casilla de la fila
—que se anuncia «Seleccionar UPS APC Back-UPS 600VA 330W», no «Seleccionar»—, aparece el botón
flotante «Movimiento manual», `Enter` abre el diálogo, se escribe la cantidad, se elige el
motivo tecleando su inicial en el desplegable nativo, y `Enter` sobre «Registrar» envía.

**Resultado: el stock del producto pasó de 10 a 15.** El diálogo se cerró y el foco volvió al
disparador.

### De propina, algo que el árbol de accesibilidad hace bien

Cada acción de fila **nombra su fila**: «Editar UPS APC Back-UPS 600VA 330W», no «Editar».
Diez filas × cuatro acciones son cuarenta botones, y con el rótulo corto un lector de pantalla
recitaría cuarenta veces las mismas cuatro palabras. Es la regla del sistema de diseño, y se
confirma cumplida sobre la aplicación en marcha.

---

## 4. Lo que **no** se ha comprobado

**No se ha ejecutado NVDA ni VoiceOver.** El criterio de aceptación los nombra y esta máquina
no tiene ninguno de los dos; tampoco sirve de nada «ejecutarlo» sin escuchar la salida. Lo que
sí se ha hecho es comprobar lo que un lector de pantalla lee —el árbol de accesibilidad, que
es su fuente— y que los dos flujos se completan sin ratón. **Son cosas distintas:** el árbol
dice qué se anunciaría, no cómo suena ni si el recorrido resulta comprensible. Queda pendiente
un recorrido real con lector, anotado como **T4-17**.

**El 63 de SEO no es un fallo.** Lighthouse penaliza que la página **esté bloqueada para
indexar**, y eso es exactamente lo que se decidió en T3-12: un sistema de inventario privado
no debe salir en un buscador. La línea base marcaba 82 con `lang` y la meta description
ausentes —ya corregidas—; la bajada a 63 viene del `robots.txt` y es la configuración correcta.

**«Agentic browsing» (27–67) tampoco se ha perseguido.** Mide si el sitio publica un
`llms.txt` para agentes automáticos. Una aplicación privada tras autenticación no lo necesita.

---

## 5. Repetir la auditoría

```bash
cd Stockly-B
POSTGRES_HOST_PORT=5442 BACKEND_HOST_PORT=3001 FRONTEND_HOST_PORT=8080 docker compose up -d --build
DATABASE_URL="postgresql://postgres:postgres@localhost:5442/Stockly" pnpm exec prisma db seed
```

La pila **no se siembra sola** (ver [CONTEXTO §4](CONTEXTO.md)): sin el seed, el login responde
401 y parece un fallo de credenciales. Después, Lighthouse sobre `http://localhost:8080` en las
cuatro pantallas de la tabla, con sesión iniciada para las tres últimas.

**Sobre el build de producción y no sobre `vite dev`**, que es lo que pedía la ficha: el
servidor de desarrollo no minifica, sirve otros módulos y da cifras que no son las que verá
nadie. Y `vite preview` tampoco vale de sustituto: no aplica `server.proxy`, así que la SPA se
quedaría sin API.
