// Prueba de carga de k6 sobre los flujos de inventario (T4-08).
//
// **No se ejecuta con Node**, aunque sea un `.js`: es un guion de k6, con su propio
// intérprete. Se lanza con `node load/ejecutar.js`, que levanta el backend contra la base
// de carga y llama a k6 en Docker — en esta máquina k6 no está instalado, y meter una
// herramienta más en el PATH para una tarea que se ejecuta de vez en cuando no compensa.
//
// Lo que se mide son cuatro caminos con perfiles distintos a propósito:
//
//   - **el histórico de un producto**, que es la consulta del hallazgo P-01 y la que más
//     crece con el tiempo;
//   - **el catálogo filtrado**, que es la pantalla de entrada al inventario;
//   - **el dashboard**, que es lo primero que se abre tras el login y la consulta más cara
//     del sistema (P-02: agrega el catálogo activo en memoria);
//   - **una escritura**, el movimiento manual, que es transaccional y toca dos tablas.
//
// Sin la escritura, la prueba mediría una base de solo lectura, que no es el sistema.

import http from "k6/http";
import { check, group } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://host.docker.internal:3200/api/v1";
const USUARIO = __ENV.CARGA_EMAIL || "carga@stockly.app";
const CLAVE = __ENV.CARGA_PASSWORD || "Admin1234!";

// Una métrica por camino: el `http_req_duration` global mezcla el dashboard con el
// histórico y esconde justo lo que se quiere ver.
const historico = new Trend("ruta_historico", true);
const catalogo = new Trend("ruta_catalogo", true);
const dashboard = new Trend("ruta_dashboard", true);
const escritura = new Trend("ruta_escritura", true);
const caliente = new Trend("ruta_historico_grande", true);

export const options = {
    scenarios: {
        // Carga **sostenida**, que es lo que pide el criterio de aceptación: subir, mantener
        // y bajar. El escalón de subida evita que el primer segundo —conexiones frías, caché
        // vacía— contamine la medición del tramo estable.
        sostenida: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "10s", target: 10 },
                { duration: "60s", target: 10 },
                { duration: "10s", target: 0 },
            ],
            gracefulRampDown: "5s",
        },
    },
    thresholds: {
        // Umbrales como parte de la prueba y no como comentario: si se incumplen, k6 sale
        // con código distinto de cero y la medición se lee como fallo, no como dato.
        //
        // **`checks` y `http_reqs` están aquí porque un umbral sin muestras se da por
        // cumplido.** La primera pasada reventó en `setup` y k6 informó de cuatro `p(95)=0s`
        // en verde: sin este par, una prueba que no llega a ejecutarse se lee como una
        // prueba que va perfecta.
        checks: ["rate>0.99"],
        http_reqs: ["count>1000"],
        http_req_failed: ["rate<0.01"],
        ruta_historico: ["p(95)<300"],
        ruta_catalogo: ["p(95)<500"],
        ruta_dashboard: ["p(95)<2000"],
        ruta_escritura: ["p(95)<1000"],
        // T4-15 — **este umbral no existía y esa era la señal.** Mientras el histórico se
        // devolvía entero, ponerle un límite al producto caliente habría sido fingir que su
        // número era aceptable, así que se medía sin umbral. Paginado, cuesta lo mismo que
        // cualquier otro histórico y se le exige lo mismo: si un producto de 100 000
        // movimientos vuelve a salir de esta franja, es que algo dejó de paginar.
        ruta_historico_grande: ["p(95)<300"],
    },
};

/**
 * Entra una vez y reparte la sesión a todos los VU.
 *
 * El login lleva su propio limitador —10 intentos cada 15 minutos— así que **un login por
 * VU agotaría el límite antes de empezar** y la prueba mediría 429. Con uno solo, además,
 * lo que se mide es el inventario y no bcrypt.
 */
