// Construye la base de datos de la prueba de carga (T4-08).
//
// **Nunca toca la base de la aplicación.** Trabaja siempre sobre una base aparte
// —`Stockly_carga` por defecto— y aborta si el nombre coincide con el de `DATABASE_URL`.
// La base se borra y se rehace en cada pasada: es material de laboratorio, no datos.
//
// **Los datos se generan en SQL y no con Prisma.** Un millón de movimientos por el ORM son
// un millón de viajes de ida y vuelta; en `generate_series` es una sentencia. La diferencia
// no es de estilo, es de horas frente a segundos. El precio es que aquí se escriben los
// nombres de tabla y columna a mano, así que un cambio de esquema hay que traerlo — a
// cambio, `prisma migrate deploy` sigue siendo quien crea el esquema, y eso no se duplica.
//
// Uso:
//   node load/sembrar.js                                   100 000 productos, 1 000 000 movimientos
//   node load/sembrar.js --productos=10000 --movimientos=200000
//   node load/sembrar.js --base=Stockly_carga2

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { conexion, herramientas, capturar } = require("../scripts/postgres");

const argumento = (nombre, pordefecto) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split("=")[1] : pordefecto;
};

const PRODUCTOS = Number(argumento("productos", 100_000));
const MOVIMIENTOS = Number(argumento("movimientos", 1_000_000));
const BASE = argumento("base", "Stockly_carga");

// Catálogos pequeños: lo que importa es que los filtros del catálogo tengan selectividad
// realista, no que haya muchas categorías. Con 20, cada una cubre el 5 % de los productos.
const CATALOGOS = 20;
const PRECIOS = Math.round(PRODUCTOS * 0.3);
const AUDITORIA = Math.round(MOVIMIENTOS * 0.2);
// El histórico de la referencia más movida. Dos años de un producto que entra y sale a
// diario dan este orden de magnitud, y es el caso que castiga al endpoint sin paginar.
const CALIENTE = Number(argumento("caliente", 100_000));

const { base: baseDeLaApp, entorno } = conexion();

if (BASE === baseDeLaApp) {
    console.error(`✗ «${BASE}» es la base de la aplicación. La prueba de carga la borraría entera.`);
    process.exit(1);
}

const bin = herramientas(entorno);

// **El SQL va por archivo y no por `-c`.** En Windows los argumentos se entregan en la
// página de códigos del sistema, así que un acento dentro de una sentencia —un comentario
// basta— llega como cp1252 y el servidor, que negocia UTF-8, lo rechaza con
// «secuencia de bytes no válida para codificación UTF8». Escribirlo con `writeFileSync` en
// utf8 y pasarlo con `-f` quita el problema de raíz, y de paso las comillas.
const archivoSql = path.join(os.tmpdir(), "stockly-carga.sql");

function psql(sql, base = BASE) {
    fs.writeFileSync(archivoSql, sql, "utf8");

    const r = capturar(bin, "psql", ["-d", base, "-v", "ON_ERROR_STOP=1", "-XAtf", archivoSql], entorno);
    if (r.status !== 0) {
        console.error(`✗ SQL falló:\n${r.stderr}`);
        process.exit(1);
    }
    return r.stdout.trim();
}

function paso(titulo, fn) {
    const inicio = Date.now();
    process.stdout.write(`  ${titulo}… `);
    const resultado = fn();
    console.log(`${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    return resultado;
}

console.log(`Sembrando «${BASE}»: ${PRODUCTOS.toLocaleString("es")} productos, ${MOVIMIENTOS.toLocaleString("es")} movimientos\n`);

// ── Esquema ───────────────────────────────────────────────────────────────────
// Lo crea Prisma, no este archivo: si el esquema cambia, la prueba de carga corre sobre el
// esquema nuevo sin tocar nada aquí.
paso("recreando la base", () => {
    psql(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`, "postgres");
    psql(`CREATE DATABASE "${BASE}"`, "postgres");
});

