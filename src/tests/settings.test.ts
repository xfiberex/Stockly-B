import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

const BASE = "/api/v1/settings";

describe("Settings API (ADMIN)", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "settings_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "settings_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.appSetting.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Guardia de autenticación y rol", () => {
        it("401: GET /settings sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("403: un USER no puede acceder a configuración", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);
            expect(res.status).toBe(403);
        });
    });

    describe("Lectura y escritura", () => {
        it("devuelve el catálogo con el valor por defecto (lowStockAlertEnabled=false)", async () => {
            const res = await request(app).get(BASE).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            const setting = res.body.data.find((s: { key: string }) => s.key === "lowStockAlertEnabled");
            expect(setting).toBeDefined();
            expect(setting.value).toBe(false);
        });

        it("actualiza en lote y persiste el nuevo valor", async () => {
            const patch = await request(app)
                .patch(BASE)
                .set("Cookie", adminCookie)
                .send({ lowStockAlertEnabled: true });
            expect(patch.status).toBe(200);

            const res = await request(app).get(BASE).set("Cookie", adminCookie);
            const setting = res.body.data.find((s: { key: string }) => s.key === "lowStockAlertEnabled");
            expect(setting.value).toBe(true);

            const stored = await prisma.appSetting.findUnique({ where: { key: "lowStockAlertEnabled" } });
            expect(stored?.value).toBe("true");
        });

        it("ignora claves desconocidas sin romper", async () => {
            const res = await request(app)
                .patch(BASE)
                .set("Cookie", adminCookie)
                .send({ claveInventada: true, lowStockAlertEnabled: false });
            expect(res.status).toBe(200);
            // Solo la clave válida del catálogo se persiste
            const stored = await prisma.appSetting.findMany();
            expect(stored.every((s) => s.key === "lowStockAlertEnabled")).toBe(true);
        });
    });
});