export function setup() {
    const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: USUARIO, password: CLAVE }), {
        headers: { "Content-Type": "application/json" },
    });

    if (r.status !== 200) throw new Error(`login ${r.status}: ${r.body}`);

    const galleta = (nombre) => r.cookies[nombre]?.[0]?.value;
    const sesion = { token: galleta("token"), csrf: galleta("csrfToken") };

    if (!sesion.token) throw new Error("el login no devolvió la cookie de sesión");

    // Ids reales para pedir históricos: pedir siempre el mismo producto mediría la caché
    // del planificador, no el índice. La envoltura es `{ success, message, data: { data, meta } }`,
    // así que el listado está en `.data.data` — con `.data` a secas, `map` no existe.
    // **Solo activos.** La primera pasada cogía productos cualesquiera y un 2 % de las
    // escrituras fallaba con 400: la API rechaza movimientos sobre un producto inactivo, y
    // el 5 % del catálogo sembrado lo está. Eran fallos correctos de la aplicación contados
    // como fallos de la prueba.
    const productos = http.get(`${BASE}/products?limit=50&isActive=true`, { headers: cabeceras(sesion) });
    const ids = JSON.parse(productos.body).data.data.map((p) => p.id);

    if (ids.length === 0) throw new Error("la base de carga no tiene productos: ejecuta load/sembrar.js");

    // El producto con histórico grande, aparte: es el que enseña lo que cuesta un endpoint
    // sin paginar, y perdido entre los otros 50 no aparecería nunca.
    //
    // Se busca **por nombre y no por SKU** porque el buscador del catálogo solo mira `name`
    // (`product.service.ts`: `where.name.contains`), al contrario que el de usuarios, que
    // mira nombre y correo. Buscar «SKU-CALIENTE» no devolvía nada y la métrica salía vacía.
    const caliente = http.get(`${BASE}/products?limit=1&search=Producto%20caliente`, { headers: cabeceras(sesion) });
    const idCaliente = JSON.parse(caliente.body).data.data[0]?.id ?? null;

    return { sesion, ids, idCaliente };
}

function cabeceras(sesion, conCsrf = false) {
    const cookie = `token=${sesion.token}; csrfToken=${sesion.csrf}`;
    return conCsrf
        ? { Cookie: cookie, "x-csrf-token": sesion.csrf, "Content-Type": "application/json" }
        : { Cookie: cookie };
}

export default function ({ sesion, ids, idCaliente }) {
    const id = ids[Math.floor(Math.random() * ids.length)];

    // `SIN_CALIENTE=1` deja fuera el histórico grande. No es un interruptor de comodidad: es
    // lo que permite comparar. Hasta T4-15 ese endpoint degradaba a todos los demás —saturaba
    // el bucle de eventos serializando 19 MB de JSON— y sin poder apagarlo no había forma de
    // saber cuánto de la latencia del dashboard era suya y cuánto del dashboard. Sigue aquí
    // porque esa comparación es justo la que demuestra que ya no lo hace.
    if (idCaliente && !__ENV.SIN_CALIENTE) {
        group("histórico del producto caliente", () => {
            // **Sin parámetros a propósito.** Pedirlo con `?limit=20` mediría que k6 sabe
            // paginar, no que el endpoint pagina: lo que se comprueba aquí es qué hace el
            // servidor cuando nadie le dice nada, que es como lo llamaba la pantalla.
            const r = http.get(`${BASE}/products/${idCaliente}/movements`, { headers: cabeceras(sesion) });
            caliente.add(r.timings.duration);
            check(r, { "histórico grande 200": (x) => x.status === 200 });
        });
    }

    group("histórico de un producto", () => {
        const r = http.get(`${BASE}/products/${id}/movements?page=1&limit=20`, { headers: cabeceras(sesion) });
        historico.add(r.timings.duration);
        check(r, { "histórico 200": (x) => x.status === 200 });
    });

    group("catálogo filtrado", () => {
        const r = http.get(`${BASE}/products?page=1&limit=20&isActive=true`, { headers: cabeceras(sesion) });
        catalogo.add(r.timings.duration);
        check(r, { "catálogo 200": (x) => x.status === 200 });
    });

    group("dashboard", () => {
        const r = http.get(`${BASE}/reports`, { headers: cabeceras(sesion) });
        dashboard.add(r.timings.duration);
        check(r, { "dashboard 200": (x) => x.status === 200 });
    });

    group("movimiento manual", () => {
        const cuerpo = JSON.stringify({ type: "IN", quantity: 1, reason: "Prueba de carga" });
        const r = http.post(`${BASE}/products/${id}/movements`, cuerpo, { headers: cabeceras(sesion, true) });
        escritura.add(r.timings.duration);
        check(r, { "escritura 200/201": (x) => x.status === 200 || x.status === 201 });
    });
}
