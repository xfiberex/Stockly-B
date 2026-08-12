// Mide con `EXPLAIN ANALYZE` las consultas del hallazgo P-01, **con y sin los índices**
// de T1-15, sobre el mismo conjunto de datos (T4-08).
//
// El «antes y después» del criterio de aceptación no se puede sacar del historial: los
// índices existen desde el 2026-08-07 y la base de desarrollo tiene 48 productos, donde
// cualquier plan es instantáneo y no se distingue nada. Así que el antes se reconstruye:
// sobre la base de carga se **quitan** los índices no únicos, se mide, se vuelven a poner y
// se mide otra vez. Mismo dato, misma máquina, misma sesión — la única diferencia es el
// índice.
//
// **No toca la base de la aplicación**: trabaja sobre `Stockly_carga` y aborta si el nombre
// coincide con el de `DATABASE_URL`. Aun así, los índices se restauran en un `finally`: si
// esto se apuntara por error a una base con datos, dejarla sin índices sería el peor final
// posible.
//
// Uso:
//   node load/consultas.js
//   node load/consultas.js --base=Stockly_carga --repeticiones=5

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { conexion, herramientas, capturar } = require("../scripts/postgres");

const argumento = (nombre, pordefecto) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split("=")[1] : pordefecto;
};

const BASE = argumento("base", "Stockly_carga");
const REPETICIONES = Number(argumento("repeticiones", 5));

const { base: baseDeLaApp, entorno } = conexion();

if (BASE === baseDeLaApp) {
    console.error(`✗ «${BASE}» es la base de la aplicación. Este guion le quita los índices.`);
    process.exit(1);
}

const bin = herramientas(entorno);
const archivoSql = path.join(os.tmpdir(), "stockly-consultas.sql");

function psql(sql) {
    // Por archivo y en utf8: en Windows los argumentos viajan en la página de códigos del
    // sistema y un acento en una sentencia se rechaza como byte inválido para UTF-8.
    fs.writeFileSync(archivoSql, sql, "utf8");

    const r = capturar(bin, "psql", ["-d", BASE, "-v", "ON_ERROR_STOP=1", "-XAtf", archivoSql], entorno);
    if (r.status !== 0) throw new Error(`SQL falló:\n${r.stderr}`);
    return r.stdout;
}

// ── Las consultas ─────────────────────────────────────────────────────────────
// Copiadas de lo que ejecutan los servicios, no inventadas. Cada una lleva de dónde sale.
//
// **Los identificadores se resuelven antes y entran como literales.** La primera versión los
// buscaba con una subconsulta dentro de la propia sentencia, y eso estropeaba la medición
// por dos lados: metía en el plan un `Seq Scan on products` que no es lo que se está
// midiendo —y que se llevaba la etiqueta del plan— y sumaba su tiempo al de la consulta.
const idProducto = psql("SELECT id FROM products LIMIT 1").trim();
const idCategoria = psql("SELECT id FROM categories LIMIT 1").trim();

const CONSULTAS = [
    {
        nombre: "Histórico de un producto",
        origen: "product.service.ts — GET /products/:id/movements",
        sql: `SELECT * FROM stock_movements WHERE "productId" = '${idProducto}'
              ORDER BY "createdAt" DESC LIMIT 20`,
    },
    {
        nombre: "Total del histórico (paginación)",
        origen: "product.service.ts — el `count` que acompaña a cada listado",
        sql: `SELECT count(*) FROM stock_movements WHERE "productId" = '${idProducto}'`,
    },
    {
        nombre: "Historial de precios",
        origen: "product.service.ts — GET /products/:id/price-history",
        sql: `SELECT * FROM price_history WHERE "productId" = '${idProducto}'
              ORDER BY "createdAt" DESC LIMIT 20`,
    },
    {
        nombre: "Catálogo filtrado por categoría",
        origen: "product.service.ts — GET /products?categoryId=…",
        sql: `SELECT * FROM products WHERE "isActive" = true AND "categoryId" = '${idCategoria}'
              ORDER BY "createdAt" DESC LIMIT 20`,
    },
    {
        nombre: "Registro de auditoría",
        origen: "audit-logs.service.ts — GET /audit-logs",
        sql: `SELECT * FROM audit_logs ORDER BY "createdAt" DESC LIMIT 20`,
    },
    {
        nombre: "Auditoría filtrada por entidad y acción",
        origen: "audit-logs.service.ts — GET /audit-logs?entity=…&action=…",
        sql: `SELECT * FROM audit_logs WHERE entity = 'Product' AND action = 'UPDATE'
              ORDER BY "createdAt" DESC LIMIT 20`,
    },
    {
        nombre: "Movimientos por mes (dashboard)",
        origen: "reports.service.ts — rango de 6 meses sobre createdAt",
        sql: `SELECT TO_CHAR("createdAt", 'YYYY-MM') AS month, type, COUNT(*) AS total
              FROM stock_movements WHERE "createdAt" >= NOW() - INTERVAL '6 months'
              GROUP BY month, type ORDER BY month ASC`,
    },
    {
        nombre: "Rotación de 30 días (dashboard)",
        origen: "reports.service.ts — JOIN productos × movimientos",
        sql: `SELECT p.id, COALESCE(SUM(CASE WHEN sm.type = 'OUT' THEN ABS(sm.delta) ELSE 0 END), 0) AS "totalOut"
              FROM products p
              LEFT JOIN stock_movements sm ON sm."productId" = p.id
                  AND sm."createdAt" >= NOW() - INTERVAL '30 days' AND sm.type = 'OUT'
              WHERE p."isActive" = true
              GROUP BY p.id, p.name, p.sku, p.stock, p."minStock"
              ORDER BY "totalOut" DESC LIMIT 20`,
    },
];

