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
    uploadToCloudinary: jest.fn().mockResolvedValue({ url: "https://x/y.jpg", publicId: "x/y" }),
    deleteFromCloudinary: jest.fn().mockResolvedValue(undefined),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

import { sendLowStockAlertEmail } from "@/shared/lib/nodemailer";

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
        expect(sendLowStockAlertEmail).toHaveBeenCalledTimes(1);
        expect(sendLowStockAlertEmail).toHaveBeenCalledWith(
            "alert_admin@example.com",
            "Admin Alerta",
            "Cable HDMI",
            4, // 6 - 2
            5,
        );
    });

    it("NO envía alerta si el stock se mantiene por encima del mínimo", async () => {
        await prisma.appSetting.create({ data: { key: "lowStockAlertEnabled", value: "true" } });
        const product = await prisma.product.create({ data: { name: "Cable HDMI", price: 10, stock: 20, minStock: 5 } });

        const res = await request(app)
            .post(`${BASE}/${product.id}/movements`)
            .set("Cookie", adminCookie)
            .send({ type: "OUT", quantity: 2, reason: "Venta" });

        expect(res.status).toBe(201);
        expect(sendLowStockAlertEmail).not.toHaveBeenCalled();
    });
});
