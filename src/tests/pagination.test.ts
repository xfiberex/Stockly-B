import request from "supertest";
import app from "@/app";
import { parsePagination } from "@/shared/lib/pagination";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

describe("parsePagination", () => {
    it("usa los valores por defecto cuando no vienen parámetros", () => {
        expect(parsePagination({})).toEqual({ page: 1, limit: 10, skip: 0 });
    });

    it("respeta el límite por defecto indicado por cada servicio", () => {
        expect(parsePagination({}, { defaultLimit: 50 }).limit).toBe(50);
    });

    it("convierte los valores válidos y calcula el desplazamiento", () => {
        expect(parsePagination({ page: "3", limit: "20" })).toEqual({ page: 3, limit: 20, skip: 40 });
    });

    it("cae al valor por defecto con texto no numérico", () => {
        expect(parsePagination({ page: "abc", limit: "nope" })).toEqual({ page: 1, limit: 10, skip: 0 });
    });

    it("cae al valor por defecto con cero, negativos y cadena vacía", () => {
        expect(parsePagination({ page: "0", limit: "-5" })).toEqual({ page: 1, limit: 10, skip: 0 });
        expect(parsePagination({ page: "", limit: "" })).toEqual({ page: 1, limit: 10, skip: 0 });
    });

    it("aplica el techo de limit", () => {
        expect(parsePagination({ limit: "5000" }).limit).toBe(100);
        expect(parsePagination({ limit: "5000" }, { maxLimit: 25 }).limit).toBe(25);
    });

    it("acota page para que skip no desborde el entero de la base de datos", () => {
        const { page, skip } = parsePagination({ page: "99999999999999", limit: "100" });
        expect(page).toBe(1_000_000);
        expect(skip).toBeLessThan(2 ** 31);
    });
});

describe("Paginación inválida en los endpoints (T1-16)", () => {
    let adminCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "pagination_admin@example.com", role: "ADMIN" });
        adminCookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    const casos: Array<[string, string, number]> = [
        ["productos con page no numérico", "/api/v1/products?page=abc", 10],
        ["productos con limit no numérico", "/api/v1/products?limit=abc", 10],
        ["usuarios con page no numérico", "/api/v1/users?page=xyz", 20],
        ["auditoría con limit no numérico", "/api/v1/audit-logs?limit=nope", 50],
        ["órdenes de venta con page no numérico", "/api/v1/sale-orders?page=abc", 10],
    ];

    it.each(casos)("200 y paginación por defecto: %s", async (_nombre, url, limit) => {
        const res = await request(app).get(url).set("Cookie", adminCookie);
        expect(res.status).toBe(200);
        expect(res.body.data.meta).toMatchObject({ page: 1, limit });
    });
});
