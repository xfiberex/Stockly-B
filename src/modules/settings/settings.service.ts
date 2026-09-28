import { prisma } from "@/shared/lib/prisma";

// Catálogo de todos los ajustes disponibles, con sus valores por defecto y metadatos
export const SETTINGS_CATALOG = [
    {
        key: "lowStockAlertEnabled",
        label: "Alertas de bajo stock por correo",
        description: "Envía un correo a todos los administradores cuando el stock de un producto cae por debajo del mínimo.",
        type: "boolean" as const,
        defaultValue: "false",
    },
    {
        // T5-05 — el plazo que usa la sugerencia de reposición cuando el proveedor no tiene
        // uno. Con límites propios: el validador genérico de `number` aceptaría −3 o 2.5.
        key: "defaultLeadTimeDays",
        label: "Plazo de entrega por defecto",
        description: "Días que se suponen para un proveedor sin plazo de entrega al calcular las sugerencias de reposición.",
        type: "number" as const,
        defaultValue: "7",
        entero: true,
        min: 0,
        max: 365,
    },
] as const;

export type SettingKey = (typeof SETTINGS_CATALOG)[number]["key"];

export const settingsService = {
    async getAll() {
        const stored = await prisma.appSetting.findMany();
        const storedMap = new Map(stored.map((s) => [s.key, s.value]));

        return SETTINGS_CATALOG.map((def) => ({
            key: def.key,
            label: def.label,
            description: def.description,
            type: def.type,
            value: parseValue(def.type, storedMap.get(def.key) ?? def.defaultValue),
        }));
    },

    async get(key: SettingKey): Promise<boolean | string | number> {
        const def = SETTINGS_CATALOG.find((d) => d.key === key);
        if (!def) return false;
        const stored = await prisma.appSetting.findUnique({ where: { key } });
        return parseValue(def.type, stored?.value ?? def.defaultValue);
    },

    async set(key: SettingKey, value: boolean | string | number) {
        const def = SETTINGS_CATALOG.find((d) => d.key === key);
        if (!def) return null;

        const stored = String(value);
        await prisma.appSetting.upsert({
            where: { key },
            update: { value: stored },
            create: { key, value: stored },
        });

        return { key, value: parseValue(def.type, stored) };
    },

    async updateMany(updates: Record<string, boolean | string | number>) {
        const results = await Promise.all(
            Object.entries(updates).map(([key, value]) =>
                settingsService.set(key as SettingKey, value),
            ),
        );
        return results.filter(Boolean);
    },
};

function parseValue(type: "boolean" | "string" | "number", raw: string): boolean | string | number {
    if (type === "boolean") return raw === "true";
    if (type === "number") return Number(raw);
    return raw;
}
