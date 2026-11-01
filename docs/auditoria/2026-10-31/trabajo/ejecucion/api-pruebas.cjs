// Verificación en ejecución (paso 1.3) · auditoría 2026-10-31 · sesión 4 (2026-11-01).
// Solo contra la base aislada `stockly_auditoria` y los backends locales A (3000, techos del E2E)
// y B (3001, límites por defecto). No imprime contraseñas, tokens ni datos personales.
// Uso (desde Stockly-B, con env-auditoria.sh cargado): node <este archivo> <salida.json>
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Client } = require(require.resolve("pg", { paths: [process.cwd()] }));

const A = "http://localhost:3000/api/v1";
const B = "http://localhost:3001/api/v1";
const DB = process.env.DATABASE_URL;
if (!/\/stockly_auditoria(\?|$)/.test(DB)) throw new Error("DATABASE_URL no apunta a stockly_auditoria");
const salida = process.argv[2];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Cuentas del seed: las publica README.md (tabla «Rol | Email | Contraseña»). No se imprimen.
const cuentas = {};
for (const l of fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8").split(/\r?\n/)) {
    const m = l.match(/^\|\s*(\w+)\s*\|\s*`([^`]+@[^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
    if (m && !cuentas[m[1]]) cuentas[m[1]] = { email: m[2], password: m.at(3) };
}

class Sesion {
    constructor(base) { this.base = base; this.cookies = {}; }
    guardar(res) {
        for (const c of res.headers.getSetCookie()) {
            const kv = c.split(";")[0];
            const i = kv.indexOf("=");
            const k = kv.slice(0, i).trim();
            const v = kv.slice(i + 1);
            if (v === "") delete this.cookies[k]; else this.cookies[k] = v;
        }
    }
    async pedir(metodo, ruta, cuerpo, extra = {}) {
        const headers = { ...extra };
        const cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
        if (cookie) headers.cookie = cookie;
        if (cuerpo !== undefined) headers["content-type"] = "application/json";
        if (metodo !== "GET" && this.cookies.csrfToken) headers["x-csrf-token"] = decodeURIComponent(this.cookies.csrfToken);
        const t = performance.now();
        const res = await fetch(this.base + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
        this.guardar(res);
        const texto = await res.text();
        let datos;
        try { datos = JSON.parse(texto); } catch { datos = null; }
        return { status: res.status, code: datos?.code ?? datos?.error?.code, datos, headers: res.headers, ms: Math.round(performance.now() - t) };
    }
    async entrar(rol) { const c = cuentas[rol]; const r = await this.pedir("POST", "/auth/login", { email: c.email, password: c.password }); if (r.status !== 200) throw new Error(`login ${rol}: ${r.status}`); return this; }
}

let db;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;

async function foto(productId, orderId, desde) {
    const [p] = await q(`SELECT stock FROM products WHERE id = $1`, [productId]);
    const [n] = await q(`SELECT coalesce(sum(sl.stock),0)::int AS s FROM stock_levels sl JOIN warehouses w ON w.id = sl."warehouseId" AND w."isDefault" WHERE sl."productId" = $1`, [productId]);
    const [o] = await q(`SELECT status FROM sale_orders WHERE id = $1`, [orderId]);
    const [l] = await q(`SELECT count(*)::int AS filas, coalesce(sum(l.quantity),0)::int AS unidades FROM sale_order_item_lots l JOIN sale_order_items i ON i.id = l."saleOrderItemId" WHERE i."saleOrderId" = $1`, [orderId]);
    const movs = await q(`SELECT type::text AS tipo, count(*)::int AS n, sum(delta)::int AS delta FROM stock_movements WHERE "productId" = $1 AND "createdAt" >= $2 GROUP BY type ORDER BY 1`, [productId, desde]);
    return { stockTotal: p.stock, stockAlmacenPredeterminado: n.s, estado: o?.status ?? "(borrada)", lotes: l, movimientosDesdeElInicioDelCaso: movs };
}

// Retiene el bloqueo de la fila del producto (como recepcion-parcial.test.ts:300) hasta que haya
// `esperadas` sesiones esperando un bloqueo, y lo suelta. Así las peticiones se solapan seguro.
async function conBloqueo(productId, lanzar, esperadas = 2) {
    const bloqueo = new Client({ connectionString: DB });
    const vigia = new Client({ connectionString: DB });
    await bloqueo.connect(); await vigia.connect();
    await bloqueo.query("BEGIN");
    await bloqueo.query("SELECT 1 FROM products WHERE id = $1 FOR UPDATE", [productId]);
    const promesas = lanzar();
    const t = Date.now();
    let esperando = 0;
    while (Date.now() - t < 4000) {
        const [r] = (await vigia.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows;
        esperando = r.n;
        if (esperando >= esperadas) break;
        await dormir(25);
    }
    const retenidoMs = Date.now() - t;
    await bloqueo.query("COMMIT");
    const res = await Promise.all(promesas);
    await bloqueo.end(); await vigia.end();
    return { esperandoAlSoltar: esperando, retenidoMs, respuestas: res.map((r) => ({ status: r.status, code: r.code ?? null, ms: r.ms })) };
}

async function crearOrden(admin, prod, cantidad, etiqueta) {
    const r = await admin.pedir("POST", "/sale-orders", { customerName: `Auditoria ${etiqueta}`, items: [{ productId: prod.id, productName: prod.name, quantity: cantidad, unitPrice: 10 }] });
    if (r.status !== 201 && r.status !== 200) throw new Error(`crear orden ${etiqueta}: ${r.status} ${r.code}`);
    return (r.datos.data ?? r.datos).id;
}

async function main() {
    const res = { fecha: new Date().toISOString(), base: "stockly_auditoria", backends: { A: "3000, NODE_ENV=production, COOKIE_SECURE=false, COOKIE_SAMESITE=lax, techos del E2E", B: "3001, NODE_ENV=production, límites por defecto" } };
    db = new Client({ connectionString: DB });
    await db.connect();
    const admin = await new Sesion(A).entrar("ADMIN");
    const almacen = await new Sesion(A).entrar("WAREHOUSE");

    // ---------- P-07-01 ----------
    const [prod] = await q(`SELECT p.id, p.name FROM products p
        JOIN stock_levels sl ON sl."productId" = p.id AND sl."lotId" IS NOT NULL AND sl.stock >= 10
        JOIN warehouses w ON w.id = sl."warehouseId" AND w."isDefault" AND w."isActive"
        WHERE p."isActive" GROUP BY p.id ORDER BY p.stock DESC LIMIT 1`);
    res.p0701 = { producto: "activo, con lotes en el almacén predeterminado (id omitido)", cantidadPorOrden: 2 };

    try {
        const t0 = new Date();
        const o = await crearOrden(admin, prod, 2, "P-07-01 caso 1");
        const antes = await foto(prod.id, o, t0);
        const carrera = await conBloqueo(prod.id, () => [almacen.pedir("POST", `/sale-orders/${o}/ship`), almacen.pedir("POST", `/sale-orders/${o}/ship`)]);
        const despues = await foto(prod.id, o, t0);
        res.p0701.caso1_dobleEnvio = { antes, carrera, despues };
    } catch (e) { res.p0701.caso1_dobleEnvio = { error: e.message }; }

    try {
        const t0 = new Date();
        const o = await crearOrden(admin, prod, 2, "P-07-01 caso 2");
        const envio = await almacen.pedir("POST", `/sale-orders/${o}/ship`);
        const antes = await foto(prod.id, o, t0);
        const carrera = await conBloqueo(prod.id, () => [admin.pedir("PATCH", `/sale-orders/${o}`, { status: "CANCELLED" }), admin.pedir("PATCH", `/sale-orders/${o}`, { status: "CANCELLED" })]);
        const despues = await foto(prod.id, o, t0);
        res.p0701.caso2_dobleCancelacionDeEnviada = { envioPrevio: envio.status, antes, carrera, despues };
    } catch (e) { res.p0701.caso2_dobleCancelacionDeEnviada = { error: e.message }; }

    try {
        const t0 = new Date();
        const o = await crearOrden(admin, prod, 2, "P-07-01 caso 4");
        const pasos = [{ paso: "creada", ...(await foto(prod.id, o, t0)) }];
        const e1 = await almacen.pedir("POST", `/sale-orders/${o}/ship`);
        pasos.push({ paso: `ship → ${e1.status}`, ...(await foto(prod.id, o, t0)) });
        const e2 = await admin.pedir("PATCH", `/sale-orders/${o}`, { status: "PENDING" });
        pasos.push({ paso: `PATCH PENDING → ${e2.status} ${e2.code ?? ""}`.trim(), ...(await foto(prod.id, o, t0)) });
        const e3 = await almacen.pedir("POST", `/sale-orders/${o}/ship`);
        pasos.push({ paso: `ship otra vez → ${e3.status} ${e3.code ?? ""}`.trim(), ...(await foto(prod.id, o, t0)) });
        res.p0701.caso4_shippedAPending = pasos;
    } catch (e) { res.p0701.caso4_shippedAPending = { error: e.message }; }

    // ---------- P-02-01 ----------
    try {
        const correo = `auditoria.p0201.${Date.now()}@stockly.invalid`;
        const pw = `Aud-${Date.now()}-Xq9!`;
        const nuevo = new Sesion(A);
        const reg = await nuevo.pedir("POST", "/auth/register", { name: "Auditoria P-02-01", email: correo, password: pw });
        const [fila] = await q(`SELECT role::text AS role, "isVerified" FROM users WHERE email = $1`, [correo]);
        const sinVerificar = await nuevo.pedir("POST", "/auth/login", { email: correo, password: pw });
        let verificado = null, cli = null, ventas = null, recibo = null, ajustes = null;
        if (fila) {
            // Simula el clic en el enlace del correo, que en este entorno no sale (SMTP .invalid).
            await q(`UPDATE users SET "isVerified" = true WHERE email = $1`, [correo]);
            verificado = await nuevo.pedir("POST", "/auth/login", { email: correo, password: pw });
            const c = await nuevo.pedir("GET", "/customers?limit=100");
            const lista = c.datos?.data ?? [];
            cli = { status: c.status, total: c.datos?.meta?.total ?? lista.length, campos: Object.keys(lista[0] ?? {}).sort() };
            const v = await nuevo.pedir("GET", "/sale-orders?limit=100");
            const vl = v.datos?.data ?? [];
            ventas = { status: v.status, total: v.datos?.meta?.total ?? vl.length, campos: Object.keys(vl[0] ?? {}).sort() };
            if (vl[0]) { const rr = await nuevo.pedir("GET", `/sale-orders/${vl[0].id}/receipt`); recibo = { status: rr.status, tipo: rr.headers.get("content-type") }; }
            const aj = await nuevo.pedir("GET", "/settings/business");
            ajustes = { status: aj.status };
        }
        res.p0201 = { registro: { status: reg.status, code: reg.code ?? null }, filaCreada: fila ?? null, loginSinVerificar: { status: sinVerificar.status, code: sinVerificar.code ?? null }, loginVerificado: verificado && { status: verificado.status }, clientes: cli, ventas, recibo, ajustesDelNegocio: ajustes };
    } catch (e) { res.p0201 = { error: e.message }; }

    // ---------- Cabeceras, cookies y CORS (backend A) ----------
    try {
        const h = await fetch(A + "/health");
        const nombres = ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "cross-origin-opener-policy", "cross-origin-resource-policy", "x-powered-by", "cache-control"];
        const cab = Object.fromEntries(nombres.map((n) => [n, h.headers.get(n)]));
        const l = await fetch(A + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuentas.ADMIN) });
        const cookies = l.headers.getSetCookie().map((c) => { const [kv, ...attrs] = c.split(";"); return `${kv.split("=")[0].trim()}; ${attrs.map((a) => a.trim().replace(/^(Expires|Max-Age)=.*/i, "$1=…")).join("; ")}`; });
        const ajeno = await fetch(A + "/health", { headers: { origin: "https://ajeno.example" } });
        const propio = await fetch(A + "/health", { headers: { origin: "http://localhost:4173" } });
        const pre = await fetch(A + "/auth/login", { method: "OPTIONS", headers: { origin: "https://ajeno.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-csrf-token" } });
        res.cabeceras = { health: cab, cookiesDelLogin: cookies, cors: {
            origenAjeno: { status: ajeno.status, acao: ajeno.headers.get("access-control-allow-origin"), acac: ajeno.headers.get("access-control-allow-credentials") },
            origenPropio: { status: propio.status, acao: propio.headers.get("access-control-allow-origin"), acac: propio.headers.get("access-control-allow-credentials") },
            preflightAjeno: { status: pre.status, acao: pre.headers.get("access-control-allow-origin") } } };
    } catch (e) { res.cabeceras = { error: e.message }; }

    // ---------- P-02-03 (backend B, límites por defecto) ----------
    try {
        const MAL = "incorrecta"; // contraseña errónea a propósito
        const fallidos = [];
        for (let i = 1; i <= 11; i++) {
            const r = await fetch(B + "/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${i}` }, body: JSON.stringify({ email: "nadie@stockly.invalid", password: MAL }) });
            fallidos.push(r.status);
        }
        const v = await fetch(B + "/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(cuentas.ADMIN) });
        const vc = await v.json().catch(() => ({}));
        res.p0203 = { fallidosConXffDistinto: fallidos, loginValidoDesdeOtraXff: { status: v.status, code: vc.code ?? null, ratelimit: v.headers.get("ratelimit") ?? v.headers.get("ratelimit-remaining"), retryAfter: v.headers.get("retry-after") } };
    } catch (e) { res.p0203 = { error: e.message }; }

    // ---------- P-02-101 (backend B, al final: puede tumbarlo) ----------
    try {
        const cuerpo = Buffer.concat([zlib.gzipSync(Buffer.from('{"email":"a@b.c","password":"x"}')), Buffer.from("bytes de mas tras el marco gzip")]);
        let peticion;
        try { const r = await fetch(B + "/nada", { method: "POST", headers: { "content-type": "application/json", "content-encoding": "gzip" }, body: cuerpo }); peticion = r.status; }
        catch (e) { peticion = `sin respuesta: ${e.cause?.code ?? e.message}`; }
        await dormir(1500);
        let salud;
        try { salud = (await fetch(B + "/health")).status; } catch (e) { salud = `sin respuesta: ${e.cause?.code ?? e.message}`; }
        const saludA = (await fetch(A + "/health")).status;
        res.p02101 = { peticionGzipConBytesDeMas: peticion, healthBTras1500ms: salud, healthAMismoMomento: saludA };
    } catch (e) { res.p02101 = { error: e.message }; }

    await db.end();
    fs.writeFileSync(salida, JSON.stringify(res, null, 2));
    console.log(JSON.stringify(res, null, 1));
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
