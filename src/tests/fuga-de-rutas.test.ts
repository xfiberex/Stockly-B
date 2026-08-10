import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { errorHandler } from "@/shared/middlewares/error.middleware";
import { cleanDb, createUser, getAuthCookie } from "./helpers";
import type { Request, Response, NextFunction } from "express";

/**
 * T3-13 — que ningún entorno devuelva rutas del sistema de archivos en un error.
 *
 * Fuera de producción el manejador respondía `err.message` íntegro. El mensaje de un
 * error de Prisma no es una frase: trae la consulta completa y **la ruta absoluta del
 * archivo fuente**, que revela el usuario del sistema y la estructura de directorios de
 * la máquina. Reproducido de verdad durante T3-02: `?status=toString` provocaba un 500
 * cuyo cuerpo incluía `C:\Users\…\src\modules\sale-orders\sale-orders.service.ts:32:30`.
 *
 * El compose ya fija `NODE_ENV=production`, pero eso solo protege a quien se acuerde de
 * fijarlo. La garantía no puede depender de una variable bien puesta, así que el saneado
 * se aplica también en desarrollo. El mensaje completo sigue yendo al log, que es donde
 * un desarrollador debe mirar y adonde no llega un cliente.
 */

// Copiado literalmente de la salida real de Prisma capturada en T3-02.
const MENSAJE_DE_PRISMA = [
    "Invalid `prisma.saleOrder.count()` invocation in",
    "C:\\Users\\User\\Desktop\\Desarrollo y Proyectos\\Cursos y Proyectos\\14 - IA Mentor\\01-Stockly\\Stockly-B\\src\\modules\\sale-orders\\sale-orders.service.ts:32:30",
    "",
    "Invalid value for argument `status`. Expected SaleOrderStatus.",
].join("\n");

const MENSAJE_EN_CONTENEDOR =
    "Cannot find module '/app/dist/modules/products/product.service.js' imported from /app/dist/server.js";

function responseFalso() {
    const cuerpo: { valor?: Record<string, unknown> } = {};
    const res: Record<string, jest.Mock> = {
        status: jest.fn(() => res),
        json: jest.fn((v: Record<string, unknown>) => {
            cuerpo.valor = v;
            return res;
        }),
        getHeader: jest.fn(() => "req-de-prueba"),
    };
    return { res: res as unknown as Response, cuerpo };
}

function requestFalso(registro: jest.Mock) {
    return {
        method: "GET",
        originalUrl: "/api/v1/sale-orders",
        log: { error: registro },
    } as unknown as Request;
}

describe("Fuga de rutas del sistema en errores (T3-13)", () => {
    describe("El manejador sanea el mensaje que envía al cliente", () => {
        it("no devuelve la ruta absoluta que trae un error de Prisma", () => {
            const registro = jest.fn();
            const { res, cuerpo } = responseFalso();

            errorHandler(new Error(MENSAJE_DE_PRISMA), requestFalso(registro), res, jest.fn() as NextFunction);

            const mensaje = String(cuerpo.valor?.["message"]);
            expect(mensaje).not.toMatch(/C:\\/);
            expect(mensaje).not.toMatch(/sale-orders\.service\.ts/);
            expect(mensaje).not.toMatch(/Desktop/);
        });

        it("tampoco las rutas POSIX del contenedor", () => {
            const registro = jest.fn();
            const { res, cuerpo } = responseFalso();

            errorHandler(new Error(MENSAJE_EN_CONTENEDOR), requestFalso(registro), res, jest.fn() as NextFunction);

            const mensaje = String(cuerpo.valor?.["message"]);
            expect(mensaje).not.toMatch(/\/app\//);
            expect(mensaje).not.toMatch(/product\.service\.js/);
        });

        it("conserva la parte del mensaje que sí explica el fallo", () => {
            // Sanear no es borrar: lo que queda debe seguir sirviendo para depurar.
            const registro = jest.fn();
            const { res, cuerpo } = responseFalso();

            errorHandler(new Error(MENSAJE_DE_PRISMA), requestFalso(registro), res, jest.fn() as NextFunction);

            expect(String(cuerpo.valor?.["message"])).toMatch(/Expected SaleOrderStatus/);
        });

        it("el log conserva el error completo, con ruta incluida", () => {
            // La información no se pierde: cambia de canal. El `requestId` de la respuesta
            // es lo que permite ir del cuerpo saneado a la línea de log entera (T2-10).
            const registro = jest.fn();
            const { res, cuerpo } = responseFalso();

            errorHandler(new Error(MENSAJE_DE_PRISMA), requestFalso(registro), res, jest.fn() as NextFunction);

            const [datos] = registro.mock.calls[0] as [{ err: Error }];
            expect(datos.err.message).toContain("sale-orders.service.ts:32:30");
            expect(cuerpo.valor?.["requestId"]).toBe("req-de-prueba");
        });

        it("un mensaje normal pasa intacto", () => {
            const registro = jest.fn();
            const { res, cuerpo } = responseFalso();

            errorHandler(new Error("La conexión con la base de datos se cerró"), requestFalso(registro), res, jest.fn() as NextFunction);

            expect(cuerpo.valor?.["message"]).toBe("La conexión con la base de datos se cerró");
        });
    });

    describe("A través de una petición real", () => {
        let adminCookie: string;

        beforeAll(async () => {
            await cleanDb();
            const admin = await createUser({ email: "fuga_admin@example.com", role: "ADMIN" });
            adminCookie = getAuthCookie(admin.id);
        });

        afterAll(async () => {
            await cleanDb();
        });

        it("un fallo inesperado de Prisma no filtra la ruta del archivo", async () => {
            const espia = jest
                .spyOn(prisma, "$transaction")
                .mockRejectedValueOnce(new Error(MENSAJE_DE_PRISMA));

            const res = await request(app).get("/api/v1/products").set("Cookie", adminCookie);

            expect(res.status).toBe(500);
            expect(JSON.stringify(res.body)).not.toMatch(/Desktop|C:\\\\|\.service\.ts/);
            expect(res.body.requestId).toBeDefined();

            espia.mockRestore();
        });
    });
});
