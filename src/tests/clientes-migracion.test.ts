import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, numeroDeVenta, ALMACEN } from "./helpers";

/**
 * T5-06 — la migración que agrupa las órdenes que ya existían.
 *
 * Se ejecuta **el SQL del propio archivo de migración**, no una copia: en la CI la migración
 * se aplica sobre una base vacía, así que su parte de datos nunca encuentra una orden, y sin
 * esto lo único probado de ella sería que no da error de sintaxis. El archivo se parte por su
 * marcador de datos y por cada `;` seguido de línea en blanco, como dice su comentario.
 */
const MIGRACION = path.join(process.cwd(), "prisma", "migrations", "20261002120000_t5_06_clientes", "migration.sql");
const MARCADOR = "-- ── Datos: las órdenes que ya existen";

function sentenciasDeDatos(): string[] {
    const sql = readFileSync(MIGRACION, "utf8").replace(/\r\n/g, "\n");
    const inicio = sql.indexOf(MARCADOR);
    if (inicio === -1) throw new Error(`No está el marcador «${MARCADOR}» en la migración`);

    return sql
        .slice(inicio)
        .split(/;\n\n/)
        // Un trozo que solo tiene comentarios no es una sentencia.
        .filter((trozo) => trozo.split("\n").some((linea) => linea.trim() !== "" && !linea.trim().startsWith("--")));
}

async function orden(email: string | null, nombre: string | null, telefono: string | null, dias: number) {
    return prisma.saleOrder.create({
        data: { warehouseId: ALMACEN, number: await numeroDeVenta(),
            customerEmail: email,
            customerName: nombre,
            customerPhone: telefono,
            createdAt: new Date(Date.UTC(2026, 0, 1) + dias * 86_400_000),
            items: { create: [{ productName: "Algo", quantity: 1, unitPrice: 1 }] },
        },
    });
}

describe("Migración de clientes (T5-06)", () => {
    beforeEach(async () => {
        await cleanDb();
    });

    afterAll(async () => {
        await cleanDb();
    });

    it("la parte de datos son dos sentencias: crear los clientes y vincular las órdenes", () => {
        const sentencias = sentenciasDeDatos();
        expect(sentencias).toHaveLength(2);
        expect(sentencias[0]).toMatch(/INSERT INTO "customers"/);
        expect(sentencias[1]).toMatch(/UPDATE "sale_orders"/);
    });

    it("agrupa por correo normalizado, toma el nombre y el teléfono más recientes y no agrupa por nombre", async () => {
        const antigua = await orden("Ana@Correo.com ", "Ana", "111", 1);
        const reciente = await orden("ana@correo.com", "Ana Soto", null, 5);
        const sinNombre = await orden("beto@correo.com", "   ", null, 3);
        const juan1 = await orden(null, "Juan Pérez", "222", 2);
        const juan2 = await orden(null, "Juan Pérez", "222", 4);
        const correoEnBlanco = await orden("   ", "Carla", null, 6);

        for (const sentencia of sentenciasDeDatos()) await prisma.$executeRawUnsafe(sentencia);

        const clientes = await prisma.customer.findMany({ orderBy: { email: "asc" } });
        expect(clientes).toHaveLength(2);
        expect(clientes[0]).toMatchObject({
            email: "ana@correo.com",
            // El nombre de la orden más reciente; el teléfono, de la más reciente que lo tiene.
            name: "Ana Soto",
            phone: "111",
            // Cliente desde su primera orden.
            createdAt: antigua.createdAt,
        });
        // Sin nombre en ninguna de sus órdenes, el propio correo.
        expect(clientes[1]).toMatchObject({ email: "beto@correo.com", name: "beto@correo.com", phone: null });

        const vinculo = async (id: string) => (await prisma.saleOrder.findUniqueOrThrow({ where: { id } })).customerId;
        expect(await vinculo(antigua.id)).toBe(clientes[0]!.id);
        expect(await vinculo(reciente.id)).toBe(clientes[0]!.id);
        expect(await vinculo(sinNombre.id)).toBe(clientes[1]!.id);
        // Dos «Juan Pérez» sin correo no son la misma persona, y un correo en blanco no es correo.
        expect(await vinculo(juan1.id)).toBeNull();
        expect(await vinculo(juan2.id)).toBeNull();
        expect(await vinculo(correoEnBlanco.id)).toBeNull();

        // La instantánea de la orden no se toca: sigue diciendo lo que se escribió.
        expect(await prisma.saleOrder.findUniqueOrThrow({ where: { id: antigua.id } })).toMatchObject({
            customerEmail: "Ana@Correo.com ",
            customerName: "Ana",
        });
    });

    it("la consulta de recuento de operaciones.md cuenta vinculadas y sin cliente", async () => {
        await orden("ana@correo.com", "Ana", null, 1);
        await orden(null, "Juan", null, 2);
        for (const sentencia of sentenciasDeDatos()) await prisma.$executeRawUnsafe(sentencia);

        const operaciones = readFileSync(path.join(process.cwd(), "docs", "operaciones.md"), "utf8");
        const consulta = /```sql\n(-- T5-06[\s\S]*?)```/.exec(operaciones.replace(/\r\n/g, "\n"))?.[1];
        expect(consulta).toBeDefined();

        const [fila] = await prisma.$queryRawUnsafe<Array<{ vinculadas: bigint; sin_cliente: bigint; clientes: bigint }>>(consulta!);
        expect(fila).toEqual({ vinculadas: 1n, sin_cliente: 1n, clientes: 1n });
    });
});
