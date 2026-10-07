import { prisma } from "@/shared/lib/prisma";
import { env } from "@/config/env";
import { cleanDb, createUser, numeroDeVenta } from "./helpers";

/**
 * T5-11 — el resumen semanal por correo.
 *
 * Los tres criterios de la ficha, y lo que los sostiene:
 *
 * 1. Ejecutar el comando dos veces el mismo día no envía dos correos.
 * 2. Con el ajuste desactivado no envía nada y sale con 0.
 * 3. Cada ADMIN lo recibe en su idioma.
 *
 * Se sustituye el transporte, no el módulo de correo: lo que se quiere leer es el asunto y el
 * HTML que habría salido, como en `correos-idioma.test.ts`.
 */

const enviados: Array<{ to: string; subject: string; html: string }> = [];
/** Direcciones a las que el «servidor SMTP» rechaza el envío. */
const rechazados = new Set<string>();

jest.mock("nodemailer", () => ({
    __esModule: true,
    default: {
        createTransport: () => ({
            sendMail: jest.fn(async (correo: { to: string; subject: string; html: string }) => {
                if (rechazados.has(correo.to)) throw new Error("550 buzón no disponible");
                enviados.push(correo);
                return { messageId: "test" };
            }),
        }),
    },
}));

import { enviarResumenSemanal, reunirDatosDelResumen, semanaAnterior } from "@/shared/lib/resumenSemanal";
import { ejecutar, informeDe } from "@/cli/resumen-semanal";

/** Miércoles 30 de septiembre de 2026, 11:00 en Santo Domingo (UTC−4): resume del lunes 21 al domingo 27. */
const AHORA = new Date("2026-09-30T15:00:00Z");
const SEMANA = { from: "2026-09-21", to: "2026-09-27" };
const ZONA = "America/Santo_Domingo";
const DIA = 86_400_000;

/** `env` es de solo lectura para el compilador, no para el proceso: así se simula un despliegue sin SMTP. */
const smtpConfigurado = (valor: boolean) => {
    (env.smtp as { configured: boolean }).configured = valor;
};

const activar = () => prisma.appSetting.create({ data: { key: "weeklyDigestEnabled", value: "true" } });

const admin = (email: string, idioma: "ES" | "EN" = "ES") => createUser({ email, role: "ADMIN", idioma, name: `Admin ${email}` });

async function venta(status: "PENDING" | "SHIPPED" | "CANCELLED", shippedAt: string | null, items: Array<[string, number, number]>, createdAt = "2026-09-15T12:00:00Z") {
    return prisma.saleOrder.create({
        data: { number: await numeroDeVenta(),
            status,
            customerName: "Cliente Confidencial",
            shippedAt: shippedAt ? new Date(shippedAt) : null,
            createdAt: new Date(createdAt),
            items: { create: items.map(([productName, quantity, unitPrice]) => ({ productName, quantity, unitPrice })) },
        },
    });
}

beforeEach(async () => {
    await cleanDb();
    enviados.length = 0;
    rechazados.clear();
});

