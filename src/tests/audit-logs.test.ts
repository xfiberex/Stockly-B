import request from "supertest";
import app from "@/app";
import { auditService } from "@/modules/audit-logs";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

const BASE = "/api/v1/audit-logs";

describe("Audit Logs API (ADMIN)", () => {
    let adminCookie: string;
    let userCookie: string;
    let adminId: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "audit_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "audit_user@example.com", role: "USER" });
        adminId = admin.id;
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Guardia de autenticación y rol", () => {
        it("401: GET /audit-logs sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("403: un USER no puede ver la auditoría", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);
            expect(res.status).toBe(403);
        });
    });

    describe("Listado, filtros y paginación", () => {
        beforeEach(async () => {
            await auditService.log({ userId: adminId, userEmail: "audit_admin@example.com" }, "CREATE", "Product", "p1");
            await auditService.log({ userId: adminId, userEmail: "audit_admin@example.com" }, "DELETE", "Product", "p2");
            await auditService.log({ userId: adminId, userEmail: "audit_admin@example.com" }, "SALE_SHIP", "SaleOrder", "s1");
        });

        it("ADMIN obtiene registros con meta de paginación", async () => {
            const res = await request(app).get(BASE).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.meta.total).toBe(3);
            expect(res.body.data.data).toHaveLength(3);
        });

        it("filtra por entidad", async () => {
            const res = await request(app).get(`${BASE}?entity=SaleOrder`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(1);
            expect(res.body.data.data[0].entity).toBe("SaleOrder");
        });

        it("filtra por acción", async () => {
            const res = await request(app).get(`${BASE}?action=DELETE`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(1);
            expect(res.body.data.data[0].action).toBe("DELETE");
        });

        it("respeta el límite por página", async () => {
            const res = await request(app).get(`${BASE}?limit=2`).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(2);
            expect(res.body.data.meta.totalPages).toBe(2);
        });
    });
});
