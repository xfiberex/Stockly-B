import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";
import { ZONA_HORARIA_POR_DEFECTO, zonaHorariaCanonica } from "@/shared/lib/zonaHoraria";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import {
    LARGO_MAXIMO_SIMBOLO_DE_MONEDA,
    SIMBOLO_DE_MONEDA_POR_DEFECTO,
    motivoSimboloDeMonedaInvalido,
    type Negocio,
} from "@/contratos/api";

// Catálogo de todos los ajustes disponibles, con sus valores por defecto y metadatos
export const SETTINGS_CATALOG = [
    // T6-03 — quién vende. Todos nacen vacíos: sin rellenar, la aplicación funciona como antes
    // y el comprobante de venta (T6-07) sale sin esas líneas.
    {
        key: "businessName",
        label: "Nombre o razón social",
        description: "El nombre con el que el negocio firma sus comprobantes de venta.",
        type: "string" as const,
        defaultValue: "",
        group: "business" as const,
        maxLength: 120,
    },
    {
        key: "businessTaxId",
        label: "Documento fiscal",
        description: "RNC, NIF, RFC o el número con el que el negocio se identifica ante la autoridad tributaria.",
        type: "string" as const,
        defaultValue: "",
        group: "business" as const,
        maxLength: 40,
    },
    {
        key: "businessAddress",
        label: "Dirección",
        description: "La dirección que aparece en los comprobantes.",
        type: "string" as const,
        defaultValue: "",
        group: "business" as const,
        maxLength: 200,
    },
    {
        key: "businessPhone",
        label: "Teléfono",
        description: "El teléfono de contacto del negocio.",
        type: "string" as const,
        defaultValue: "",
        group: "business" as const,
        maxLength: 40,
    },
    {
        key: "businessEmail",
        label: "Correo electrónico",
        description: "El correo de contacto del negocio. No es el de ninguna cuenta de usuario.",
        type: "string" as const,
        defaultValue: "",
        group: "business" as const,
        maxLength: 254,
        correo: true,
    },
    {
        // T6-03 — un símbolo libre y no un código ISO: el porqué, y qué caracteres valen, en
        // `motivoSimboloDeMonedaInvalido` del contrato.
        key: "currencySymbol",
        label: "Símbolo de la moneda",
        description: "Va delante de cada importe, en pantalla, en los PDF y en los correos. Por ejemplo: $, RD$, S/, €.",
        type: "string" as const,
        defaultValue: SIMBOLO_DE_MONEDA_POR_DEFECTO,
        group: "business" as const,
        maxLength: LARGO_MAXIMO_SIMBOLO_DE_MONEDA,
        simboloDeMoneda: true,
    },
    {
        key: "lowStockAlertEnabled",
        label: "Alertas de bajo stock por correo",
        description: "Envía un correo a todos los administradores cuando el stock de un producto cae por debajo del mínimo.",
        type: "boolean" as const,
        defaultValue: "false",
        group: "general" as const,
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
        group: "general" as const,
    },
    {
        // T5-05 — el plazo que usa la sugerencia de reposición cuando el proveedor no tiene
        // uno. Con límites propios: el validador genérico de `number` aceptaría −3 o 2.5.
        key: "defaultLeadTimeDays",
        label: "Plazo de entrega por defecto",
        description: "Días que se suponen para un proveedor sin plazo de entrega al calcular las sugerencias de reposición.",
        type: "number" as const,
        defaultValue: "7",
        group: "general" as const,
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
        group: "general" as const,
        zonaHoraria: true,
    },
] as const;

export type SettingKey = (typeof SETTINGS_CATALOG)[number]["key"];

/**
 * T6-03 — el logo vive en `app_settings`, pero **fuera del catálogo**, y es a propósito: lo que
 * no está en el catálogo no lo acepta el `PATCH` ni lo enseña `GET /settings`. La URL solo la
 * escribe `guardarLogo`, con lo que devuelve Cloudinary. Si fuese un ajuste más, un `PATCH`
 * podría apuntarla a cualquier sitio, y el comprobante de venta (T6-07) va a pedirla desde el
 * servidor.
 */
const CLAVE_LOGO_URL = "businessLogoUrl";
const CLAVE_LOGO_ID = "businessLogoPublicId";

/** Dónde lee `negocio()` cada campo de la respuesta. */
const AJUSTE_DE_CAMPO = {
    name: "businessName",
    taxId: "businessTaxId",
    address: "businessAddress",
    phone: "businessPhone",
    email: "businessEmail",
} as const satisfies Partial<Record<keyof Negocio, SettingKey>>;

