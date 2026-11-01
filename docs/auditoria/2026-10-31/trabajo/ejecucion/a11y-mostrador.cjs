// Verificación en ejecución (paso 1.3) · área 5 · auditoría 2026-10-31 · sesión 4 (2026-11-01).
// Sustituye a chrome-devtools-auditoria (no cargó en esta sesión): Playwright 1.61.1 de Stockly-F,
// Chromium sin telemetría, contra el build de producción servido por `vite preview` (4173) y el
// backend A (3000) sobre la base aislada. Uso (desde Stockly-F): node <este archivo> <carpeta evidencias>
const fs = require("fs");
const path = require("path");
const { chromium } = require(require.resolve("@playwright/test", { paths: [process.cwd()] }));

const WEB = "http://localhost:4173";
const API = "http://localhost:3000/api/v1";
const salida = process.argv[2];
const cuentas = {};
for (const l of fs.readFileSync(path.join(process.cwd(), "../Stockly-B/README.md"), "utf8").split(/\r?\n/)) {
    const m = l.match(/^\|\s*(\w+)\s*\|\s*`([^`]+@[^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
    if (m && !cuentas[m[1]]) cuentas[m[1]] = { email: m[2], password: m.at(3) };
}

const foco = (page) => page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    const rol = el.getAttribute("role") || el.tagName.toLowerCase();
    const nombre = el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute("title") || el.innerText || "";
    const cs = getComputedStyle(el);
    const indicador = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
    return `${rol} «${nombre.trim().replace(/\s+/g, " ").slice(0, 60)}»${indicador ? "" : " (sin indicador de foco visible)"}`;
});
const vivas = (page) => page.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert],[aria-live]')]
    .map((e) => `${e.getAttribute("role") || "aria-live=" + e.getAttribute("aria-live")}: «${(e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 80)}»`));

async function entrar(contexto, rol) {
    const page = await contexto.newPage();
    await page.goto(WEB + "/auth/login");
    await page.getByLabel("Correo electrónico").fill(cuentas[rol].email);
    await page.getByLabel("Contraseña").fill(cuentas[rol].password);
    await page.getByLabel("Contraseña").press("Enter");
    await page.getByRole("heading", { name: "Dashboard", level: 1 }).waitFor({ timeout: 15000 });
    return page;
}

