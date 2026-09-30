import { spec } from "@/swagger";
import { MONTAJES } from "@/routes";

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

/**
 * Los prefijos con los que `src/routes/index.ts` monta cada módulo, leídos de allí (T5-07): la copia
 * que había aquí se habría quedado atrás con el primer módulo nuevo.
 */
const MODULOS: Array<[string, unknown]> = MONTAJES.map(([prefijo, modulo]) => [prefijo, modulo]);

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