afterAll(async () => {
    await cleanDb();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("semanaAnterior", () => {
    it.each([
        ["un lunes", "2026-09-28", "2026-09-21", "2026-09-27"],
        ["un miércoles", "2026-09-30", "2026-09-21", "2026-09-27"],
        // El domingo todavía es de la semana en curso: la completa anterior es la de antes.
        ["un domingo", "2026-10-04", "2026-09-21", "2026-09-27"],
        ["a caballo entre dos años", "2027-01-01", "2026-12-21", "2026-12-27"],
        ["a caballo entre dos meses", "2026-03-04", "2026-02-23", "2026-03-01"],
    ])("lanzado %s resume la semana natural completa anterior, de lunes a domingo", (_caso, hoy, from, to) => {
        expect(semanaAnterior(hoy)).toEqual({ from, to });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("enviarResumenSemanal", () => {
    it("con el ajuste desactivado no envía nada ni reclama la semana (criterio de T5-11)", async () => {
        await admin("a@stockly.test");

        expect(await enviarResumenSemanal(AHORA)).toEqual({ estado: "desactivado" });

        expect(enviados).toHaveLength(0);
        expect(await prisma.weeklyDigest.count()).toBe(0);
    });

    it("cada ADMIN activo y verificado lo recibe en su idioma, y nadie más (criterio de T5-11)", async () => {
        await activar();
        const es = await admin("ana@stockly.test", "ES");
        const en = await admin("bob@stockly.test", "EN");
        await createUser({ email: "usuario@stockly.test", role: "USER" });
        await createUser({ email: "almacen@stockly.test", role: "WAREHOUSE" });
        await createUser({ email: "sinverificar@stockly.test", role: "ADMIN", isVerified: false });
        const inactivo = await admin("inactivo@stockly.test");
        await prisma.user.update({ where: { id: inactivo.id }, data: { isActive: false } });

        const resultado = await enviarResumenSemanal(AHORA);

        expect(resultado).toEqual({ estado: "enviado", enviados: 2, fallidos: 0, ...SEMANA });
        expect(enviados.map((c) => c.to).sort()).toEqual(["ana@stockly.test", "bob@stockly.test"]);

        const paraAna = enviados.find((c) => c.to === "ana@stockly.test")!;
        expect(paraAna.subject).toMatch(/^Resumen semanal: .*21.*27.*2026 — Stockly$/);
        expect(paraAna.html).toContain('<html lang="es"');
        expect(paraAna.html).toContain("Lo más vendido de la semana");

        const paraBob = enviados.find((c) => c.to === "bob@stockly.test")!;
        expect(paraBob.subject).toMatch(/^Weekly digest: .*21.*27.*2026 — Stockly$/);
        expect(paraBob.html).toContain('<html lang="en"');
        expect(paraBob.html).toContain("Best sellers of the week");
        expect(paraBob.html).not.toContain("Lo más vendido");

        const fila = await prisma.weeklyDigest.findUniqueOrThrow({ where: { weekStart: SEMANA.from } });
        expect(fila.weekEnd).toBe(SEMANA.to);
        expect([...fila.sentToUserIds].sort()).toEqual([es.id, en.id].sort());
        expect(fila.finishedAt).not.toBeNull();
    });

    it("ejecutarlo dos veces el mismo día no envía dos correos (criterio de T5-11)", async () => {
        await activar();
        await admin("ana@stockly.test");
        await enviarResumenSemanal(AHORA);

        const segunda = await enviarResumenSemanal(new Date(AHORA.getTime() + 60_000));

        expect(segunda).toEqual({ estado: "ya-enviado", ...SEMANA });
        expect(enviados).toHaveLength(1);
    });

    it("ni otro día de la misma semana; la semana siguiente, sí", async () => {
        await activar();
        await admin("ana@stockly.test");
        await enviarResumenSemanal(AHORA);

        expect((await enviarResumenSemanal(new Date(AHORA.getTime() + 3 * DIA))).estado).toBe("ya-enviado");
        expect(enviados).toHaveLength(1);

        const siguiente = await enviarResumenSemanal(new Date(AHORA.getTime() + 7 * DIA));

        expect(siguiente).toMatchObject({ estado: "enviado", enviados: 1, from: "2026-09-28", to: "2026-10-04" });
        expect(enviados).toHaveLength(2);
        expect(await prisma.weeklyDigest.count()).toBe(2);
    });

    it("si un envío falla, lo cuenta, y al repetir se reintenta solo con ese", async () => {
        await activar();
        const ana = await admin("ana@stockly.test");
        await admin("bob@stockly.test");
        rechazados.add("bob@stockly.test");

        const primera = await enviarResumenSemanal(AHORA);

        expect(primera).toMatchObject({ estado: "enviado", enviados: 1, fallidos: 1 });
        expect((await prisma.weeklyDigest.findFirstOrThrow()).sentToUserIds).toEqual([ana.id]);

        rechazados.clear();
        const segunda = await enviarResumenSemanal(new Date(AHORA.getTime() + 60_000));

        expect(segunda).toMatchObject({ estado: "enviado", enviados: 1, fallidos: 0 });
        expect(enviados.map((c) => c.to)).toEqual(["ana@stockly.test", "bob@stockly.test"]);
    });

    it("un administrador dado de alta después lo recibe al repetir, y los demás no otra vez", async () => {
        await activar();
        await admin("ana@stockly.test");
        await enviarResumenSemanal(AHORA);
        await admin("nuevo@stockly.test");

        const segunda = await enviarResumenSemanal(new Date(AHORA.getTime() + DIA));

        expect(segunda).toMatchObject({ estado: "enviado", enviados: 1, fallidos: 0 });
        expect(enviados.map((c) => c.to)).toEqual(["ana@stockly.test", "nuevo@stockly.test"]);
    });

    it("mientras otra ejecución la está enviando, no hace nada", async () => {
        await activar();
        await admin("ana@stockly.test");
        await prisma.weeklyDigest.create({
            data: { weekStart: SEMANA.from, weekEnd: SEMANA.to, startedAt: new Date(AHORA.getTime() - 60_000) },
        });

        expect(await enviarResumenSemanal(AHORA)).toEqual({ estado: "en-curso", ...SEMANA });
        expect(enviados).toHaveLength(0);
    });

    it("una ejecución que murió a medias se retoma pasado un rato", async () => {
        await activar();
        const ana = await admin("ana@stockly.test");
        await admin("bob@stockly.test");
        await prisma.weeklyDigest.create({
            data: { weekStart: SEMANA.from, weekEnd: SEMANA.to, startedAt: new Date(AHORA.getTime() - 3_600_000), sentToUserIds: [ana.id] },
        });

        const resultado = await enviarResumenSemanal(AHORA);

        expect(resultado).toMatchObject({ estado: "enviado", enviados: 1, fallidos: 0 });
        expect(enviados.map((c) => c.to)).toEqual(["bob@stockly.test"]);
    });

    it("dos ejecuciones a la vez envían un solo correo a cada administrador", async () => {
        await activar();
        await admin("ana@stockly.test");
        await admin("bob@stockly.test");

        const resultados = await Promise.all([enviarResumenSemanal(AHORA), enviarResumenSemanal(AHORA)]);

        expect(resultados.map((r) => r.estado).sort()).toEqual(["en-curso", "enviado"]);
        expect(enviados.map((c) => c.to).sort()).toEqual(["ana@stockly.test", "bob@stockly.test"]);
    });

    it("sin ningún administrador que lo reciba, lo dice y no reclama la semana", async () => {
        await activar();
        await createUser({ email: "usuario@stockly.test", role: "USER" });

        expect(await enviarResumenSemanal(AHORA)).toEqual({ estado: "sin-destinatarios" });
        expect(await prisma.weeklyDigest.count()).toBe(0);
    });

    it("activado pero sin SMTP configurado, falla diciendo qué falta y deja la semana libre", async () => {
        await activar();
        await admin("ana@stockly.test");
        smtpConfigurado(false);

        try {
            await expect(enviarResumenSemanal(AHORA)).rejects.toThrow(/SMTP_HOST/);
            expect(await prisma.weeklyDigest.count()).toBe(0);
        } finally {
            smtpConfigurado(true);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Lo que cuenta el resumen", () => {
    it("las ventas son las enviadas en la semana, con sus extremos en la zona del negocio", async () => {
        // Domingo 27 a las 23:30 de Santo Domingo: dentro. Lunes 21 a las 00:30: dentro.
        await venta("SHIPPED", "2026-09-28T03:30:00Z", [["Teclado", 3, 50], ["Ratón", 1, 20]]);
        await venta("SHIPPED", "2026-09-21T04:30:00Z", [["Teclado", 2, 50]]);
        // Lunes 28 a las 00:30 y domingo 20 a las 23:30: fuera, aunque en UTC caigan «en la semana».
        await venta("SHIPPED", "2026-09-28T04:30:00Z", [["Monitor", 9, 999]]);
        await venta("SHIPPED", "2026-09-21T03:30:00Z", [["Monitor", 9, 999]]);
        // Cancelada tras enviarse: conserva `shippedAt`, y no cuenta.
        await venta("CANCELLED", "2026-09-24T12:00:00Z", [["Monitor", 9, 999]]);

        const datos = await reunirDatosDelResumen(SEMANA, ZONA, "2026-09-30");

        expect(datos.ventas).toEqual({ ordenes: 2, unidades: 6, importe: 270 });
        expect(datos.masVendido).toEqual([
            { nombre: "Teclado", unidades: 5, importe: 250 },
            { nombre: "Ratón", unidades: 1, importe: 20 },
        ]);
    });

    it("lo pendiente, el stock bajo y las compras fuera de plazo son los de hoy", async () => {
        const antigua = await venta("PENDING", null, [["Cable", 2, 7.5]], "2026-08-01T12:00:00Z");
        await venta("PENDING", null, [["Cable", 1, 7.5]], "2026-09-29T12:00:00Z");

        await prisma.product.createMany({
            data: [
                { name: "Agotado", price: 1, stock: 0, minStock: 5 },
                { name: "Justo", price: 1, stock: 3, minStock: 3 },
                { name: "Sobrado", price: 1, stock: 10, minStock: 3 },
                { name: "Descatalogado", price: 1, stock: 0, minStock: 5, isActive: false },
            ],
        });

        // Plazo del proveedor, 3 días: pedida el 20, debía llegar el 23; el 30 lleva 7 de retraso.
        const proveedor = await prisma.supplier.create({ data: { name: "Lento S.A.", leadTimeDays: 3 } });
        const tarde = await prisma.purchaseOrder.create({ data: { supplierId: proveedor.id, createdAt: new Date("2026-09-20T16:00:00Z") } });
        // Sin proveedor: el plazo por defecto de Configuración, 7 días. Pedida el 10, 13 de retraso.
        const sinProveedor = await prisma.purchaseOrder.create({ data: { status: "PARTIALLY_RECEIVED", createdAt: new Date("2026-09-10T16:00:00Z") } });
        // Dentro de plazo, y una recibida hace meses: ninguna de las dos.
        await prisma.purchaseOrder.create({ data: { createdAt: new Date("2026-09-25T16:00:00Z") } });
        await prisma.purchaseOrder.create({ data: { status: "RECEIVED", createdAt: new Date("2026-01-10T16:00:00Z") } });

        const datos = await reunirDatosDelResumen(SEMANA, ZONA, "2026-09-30");

        expect(datos.pendientes.total).toBe(2);
        expect(datos.pendientes.ordenes[0]).toMatchObject({ id: antigua.id, numero: antigua.number, importe: 15 });
        expect(datos.stockBajo).toEqual({
            total: 2,
            productos: [
                { nombre: "Agotado", stock: 0, minimo: 5 },
                { nombre: "Justo", stock: 3, minimo: 3 },
            ],
        });
        expect(datos.comprasAtrasadas).toEqual({
            total: 2,
            ordenes: [
                { id: sinProveedor.id, proveedor: null, diasDeRetraso: 13 },
                { id: tarde.id, proveedor: "Lento S.A.", diasDeRetraso: 7 },
            ],
        });
    });

    it("el correo lleva las cifras, escapa lo que viene de la base y no nombra a ningún cliente", async () => {
        await activar();
        await admin("ana@stockly.test");
        await venta("SHIPPED", "2026-09-24T12:00:00Z", [["<script>alert(1)</script>", 2, 1234.5]]);
        const pendiente = await venta("PENDING", null, [["Cable", 1, 10]]);
        await prisma.product.createMany({
            data: Array.from({ length: 12 }, (_, i) => ({ name: `Bajo ${String(i).padStart(2, "0")}`, price: 1, stock: 0, minStock: 1 })),
        });

        await enviarResumenSemanal(AHORA);

        const { html } = enviados[0]!;
        expect(html).toContain("$2,469.00");
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("Cliente Confidencial");
        // T6-04 — la venta pendiente se nombra por su correlativo, no por el principio de su id.
        expect(pendiente.number).toBe(2);
        expect(html).toContain("Venta #000002");
        expect(html).not.toContain(pendiente.id.slice(0, 8).toUpperCase());
        // Doce en stock bajo, y la tabla enseña diez.
        expect(html).toContain("Se muestran 10 de 12.");
        expect(html).toContain("Bajo 09");
        expect(html).not.toContain("Bajo 10");
        // Sin compras fuera de plazo, esa sección no sale.
        expect(html).not.toContain("<h2 style=\"margin:24px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#111827;\">Compras fuera de plazo");
    });

    it("una semana sin ventas lo dice, en vez de dejar la sección vacía", async () => {
        await activar();
        await admin("ana@stockly.test");

        await enviarResumenSemanal(AHORA);

        expect(enviados[0]!.html).toContain("No se envió ninguna venta esa semana.");
        expect(enviados[0]!.html).not.toContain("Stock bajo</h2>");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("El comando", () => {
    let salida: jest.SpyInstance;
    let errores: jest.SpyInstance;

    beforeEach(() => {
        salida = jest.spyOn(console, "log").mockImplementation(() => {});
        errores = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        salida.mockRestore();
        errores.mockRestore();
    });

    it("con el ajuste desactivado sale con 0 y lo dice (criterio de T5-11)", async () => {
        await admin("ana@stockly.test");

        expect(await ejecutar(AHORA)).toBe(0);

        expect(salida).toHaveBeenCalledWith(expect.stringContaining("desactivado"));
        expect(enviados).toHaveLength(0);
    });

    it("sale con 0 al enviar y con 0 al repetir", async () => {
        await activar();
        await admin("ana@stockly.test");

        expect(await ejecutar(AHORA)).toBe(0);
        expect(await ejecutar(AHORA)).toBe(0);

        expect(enviados).toHaveLength(1);
        expect(salida).toHaveBeenLastCalledWith(expect.stringContaining("ya se envió"));
    });

    it("sale con 1 si algún envío falla, para que el planificador avise", async () => {
        await activar();
        await admin("ana@stockly.test");
        rechazados.add("ana@stockly.test");

        expect(await ejecutar(AHORA)).toBe(1);
        expect(errores).toHaveBeenCalledWith(expect.stringContaining("1 fallido(s)"));
    });

    it("sale con 1 si el resumen está activado y no hay SMTP", async () => {
        await activar();
        await admin("ana@stockly.test");
        smtpConfigurado(false);

        try {
            expect(await ejecutar(AHORA)).toBe(1);
            expect(errores).toHaveBeenCalledWith(expect.stringContaining("SMTP_HOST"));
        } finally {
            smtpConfigurado(true);
        }
    });

    it.each([
        [{ estado: "sin-destinatarios" } as const, 0],
        [{ estado: "en-curso", ...SEMANA } as const, 0],
        [{ estado: "enviado", enviados: 2, fallidos: 0, ...SEMANA } as const, 0],
        [{ estado: "enviado", enviados: 0, fallidos: 2, ...SEMANA } as const, 1],
    ])("el código de salida de %j es %i", (resultado, codigo) => {
        expect(informeDe(resultado).codigo).toBe(codigo);
    });
});
