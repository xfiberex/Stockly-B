import { buildCsv } from "@/shared/lib/csv";

describe("buildCsv", () => {
    it("devuelve cadena vacía sin filas", () => {
        expect(buildCsv([])).toBe("");
    });

    it("genera encabezado a partir de las claves de la primera fila", () => {
        const csv = buildCsv([{ name: "A", price: 10 }]);
        expect(csv.split("\n")[0]).toBe("name,price");
    });

    it("escapa comas y comillas envolviendo en comillas dobles", () => {
        const csv = buildCsv([{ name: 'Monitor, 27"' }]);
        expect(csv.split("\n")[1]).toBe('"Monitor, 27"""');
    });

    it("convierte null/undefined en cadena vacía", () => {
        const csv = buildCsv([{ a: null, b: undefined }]);
        expect(csv.split("\n")[1]).toBe(",");
    });

    it("neutraliza inyección de fórmulas anteponiendo apóstrofo", () => {
        const rows = [
            { a: "=1+1", b: "+cmd", c: "-2", d: "@x" },
        ];
        const dataLine = buildCsv(rows).split("\n")[1];
        // Cada celda peligrosa queda prefijada con ' para que Excel/Sheets no la evalúe.
        expect(dataLine).toBe("'=1+1,'+cmd,'-2,'@x");
    });

    it("no altera valores seguros", () => {
        const csv = buildCsv([{ name: "Producto normal", stock: 5 }]);
        expect(csv.split("\n")[1]).toBe("Producto normal,5");
    });
});
