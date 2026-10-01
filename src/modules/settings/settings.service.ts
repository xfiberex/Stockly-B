import { prisma } from "@/shared/lib/prisma";
import { ZONA_HORARIA_POR_DEFECTO, zonaHorariaCanonica } from "@/shared/lib/zonaHoraria";

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
        // T5-11 — apagado por defecto, como la alerta: nadie debería empezar a recibir correo
        // por actualizar la aplicación. El envío lo lanza un comando programado desde fuera
        // (`docs/operaciones.md`); con esto apagado, el comando no manda nada.
        key: "weeklyDigestEnabled",
        label: "Resumen semanal por correo",
        description: "Envía a los administradores un resumen de la semana anterior: ventas, lo más vendido, stock bajo, ventas pendientes de enviar y compras fuera de plazo.",
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
    {
        // T5-09 — dónde empieza y termina cada día de los informes por periodo. Se valida
        // contra la base de zonas IANA: un nombre mal escrito rompería todos los informes.
        key: "timezone",
        label: "Zona horaria del negocio",
        description: "Zona horaria IANA en la que empiezan y terminan los días y los meses de los informes.",
        type: "string" as const,
        defaultValue: ZONA_HORARIA_POR_DEFECTO,
        zonaHoraria: true,
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

    /**
     * T5-09 — la zona del negocio, siempre válida. Si la guardada no lo es —solo puede pasar
     * editando la tabla a mano, porque el `PATCH` la valida—, se usa la de por defecto en vez
     * de dejar que PostgreSQL rechace cada informe.
     */
    async zonaHoraria(): Promise<string> {
        return zonaHorariaCanonica(String(await settingsService.get("timezone"))) ?? ZONA_HORARIA_POR_DEFECTO;
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