/** `null` si `simbolo` no pasa la regla del contrato: solo puede ocurrir editando la tabla a mano. */
const simboloValido = (simbolo: string) => (motivoSimboloDeMonedaInvalido(simbolo) === null ? simbolo : null);

export const settingsService = {
    async getAll() {
        const stored = await prisma.appSetting.findMany();
        const storedMap = new Map(stored.map((s) => [s.key, s.value]));

        return SETTINGS_CATALOG.map((def) => ({
            key: def.key,
            label: def.label,
            description: def.description,
            group: def.group,
            type: def.type,
            value: parseValue(def.type, storedMap.get(def.key) ?? def.defaultValue),
            ...("maxLength" in def ? { maxLength: def.maxLength } : {}),
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

    /**
     * T6-03 — el símbolo de la moneda, siempre imprimible, por lo mismo que `zonaHoraria()`: lo
     * que sale de aquí acaba en un PDF y en el HTML de un correo.
     */
    async moneda(): Promise<string> {
        return simboloValido(String(await settingsService.get("currencySymbol"))) ?? SIMBOLO_DE_MONEDA_POR_DEFECTO;
    },

    /** T6-03 — quién vende y en qué moneda, en una sola consulta. Lo lee cualquier rol. */
    async negocio(): Promise<Negocio> {
        const campos = Object.entries(AJUSTE_DE_CAMPO) as Array<[keyof typeof AJUSTE_DE_CAMPO, SettingKey]>;
        const guardados = await prisma.appSetting.findMany({
            where: { key: { in: [...campos.map(([, clave]) => clave), "currencySymbol", CLAVE_LOGO_URL] } },
        });
        const valorDe = new Map(guardados.map((s) => [s.key, s.value]));

        return {
            ...(Object.fromEntries(campos.map(([campo, clave]) => [campo, valorDe.get(clave) ?? ""])) as Record<
                keyof typeof AJUSTE_DE_CAMPO,
                string
            >),
            currencySymbol: simboloValido(valorDe.get("currencySymbol") ?? "") ?? SIMBOLO_DE_MONEDA_POR_DEFECTO,
            logoUrl: valorDe.get(CLAVE_LOGO_URL) ?? null,
        };
    },

    /**
     * T6-03 — sustituye el logo del negocio.
     *
     * **Se guarda como PNG y con un tope de 600 px**, llegue lo que llegue: `upload.middleware`
     * admite WebP y PDFKit solo incrusta JPEG y PNG, así que convertirlo al subirlo le ahorra al
     * comprobante pedírselo a Cloudinary transformado en cada descarga.
     *
     * Primero sube el nuevo, después cambia las dos filas y **al final** borra el anterior: si
     * algo falla por el camino, el negocio se queda con el logo que tenía y no sin ninguno. El
     * borrado no rompe la petición; lo peor que deja es un archivo huérfano en Cloudinary.
     */
    async guardarLogo(imagen: Buffer): Promise<Negocio> {
        const anterior = await prisma.appSetting.findUnique({ where: { key: CLAVE_LOGO_ID } });
        const subido = await uploadToCloudinary(imagen, "stockly/business", {
            format: "png",
            transformation: { width: 600, height: 600, crop: "limit" },
        });

        await prisma.$transaction([
            prisma.appSetting.upsert({ where: { key: CLAVE_LOGO_URL }, update: { value: subido.url }, create: { key: CLAVE_LOGO_URL, value: subido.url } }),
            prisma.appSetting.upsert({ where: { key: CLAVE_LOGO_ID }, update: { value: subido.publicId }, create: { key: CLAVE_LOGO_ID, value: subido.publicId } }),
        ]);

        if (anterior) await borrarDeCloudinary(anterior.value);
        return settingsService.negocio();
    },

    /** T6-03 — quita el logo. Sin logo no hace nada: borrar dos veces no es un error. */
    async quitarLogo(): Promise<Negocio> {
        const anterior = await prisma.appSetting.findUnique({ where: { key: CLAVE_LOGO_ID } });
        await prisma.appSetting.deleteMany({ where: { key: { in: [CLAVE_LOGO_URL, CLAVE_LOGO_ID] } } });

        if (anterior) await borrarDeCloudinary(anterior.value);
        return settingsService.negocio();
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

/** Borra de Cloudinary un logo que la base ya no referencia, sin que un fallo llegue al usuario. */
async function borrarDeCloudinary(publicId: string): Promise<void> {
    try {
        await deleteFromCloudinary(publicId);
    } catch (err) {
        logger.warn({ err, publicId }, "No se pudo borrar de Cloudinary el logo anterior");
    }
}

function parseValue(type: "boolean" | "string" | "number", raw: string): boolean | string | number {
    if (type === "boolean") return raw === "true";
    if (type === "number") return Number(raw);
    return raw;
}
