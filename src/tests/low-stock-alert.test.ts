import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    // T2-32: el mock debe exportar **todo** lo que las rutas importan de este módulo.
    // Sin esta línea, Express recibe `undefined` como manejador y la suite no arranca.
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn().mockResolvedValue({ url: "https://x/y.jpg", publicId: "x/y" }),
    deleteFromCloudinary: jest.fn().mockResolvedValue(undefined),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

import { sendLowStockAlertEmail } from "@/shared/lib/nodemailer";
import { esperarAlertasEnVuelo } from "@/shared/lib/stockAlerts";

const BASE = "/api/v1/products";

describe("Flujo de alerta de bajo stock", () => {
    let adminCookie: string;

    beforeEach(async () => {
        await cleanDb();
        (sendLowStockAlertEmail as jest.Mock).mockClear();
        const admin = await createUser({ email: "alert_admin@example.com", name: "Admin Alerta", role: "ADMIN" });
        adminCookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    it("NO envía alerta cuando la configuración está desactivada (por defecto)", async () => {
        const product = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

        const res = await request(app)
            .post(`${BASE}/${product.id}/movements`)
            .set("Cookie", adminCookie)
            .send({ type: "OUT", quantity: 2, reason: "Venta" });

        expect(res.status).toBe(201);
        await esperarAlertasEnVuelo();
        expect(sendLowStockAlertEmail).not.toHaveBeenCalled();
    });

    it("envía alerta a los administradores cuando el stock cae por debajo del mínimo y la alerta está activa", async () => {
        await prisma.appSetting.create({ data: { key: "lowStockAlertEnabled", value: "true" } });
        const product = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

        const res = await request(app)
            .post(`${BASE}/${product.id}/movements`)
            .set("Cookie", adminCookie)
            .send({ type: "OUT", quantity: 2, reason: "Venta" });

        expect(res.status).toBe(201);
        await esperarAlertasEnVuelo();
        expect(sendLowStockAlertEmail).toHaveBeenCalledTimes(1);
        expect(sendLowStockAlertEmail).toHaveBeenCalledWith(
            "alert_admin@example.com",
            "Admin Alerta",
            "Cable HDMI",
            4, // 6 - 2
            5,
            // T4-12: el idioma del administrador que la recibe, leído de su fila.
            "ES",
        );
    });

    // T2-07: el criterio es que el tiempo de respuesta no dependa de la latencia
    // del SMTP. Se comprueba haciendo lento el envío a propósito: si la respuesta
    // siguiera esperándolo, tardaría al menos lo que tarda el correo.
    it("la respuesta no espera al servidor de correo", async () => {
        const RETRASO_SMTP = 500;
        (sendLowStockAlertEmail as jest.Mock).mockImplementationOnce(
            () => new Promise((resolve) => setTimeout(resolve, RETRASO_SMTP)),
        );
        await prisma.appSetting.create({ data: { key: "lowStockAlertEnabled", value: "true" } });
        const product = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

        const inicio = Date.now();
        const res = await request(app)
            .post(`${BASE}/${product.id}/movements`)
            .set("Cookie", adminCookie)
            .send({ type: "OUT", quantity: 2, reason: "Venta" });
        const tardanza = Date.now() - inicio;

        expect(res.status).toBe(201);
        expect(tardanza).toBeLessThan(RETRASO_SMTP);

        // Y el correo sale igual, solo que después: no se ha perdido nada.
        await esperarAlertasEnVuelo();
        expect(sendLowStockAlertEmail).toHaveBeenCalledTimes(1);
    });

    it("un fallo del correo no rompe la operación ya guardada", async () => {
        (sendLowStockAlertEmail as jest.Mock).mockRejectedValueOnce(new Error("SMTP caído"));
        await prisma.appSetting.create({ data: { key: "lowStockAlertEnabled", value: "true" } });
        const product = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 6, minStock: 5 } });

        const res = await request(app)
            .post(`${BASE}/${product.id}/movements`)
            .set("Cookie", adminCookie)
            .send({ type: "OUT", quantity: 2, reason: "Venta" });
        await esperarAlertasEnVuelo();

        expect(res.status).toBe(201);
        // El movimiento quedó registrado pese al fallo del envío.
        const movimientos = await prisma.stockMovement.count({ where: { productId: product.id } });
        expect(movimientos).toBe(1);
    });

    it("NO envía alerta si el stock se mantiene por encima del mínimo", async () => {
        await prisma.appSetting.create({ data: { key: "lowStockAlertEnabled", value: "true" } });
        const product = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 20, minStock: 5 } });

        const res = await request(app)
            .post(`${BASE}/${product.id}/movements`)
            .set("Cookie", adminCookie)
            .send({ type: "OUT", quantity: 2, reason: "Venta" });

        expect(res.status).toBe(201);
        await esperarAlertasEnVuelo();
        expect(sendLowStockAlertEmail).not.toHaveBeenCalled();
    });
});