paso("aplicando migraciones", () => {
    const url = `postgresql://${encodeURIComponent(entorno.PGUSER)}:${encodeURIComponent(entorno.PGPASSWORD)}@${entorno.PGHOST}:${entorno.PGPORT}/${BASE}`;
    // Comando en una cadena: con `shell: true` y un array, Node avisa (DEP0190) de que los
    // argumentos se concatenan sin escapar. Y la shell hace falta, porque en Windows `pnpm`
    // es un `.cmd`.
    const r = spawnSync("pnpm exec prisma migrate deploy", {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
        shell: true,
    });
    if (r.status !== 0) {
        console.error(`✗ prisma migrate deploy falló:\n${r.stdout}\n${r.stderr}`);
        process.exit(1);
    }
});

// ── Datos ─────────────────────────────────────────────────────────────────────

paso("usuario administrador", () => {
    // El hash es el de `Admin1234!`, el mismo del seed: la prueba de carga necesita entrar
    // por la API como cualquier cliente. Se calcula aquí y no se incrusta para no dejar un
    // hash suelto en el repositorio.
    const bcrypt = require("bcryptjs");
    const hash = bcrypt.hashSync(process.env.CARGA_PASSWORD ?? "Admin1234!", 10);

    psql(`INSERT INTO users (id, name, email, password, role, "isActive", "isVerified", "createdAt", "updatedAt")
          VALUES (gen_random_uuid()::text, 'Carga', 'carga@stockly.app', '${hash}', 'ADMIN', true, true, now(), now())`);
});

paso("categorías, marcas y proveedores", () => {
    for (const tabla of ["categories", "brands"]) {
        psql(`INSERT INTO ${tabla} (id, name, "createdAt", "updatedAt")
              SELECT gen_random_uuid()::text, '${tabla} '||i, now(), now() FROM generate_series(1, ${CATALOGOS}) i`);
    }
    psql(`INSERT INTO suppliers (id, name, email, "createdAt", "updatedAt")
          SELECT gen_random_uuid()::text, 'Proveedor '||i, 'prov'||i||'@carga.test', now(), now()
          FROM generate_series(1, ${CATALOGOS}) i`);
});

paso(`${PRODUCTOS.toLocaleString("es")} productos`, () => {
    // **Al azar y no con `i % 20`, y esto costó una medición entera.** La primera versión
    // sacaba la categoría de `i % 20` y el estado de `(i % 20) <> 0`: dos atributos del
    // mismo módulo quedan perfectamente correlacionados, así que **una categoría entera
    // salía inactiva** y las otras diecinueve activas al 100 %. La consulta del catálogo
    // —`isActive = true AND categoryId = …`— devolvía **cero filas**, y una consulta que no
    // encuentra nada no mide lo que se pretende medir. Lo mismo pasaba entre marca y
    // proveedor, derivadas de `i*7` e `i*13` sobre el mismo módulo.
    //
    // `setseed` deja el reparto reproducible: dos siembras dan el mismo conjunto.
    psql(`
        SELECT setseed(0.42);

        WITH c AS (SELECT array_agg(id) a FROM categories),
             b AS (SELECT array_agg(id) a FROM brands),
             s AS (SELECT array_agg(id) a FROM suppliers)
        INSERT INTO products (id, name, description, sku, price, stock, "minStock",
                              "categoryId", "brandId", "supplierId", "isActive", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text,
               'Producto '||i,
               'Generado para la prueba de carga',
               'SKU-'||lpad(i::text, 8, '0'),
               (10 + (i % 500))::numeric(10,2),
               (i % 300),
               10,
               c.a[1 + floor(random() * ${CATALOGOS})::int],
               b.a[1 + floor(random() * ${CATALOGOS})::int],
               s.a[1 + floor(random() * ${CATALOGOS})::int],
               -- Un 5 % inactivos: el filtro por defecto del catálogo es \`isActive = true\`,
               -- y con el 100 % activo ese filtro no se parecería a producción.
               random() > 0.05,
               now() - (i || ' minutes')::interval,
               now()
        FROM generate_series(1, ${PRODUCTOS}) i, c, b, s`);
});

