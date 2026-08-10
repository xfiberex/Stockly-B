import { spec } from "@/swagger";
import { productRouter } from "@/modules/products";
import { authRouter } from "@/modules/auth";
import { categoriesRouter } from "@/modules/categories";
import { brandsRouter } from "@/modules/brands";
import { suppliersRouter } from "@/modules/suppliers";
import { purchaseOrdersRouter } from "@/modules/purchase-orders";
import { reportsRouter } from "@/modules/reports";
import { tagsRouter } from "@/modules/tags";
import { usersRouter } from "@/modules/users";
import { settingsRouter } from "@/modules/settings";
import { auditLogsRouter } from "@/modules/audit-logs";
import { saleOrdersRouter } from "@/modules/sale-orders";

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn(),
    deleteFromCloudinary: jest.fn(),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

// T2-30: el spec documentaba tres módulos de doce, y nada impedía que el siguiente
// endpoint naciera sin documentar. Una lista escrita a mano se queda vieja en cuanto
// alguien añade una ruta, así que lo que se comprueba aquí es **el router real**:
// se recorre el árbol de Express y se exige que cada operación exista en el spec.

/** Los mismos prefijos con los que `src/routes/index.ts` monta cada módulo. */
const MODULOS: Array<[string, unknown]> = [
    ["/auth", authRouter],
    ["/products", productRouter],
    ["/categories", categoriesRouter],
    ["/brands", brandsRouter],
    ["/suppliers", suppliersRouter],
    ["/purchase-orders", purchaseOrdersRouter],
    ["/sale-orders", saleOrdersRouter],
    ["/reports", reportsRouter],
    ["/tags", tagsRouter],
    ["/users", usersRouter],
    ["/settings", settingsRouter],
    ["/audit-logs", auditLogsRouter],
];

type Capa = { route?: { path: string; methods: Record<string, boolean> } };

/** `GET /products/{id}` — con las llaves de OpenAPI, no los `:` de Express. */
function operacionesDe(prefijo: string, router: unknown): string[] {
    const capas = (router as { stack: Capa[] }).stack;
    const salida: string[] = [];
    for (const capa of capas) {
        if (!capa.route) continue;
        const ruta = capa.route.path === "/" ? "" : capa.route.path;
        const openapi = (prefijo + ruta).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
        for (const metodo of Object.keys(capa.route.methods)) {
            salida.push(`${metodo.toUpperCase()} ${openapi}`);
        }
    }
    return salida;
}

const documentadas = new Set(
    Object.entries(spec.paths as Record<string, Record<string, unknown>>).flatMap(([ruta, ops]) =>
        Object.keys(ops).map((metodo) => `${metodo.toUpperCase()} ${ruta}`),
    ),
);

describe("Cobertura del spec de Swagger (T2-30)", () => {
    it.each(MODULOS)("%s: todas sus operaciones están documentadas", (prefijo, router) => {
        const faltan = operacionesDe(prefijo as string, router).filter((op) => !documentadas.has(op));

        expect(faltan).toEqual([]);
    });

    it("las rutas de salud también", () => {
        // Viven en el router raíz, no en un módulo, y por eso se comprueban aparte.
        expect(documentadas.has("GET /health")).toBe(true);
        expect(documentadas.has("GET /ready")).toBe(true);
    });

    it("el spec no documenta operaciones que no existen", () => {
        // El sentido contrario: documentación que promete rutas inexistentes es peor que
        // no tenerla, porque el «Try it out» acaba en 404 sin explicación.
        const reales = new Set([
            ...MODULOS.flatMap(([p, r]) => operacionesDe(p as string, r)),
            "GET /health",
            "GET /ready",
        ]);

        expect([...documentadas].filter((op) => !reales.has(op))).toEqual([]);
    });
});