/**
 * El nodo que explica el plan.
 *
 * **No vale la primera línea.** El nodo raíz de casi todas estas consultas es `Limit`, que
 * es idéntico con índices y sin ellos y no dice nada. Lo que cambia es cómo se leen las
 * filas —`Seq Scan` frente a `Index Scan`— y si el plan es **paralelo**, que resultó ser la
 * mitad de la historia.
 */
function nodoRelevante(plan) {
    const linea = plan
        .split("\n")
        .find((l) => /(Seq Scan|Index Scan|Index Only Scan|Bitmap Heap Scan|Bitmap Index Scan)/.test(l));

    if (!linea) return "—";

    const nodo = linea.trim().replace(/^->\s*/, "").replace(/\s+\(cost=.*/, "");
    return /Parallel/.test(plan) && !/Parallel/.test(nodo) ? `${nodo} (paralelo)` : nodo;
}

/** Ejecuta la consulta y devuelve `{ ms, nodo, plan }` — el mejor de N pasadas. */
function medir(sql) {
    let mejor = Infinity;
    let nodo = "";
    let plan = "";

    for (let i = 0; i < REPETICIONES; i++) {
        const salida = psql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`);
        const ms = Number(/Execution Time: ([\d.]+) ms/.exec(salida)?.[1] ?? NaN);

        if (ms < mejor) {
            mejor = ms;
            plan = salida;
            nodo = nodoRelevante(salida);
        }
    }

    // El mejor de N y no la media: lo que interesa es el plan, y la media la contamina
    // cualquier ruido de la máquina. Los picos se ven en la prueba de carga, que es donde
    // esa pregunta tiene sentido.
    return { ms: mejor, nodo, plan };
}

/**
 * Los índices no únicos: los de T1-15. Los que respaldan claves primarias o `UNIQUE` no se
 * tocan — quitarlos cambiaría lo que la base **acepta**, no solo lo que tarda.
 *
 * Se excluyen también las tablas que empiezan por `_`: es la intermedia que Prisma crea
 * para la relación con etiquetas, y su índice no lo puso T1-15. Dejarlo dentro mezclaba en
 * la medición un índice del ORM con los que se están evaluando.
 *
 * `regclass::text` ya devuelve el nombre entrecomillado **cuando hace falta**, así que
 * añadirle comillas rompe: `""_ProductToTag_B_index""` es un identificador vacío.
 */
function indicesDeT115() {
    const salida = psql(`
        SELECT i.indexrelid::regclass::text || '|' || pg_get_indexdef(i.indexrelid)
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND NOT i.indisprimary AND NOT i.indisunique
          AND i.indrelid::regclass::text NOT LIKE '%_ProductToTag%'
        ORDER BY 1`);

    return salida
        .split("\n")
        .filter(Boolean)
        .map((linea) => {
            const [nombre, ...resto] = linea.split("|");
            return { nombre, ddl: resto.join("|") };
        });
}

function main() {
    const indices = indicesDeT115();
    console.log(`Base «${BASE}» · ${indices.length} índices no únicos · mejor de ${REPETICIONES} pasadas\n`);

    const resultados = [];

    try {
        console.log("Quitando los índices para medir el «antes»…");
        for (const i of indices) psql(`DROP INDEX ${i.nombre}`);
        psql("ANALYZE");

        for (const c of CONSULTAS) resultados.push({ ...c, sin: medir(c.sql) });

        console.log("Restaurando los índices…");
        for (const i of indices) psql(i.ddl);
        psql("ANALYZE");

        for (const [n, c] of CONSULTAS.entries()) resultados[n].con = medir(c.sql);
    } finally {
        // Pase lo que pase, la base no se queda sin índices.
        const faltan = indices.length - indicesDeT115().length;
        if (faltan > 0) {
            console.log(`Recuperando ${faltan} índice(s) tras un fallo…`);
            for (const i of indices) {
                try {
                    psql(i.ddl.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS"));
                } catch {
                    /* ya estaba */
                }
            }
        }
    }

    console.log(`\n| Consulta | Sin índices | Con índices | Efecto | Plan sin → con |`);
    console.log(`|---|---:|---:|---:|---|`);

    for (const r of resultados) {
        const factor = r.sin.ms / r.con.ms;
        console.log(
            `| ${r.nombre} | ${r.sin.ms.toFixed(1)} ms | ${r.con.ms.toFixed(1)} ms | ` +
                `**×${factor.toFixed(factor >= 10 ? 0 : factor >= 1 ? 1 : 2)}** | ${r.sin.nodo} → ${r.con.nodo} |`,
        );
    }

    // Los planes completos a un archivo: la tabla dice **qué** pasó y el plan dice **por
    // qué**, y es lo que hace falta cuando un índice sale perdiendo.
    const destino = path.join(__dirname, "planes.txt");
    fs.writeFileSync(
        destino,
        resultados
            .map((r) => `${"=".repeat(78)}\n${r.nombre}\n${r.origen}\n${"=".repeat(78)}\n\n--- SIN índices ---\n${r.sin.plan}\n--- CON índices ---\n${r.con.plan}`)
            .join("\n"),
        "utf8",
    );
    console.log(`\nPlanes completos en load/planes.txt`);
}

main();
