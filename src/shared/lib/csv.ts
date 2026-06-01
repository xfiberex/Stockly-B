function escapeCsvCell(value: unknown): string {
    const str = value === null || value === undefined ? "" : String(value);
    if (str.includes('"') || str.includes(",") || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function buildCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]!);
    const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(",")),
    ];
    return lines.join("\n");
}