paso(`${MOVIMIENTOS.toLocaleString("es")} movimientos`, () => {
    // Repartidos sobre los productos y **a lo largo de dos años**: el rango de fechas es lo
    // que ejercita el índice de `createdAt` que usan los reportes de rotación. Con todo
    // creado «ahora» cualquier consulta por rango leería la tabla entera o nada.
    psql(`
        SELECT setseed(0.17);

        WITH p AS (SELECT array_agg(id) a, count(*) n FROM products)
        INSERT INTO stock_movements (id, "productId", type, delta, "stockAfter", note, "createdAt")
        SELECT gen_random_uuid()::text,
               p.a[1 + floor(random() * p.n)::int],
               (ARRAY['IN','OUT','ADJUSTMENT','IMPORT']::"StockMovementType"[])[1 + (i % 4)],
               CASE WHEN i % 2 = 0 THEN (i % 50) + 1 ELSE -((i % 50) + 1) END,
               (i % 300),
               NULL,
               now() - ((i % 1051200) || ' minutes')::interval
        FROM generate_series(1, ${MOVIMIENTOS}) i, p`);
});

paso(`${PRECIOS.toLocaleString("es")} cambios de precio`, () => {
    psql(`
        SELECT setseed(0.29);

        WITH p AS (SELECT array_agg(id) a, count(*) n FROM products)
        INSERT INTO price_history (id, "productId", "oldPrice", "newPrice", "createdAt")
        SELECT gen_random_uuid()::text, p.a[1 + floor(random() * p.n)::int],
               (10 + (i % 500))::numeric(10,2), (11 + (i % 500))::numeric(10,2),
               now() - ((i % 525600) || ' minutes')::interval
        FROM generate_series(1, ${PRECIOS}) i, p`);
});

paso(`${AUDITORIA.toLocaleString("es")} registros de auditoría`, () => {
    psql(`
        INSERT INTO audit_logs (id, "userId", "userEmail", action, entity, "entityId", "createdAt")
        SELECT gen_random_uuid()::text, NULL, 'carga@stockly.app',
               (ARRAY['CREATE','UPDATE','DELETE','STOCK_MOVEMENT']::"AuditAction"[])[1 + (i % 4)],
               (ARRAY['Product','SaleOrder','PurchaseOrder','User']::"AuditEntity"[])[1 + (i % 4)],
               NULL,
               now() - ((i % 525600) || ' minutes')::interval
        FROM generate_series(1, ${AUDITORIA}) i`);
});

// Un producto con histórico grande, además del reparto uniforme.
//
// Con 1 000 000 de movimientos sobre 100 000 productos, la media son diez por producto: un
// reparto así **no se parece a un inventario real**, donde unas pocas referencias concentran
// casi todo el movimiento. Y esconde justo el caso que interesa, porque
// `GET /products/:id/movements` **no pagina** —devuelve el histórico entero— y con diez
// filas eso no se nota.
paso(`producto caliente (${CALIENTE.toLocaleString("es")} movimientos)`, () => {
    psql(`
        SELECT setseed(0.71);

        UPDATE products SET name = 'Producto caliente', sku = 'SKU-CALIENTE'
        WHERE id = (SELECT id FROM products WHERE "isActive" ORDER BY "createdAt" LIMIT 1);

        WITH p AS (SELECT id FROM products WHERE sku = 'SKU-CALIENTE')
        INSERT INTO stock_movements (id, "productId", type, delta, "stockAfter", note, "createdAt")
        SELECT gen_random_uuid()::text, p.id,
               (ARRAY['IN','OUT']::"StockMovementType"[])[1 + (i % 2)],
               CASE WHEN i % 2 = 0 THEN 1 ELSE -1 END,
               (i % 300), NULL,
               now() - ((i % 1051200) || ' minutes')::interval
        FROM generate_series(1, ${CALIENTE}) i, p`);
});

// **Sin esto las mediciones no valen.** El planificador decide con estadísticas, y tras una
// carga masiva están vacías: elegiría planes por corazonada y los `EXPLAIN ANALYZE` de
// después medirían eso en vez del efecto de los índices.
paso("recogiendo estadísticas (ANALYZE)", () => psql("ANALYZE"));

const tamaño = psql(`SELECT pg_size_pretty(pg_database_size('${BASE}'))`);
const filas = psql(`
    SELECT string_agg(t||': '||n, ', ')
    FROM (SELECT 'productos' t, count(*)::text n FROM products
          UNION ALL SELECT 'movimientos', count(*)::text FROM stock_movements
          UNION ALL SELECT 'precios', count(*)::text FROM price_history
          UNION ALL SELECT 'auditoría', count(*)::text FROM audit_logs) x`);

console.log(`\n✓ «${BASE}» lista — ${tamaño}\n  ${filas}`);