async function main() {
    const res = { fecha: new Date().toISOString(), navegador: "Chromium de Playwright 1.61.1, headless, es-ES, 1280×800" };
    const navegador = await chromium.launch();
    try {
        const ctx = await navegador.newContext({ locale: "es-ES", viewport: { width: 1280, height: 800 } });
        const page = await entrar(ctx, "SELLER");
        res.langDelDocumento = await page.evaluate(() => document.documentElement.lang);

        // Un producto con existencias para vender.
        const lista = await (await page.request.get(API + "/products?limit=100")).json();
        const productos = (lista.data?.data ?? lista.data ?? []).filter((p) => p.isActive !== false && p.stock >= 5);
        const prod = productos[0];
        res.producto = prod ? "del seed, con existencias (nombre omitido)" : "ninguno con existencias";

        await page.goto(WEB + "/counter");
        await page.getByRole("heading", { name: "Mostrador", level: 1 }).waitFor();
        fs.writeFileSync(path.join(salida, "ejecucion-a11y-mostrador.yaml"), await page.locator("main").ariaSnapshot());

        // 1. Tabulación desde el principio de la página hasta el combobox «Producto».
        const hastaCombobox = [];
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press("Tab");
            const f = await foco(page);
            hastaCombobox.push(f);
            if (f.startsWith("combobox «Producto")) break;
        }
        res.tabulacionHastaElComboboxProducto = hastaCombobox;

        // 2. Buscar y elegir con el teclado.
        const vivasAntes = await vivas(page);
        await page.keyboard.type(prod.name.slice(0, 12), { delay: 30 });
        await page.getByRole("listbox").getByRole("option").first().waitFor({ timeout: 5000 });
        const comboboxAbierto = await page.getByRole("combobox", { name: "Producto" }).evaluate((e) => ({ expanded: e.getAttribute("aria-expanded"), controls: !!e.getAttribute("aria-controls"), activedescendant: e.getAttribute("aria-activedescendant") }));
        await page.keyboard.press("ArrowDown");
        const activeTrasFlecha = await page.getByRole("combobox", { name: "Producto" }).getAttribute("aria-activedescendant");
        await page.keyboard.press("Enter");
        await page.getByRole("spinbutton").first().waitFor({ timeout: 5000 });
        res.anadirLinea = { comboboxAbierto, activedescendantTrasFlecha: activeTrasFlecha ? "sí" : "no", focoTrasElegir: await foco(page), regionesVivasAntes: vivasAntes, regionesVivasDespues: await vivas(page) };

        // 3. Tabulación desde ahí hasta «Registrar venta».
        const hastaRegistrar = [];
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press("Tab");
            const f = await foco(page);
            hastaRegistrar.push(f);
            if (f.includes("Registrar venta")) break;
        }
        res.tabulacionHastaRegistrar = hastaRegistrar;

        // 4. Registrar con Intro: foco y aviso.
        const statusAntes = await page.locator("[role=status]").count();
        await page.keyboard.press("Enter");
        await page.getByRole("status").filter({ hasText: /registrada/ }).waitFor({ timeout: 10000 });
        await page.waitForTimeout(300);
        res.registrar = { elementosRoleStatusAntes: statusAntes, focoTrasRegistrar: await foco(page), regionesVivas: await vivas(page) };
        await page.screenshot({ path: path.join(salida, "ejecucion-a11y-mostrador-tras-registrar.png") });

        // 5. «Nueva venta» con el teclado.
        const hastaNueva = [];
        for (let i = 0; i < 25; i++) {
            await page.keyboard.press("Tab");
            const f = await foco(page);
            hastaNueva.push(f);
            if (f.includes("Nueva venta")) break;
        }
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        res.nuevaVenta = { tabsDesdeElFocoAnterior: hastaNueva.length, ultimoFoco: hastaNueva.at(-1), focoTrasNuevaVenta: await foco(page) };

        // 6. Modal del escáner con el teclado.
        const escanear = page.getByRole("button", { name: /escanear/i }).first();
        if (await escanear.count()) {
            await escanear.focus();
            await page.keyboard.press("Enter");
            await page.getByRole("dialog").waitFor({ timeout: 5000 });
            const ciclo = [await foco(page)];
            for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); ciclo.push(await foco(page)); }
            await page.keyboard.press("Escape");
            await page.waitForTimeout(300);
            res.escaner = { focoInicialYTabs: ciclo, dialogosAbiertosTrasEscape: await page.getByRole("dialog").count(), focoTrasCerrar: await foco(page) };
        } else res.escaner = "sin botón «Escanear» visible";
        await page.close();

        // 7. Transferencias: nombre accesible del botón de despliegue frente a la fila visible.
        const ctx2 = await navegador.newContext({ locale: "es-ES", viewport: { width: 1280, height: 800 } });
        const p2 = await entrar(ctx2, "WAREHOUSE");
        await p2.goto(WEB + "/stock-transfers");
        await p2.getByRole("heading", { level: 1 }).first().waitFor();
        await p2.waitForTimeout(1500);
        res.transferencias = await p2.evaluate(() => [...document.querySelectorAll("button[aria-label]")]
            .filter((b) => /l[ií]neas/i.test(b.getAttribute("aria-label")))
            .slice(0, 3)
            .map((b) => ({ nombreAccesible: b.getAttribute("aria-label"), textoVisibleDelBoton: (b.innerText || "").trim().replace(/\s+/g, " ").slice(0, 120) })));
    } finally {
        await navegador.close();
    }
    fs.writeFileSync(path.join(salida, "ejecucion-a11y.json"), JSON.stringify(res, null, 2));
    console.log(JSON.stringify(res, null, 1));
}

main().catch((e) => { console.error("FALLO:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
