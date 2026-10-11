import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import { dispararAlertaStock } from "@/shared/lib/stockAlerts";
import { mismoCoste } from "@/shared/lib/costeMedio";
import { conDisponible } from "@/shared/lib/stockComprometido";
import { altaConStock, bloquearProductos, entrar, fijar, sacar, type Movido } from "@/shared/lib/stock";
import { almacenDelFiltro, almacenParaOperar } from "@/shared/lib/almacenes";
import { aDia, diasHasta, hoyDelNegocio, loteDeEntrada, loteDelProducto } from "@/shared/lib/lotes";
import { parsePagination } from "@/shared/lib/pagination";
import { TAM_LOTE_EXPORTACION } from "@/shared/lib/exportacion";
import { filtroDeEnum } from "@/shared/lib/enums";
import { abcService } from "@/modules/reports/reports.abc";
import { $Enums, Prisma } from "@/generated/prisma/client";
import { variantesDeBusqueda } from "@/modules/products/codigoDeBarras";
import { cabeEnEtiqueta, type Etiqueta, type FormatoEtiqueta } from "@/modules/products/product.etiquetas";
import type {
    CreateProductDto,
    UpdateProductDto,
    ProductQuery,
    MovementsQuery,
    CostHistoryQuery,
    LabelsQuery,
    ImportProductDto,
    CreateManualMovementDto,
    BulkStockDto,
} from "@/modules/products/product.types";

/**
 * T4-15 — el `where` del histórico de un producto, compartido por el listado y su recuento.
 *
 * **`dateTo` incluye el día entero.** Quien escribe «hasta el 12 de agosto» quiere los
 * movimientos del 12, y `lte: 2026-08-12T00:00:00` no devuelve ni uno: los excluye todos
 * salvo los de medianoche exacta. Se toma el instante siguiente al final del día y se
 * compara con `lt`, que además evita el milisegundo de `23:59:59.999`.
 *
 * Una fecha ilegible **se rechaza, no se ignora**: mismo criterio que `filtroDeEnum`. Un
 * filtro que no se aplica devuelve de más y nadie se entera.
 */
async function whereDeMovimientos(productId: string, query: MovementsQuery) {
    const type = filtroDeEnum($Enums.StockMovementType, query.type, "type");
    // T5-14 — los de un almacén.
    const warehouseId = await almacenDelFiltro(query.warehouseId);
    const desde = fechaDeFiltro(query.dateFrom, "dateFrom");
    const hasta = fechaDeFiltro(query.dateTo, "dateTo");

    if (hasta) hasta.setUTCDate(hasta.getUTCDate() + 1);

    return {
        productId,
        ...(type && { type }),
        ...(warehouseId && { warehouseId }),
        ...((desde || hasta) && {
            createdAt: { ...(desde && { gte: desde }), ...(hasta && { lt: hasta }) },
        }),
    };
}

/** `YYYY-MM-DD` (lo que manda un `input[type=date]`) o un 400 que dice cuál falla. */
function fechaDeFiltro(valor: string | undefined, campo: string): Date | undefined {
    if (!valor) return undefined;

    const fecha = new Date(`${valor}T00:00:00.000Z`);
    if (Number.isNaN(fecha.getTime())) {
        throw new HttpError(
            400,
            `El filtro «${campo}» no es una fecha válida: «${valor}». Formato esperado: AAAA-MM-DD.`,
            "INVALID_FILTER_VALUE",
            { campo, valor, validos: "AAAA-MM-DD" },
        );
    }
    return fecha;
}

/**
 * T5-08 — un SKU o un código de barras repetido, dicho como 409 y no como 500.
 *
 * Se traduce el error de la base en lugar de comprobar antes con `findFirst`, como hacen
 * categorías y marcas: entre esa comprobación y la escritura cabe otra petición con el mismo
 * valor, y esa segunda acababa en un 500. El índice único es el que decide, así que es su error
 * el que se traduce. **El SKU daba 500 hasta ahora en cualquier caso**: nadie lo traducía.
 */
function traducirUnicidad(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const campos = JSON.stringify(error.meta ?? {});
        if (campos.includes("barcode")) {
            throw new HttpError(409, "Ese código de barras ya es de otro producto", "BARCODE_EXISTS");
        }
        if (campos.includes("sku")) throw new HttpError(409, "Ese SKU ya es de otro producto", "SKU_EXISTS");
    }
    throw error;
}

/** Máximos de una petición de etiquetas: 200 productos y 2 000 etiquetas, unas 84 hojas A4. */
const MAX_PRODUCTOS_EN_ETIQUETAS = 200;
const MAX_ETIQUETAS = 2000;
const FORMATOS_DE_ETIQUETA = { sheet: "sheet", label: "label" } as const satisfies Record<FormatoEtiqueta, FormatoEtiqueta>;

function filtroInvalido(campo: string, valor: string, validos: string): HttpError {
    return new HttpError(
        400,
        `El filtro «${campo}» no admite el valor «${valor}». Valores válidos: ${validos}.`,
        "INVALID_FILTER_VALUE",
        { campo, valor, validos },
    );
}

const PRODUCT_INCLUDE = {
    category: { select: { id: true, name: true } },
    brand: { select: { id: true, name: true } },
    supplier: { select: { id: true, name: true } },
    tags: { select: { id: true, name: true, color: true } },
} as const;

// T2-05 — columnas y forma de fila de la exportación del catálogo. Salen del servicio
// para que el generador por lotes y su mapeo no se dupliquen.
const PRODUCT_EXPORT_SELECT = {
    id: true,
    name: true,
    description: true,
    sku: true,
    price: true,
    stock: true,
    minStock: true,
    isActive: true,
    category: { select: { name: true } },
    brand: { select: { name: true } },
    supplier: { select: { name: true } },
    tags: { select: { name: true } },
} as const;

type ProductoExportado = {
    name: string;
    description: string | null;
    sku: string | null;
    price: unknown;
    stock: number;
    minStock: number;
    isActive: boolean;
    category: { name: string } | null;
    brand: { name: string } | null;
    supplier: { name: string } | null;
    tags: Array<{ name: string }>;
};

/** `id` se pide para el cursor, pero no sale en el archivo: las columnas no cambian. */
/**
 * El orden de estas claves **es** el orden de las columnas del CSV: `buildCsv` y el
 * escritor por lotes sacan la cabecera de `Object.keys` de la primera fila.
 *
 * T3-05: el frontend repite la misma lista en `EXPORT_HEADERS`, porque construye su
 * propio CSV en el navegador y los dos repositorios no comparten paquete. Reordenar o
 * añadir aquí obliga a tocar allí; el test de cabecera de cada lado lo delata.
 */
function filaDeExportacion(p: ProductoExportado) {
    return {
        name: p.name,
        description: p.description,
        sku: p.sku,
        price: p.price,
        stock: p.stock,
        minStock: p.minStock,
        isActive: p.isActive,
        categoryName: p.category?.name ?? null,
        brandName: p.brand?.name ?? null,
        supplierName: p.supplier?.name ?? null,
        tags: p.tags.map((t) => t.name).join(";"),
    };
}

/**
 * T5-10 — el filtro por clase ABC, en el `where`. A y B son los que tienen esa fila; C son los
 * clasificados como C **y los que no tienen fila**, que son los que no vendieron nada en el
 * periodo: sin eso, un producto sin ventas no saldría con ningún filtro.
 */
function whereDeClaseAbc(valor: string | undefined) {
    const clase = filtroDeEnum($Enums.AbcClass, valor, "abcClass");
    if (!clase) return {};
    if (clase === "C") return { OR: [{ abc: { is: null } }, { abc: { is: { abcClass: clase } } }] };
    return { abc: { is: { abcClass: clase } } };
}

/** La clase de cada producto leído con `abc`, y sin la relación: la respuesta lleva solo la letra. */
function conClaseAbc<T extends { abc: { abcClass: $Enums.AbcClass } | null }>(productos: T[]) {
    return productos.map(({ abc, ...producto }) => ({ ...producto, abcClass: abc?.abcClass ?? $Enums.AbcClass.C }));
}

const CON_CLASE_ABC = { ...PRODUCT_INCLUDE, abc: { select: { abcClass: true } } } as const;

/** El error de una salida que no cabe en lo que hay: el mismo para la manual y para la edición. */
function stockNoPuedeQuedarNegativo(): HttpError {
    return new HttpError(400, "El stock no puede quedar negativo", "STOCK_CANNOT_BE_NEGATIVE");
}

export const productService = {
    async getProducts(query: ProductQuery) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 10 });

        const warehouseId = await almacenDelFiltro(query.warehouseId);

        const isActiveFilter =
            query.isActive === "false" ? false
            : query.isActive === "true" ? true
            : undefined;

        const where = {
            ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
            ...(query.search && { name: { contains: query.search, mode: "insensitive" as const } }),
            ...(query.categoryId && { categoryId: query.categoryId }),
            ...(query.brandId && { brandId: query.brandId }),
            ...(query.supplierId && { supplierId: query.supplierId }),
            ...(query.tagId && { tags: { some: { id: query.tagId } } }),
            ...whereDeClaseAbc(query.abcClass),
            // T5-14 — lo que **hay** en un almacén: los productos con existencias en él. En el
            // `where`, como todo filtro (T4-15).
            ...(warehouseId && { stockLevels: { some: { warehouseId, stock: { gt: 0 } } } }),
        };

        // T5-10 — la clase sale de una caché que se rehace sola; si toca, en segundo plano.
        await abcService.refrescar();

        const [products, total] = await prisma.$transaction([
            prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, include: CON_CLASE_ABC }),
            prisma.product.count({ where }),
        ]);

        return {
            // T5-03 — con comprometido y disponible: es la lista de la que elige el formulario
            // de venta. Una sola consulta agrupada para la página entera, no una por producto.
            data: await conDisponible(conClaseAbc(products)),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    async getById(id: string) {
        await abcService.refrescar();
        const product = await prisma.product.findUnique({ where: { id }, include: CON_CLASE_ABC });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");
        const [conCifras] = await conDisponible(conClaseAbc([product]));
        return conCifras!;
    },

    /**
     * T5-08 — el producto de un código escaneado o tecleado. **Búsqueda exacta**: primero por
     * código de barras —con sus variantes UPC-A/EAN-13— y después por SKU, los dos por su índice
     * único. No pasa por el buscador de texto del catálogo ni por su `ILIKE`.
     *
     * Si el mismo texto es el código de barras de un producto y el SKU de otro, gana el código de
     * barras: es lo que lleva impreso el artículo. Devuelve también los inactivos, que la ficha
     * enseña como tales, y la misma forma que `getById`.
     */
    async getByCode(codigo: string | undefined) {
        const c = codigo?.trim() ?? "";
        if (!c) throw filtroInvalido("code", c, "un código de barras o un SKU");

        const encontrado =
            (await prisma.product.findFirst({ where: { barcode: { in: variantesDeBusqueda(c) } }, select: { id: true } })) ??
            (await prisma.product.findUnique({ where: { sku: c }, select: { id: true } }));
        if (!encontrado) {
            throw new HttpError(404, `Ningún producto tiene el código «${c}»`, "PRODUCT_NOT_FOUND", { codigo: c });
        }
        return this.getById(encontrado.id);
    },

    /**
     * T5-08 — lo que va en cada etiqueta, repetido `copies` veces y en el orden de `ids`. El
     * código es el de barras si lo hay y, si no, el SKU. Un producto sin ninguno de los dos no
     * tiene nada que imprimir y **se rechaza la petición entera**: una hoja con huecos donde
     * faltaba un código se descubre al pegarla.
     */
    async prepararEtiquetas(query: LabelsQuery): Promise<{ etiquetas: Etiqueta[]; formato: FormatoEtiqueta }> {
        const ids = [...new Set((query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
        if (ids.length === 0 || ids.length > MAX_PRODUCTOS_EN_ETIQUETAS) {
            throw filtroInvalido("ids", query.ids ?? "", `entre 1 y ${MAX_PRODUCTOS_EN_ETIQUETAS} identificadores separados por comas`);
        }

        const formato = filtroDeEnum(FORMATOS_DE_ETIQUETA, query.format, "format") ?? "sheet";

        const copias = query.copies === undefined || query.copies === "" ? 1 : Number(query.copies);
        if (!Number.isInteger(copias) || copias < 1 || ids.length * copias > MAX_ETIQUETAS) {
            throw filtroInvalido("copies", query.copies ?? "", `un entero desde 1, hasta ${MAX_ETIQUETAS} etiquetas en total`);
        }

        const productos = await prisma.product.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, sku: true, barcode: true, price: true },
        });
        if (productos.length !== ids.length) {
            throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");
        }
        const sinCodigo = productos.filter((p) => !p.barcode && !p.sku).length;
        if (sinCodigo > 0) {
            throw new HttpError(
                400,
                `${sinCodigo} de los productos no tienen código de barras ni SKU que imprimir`,
                "PRODUCTS_WITHOUT_CODE",
                { productos: sinCodigo },
            );
        }

        // Antes de empezar el PDF: a mitad del archivo ya no se puede responder con un error.
        const largo = productos.find((p) => !cabeEnEtiqueta((p.barcode ?? p.sku)!, formato));
        if (largo) {
            throw new HttpError(
                400,
                `El código de «${largo.name}» es demasiado largo para ese formato de etiqueta`,
                "CODE_TOO_LONG_FOR_LABEL",
                { producto: largo.name },
            );
        }

        const porId = new Map(productos.map((p) => [p.id, p]));
        const etiquetas = ids.flatMap((id) => {
            const p = porId.get(id)!;
            const etiqueta = { nombre: p.name, codigo: (p.barcode ?? p.sku)!, precio: Number(p.price) };
            return Array.from({ length: copias }, () => etiqueta);
        });
        return { etiquetas, formato };
    },

    async create(dto: CreateProductDto, file?: Express.Multer.File) {
        let imageUrl: string | undefined;
        let imagePublicId: string | undefined;

        if (file) {
            const uploaded = await uploadToCloudinary(file.buffer, "stockly/products");
            imageUrl = uploaded.url;
            imagePublicId = uploaded.publicId;
        }

        const stock = dto.stock !== undefined ? parseInt(String(dto.stock), 10) : 0;
        const minStock = dto.minStock !== undefined ? parseInt(String(dto.minStock), 10) : 0;

        // T5-14 — el stock inicial entra en un almacén: el de la petición o el predeterminado.
        const almacen = stock > 0 ? await almacenParaOperar(dto.warehouseId) : null;
        const hoy = await hoyDelNegocio();

        // El producto nace con su stock, y en la misma transacción se le pone el nivel y el
        // movimiento que lo explican: sin los dos, la base no confirma el alta.
        return prisma.$transaction(async (tx) => {
            const product = await tx.product.create({
                data: {
                    name: dto.name,
                    description: dto.description,
                    sku: dto.sku || null,
                    barcode: dto.barcode ?? null,
                    price: dto.price !== undefined ? parseFloat(String(dto.price)) : 0,
                    costPrice: dto.costPrice ?? null,
                    stock,
                    minStock,
                    tracksLots: dto.tracksLots ?? false,
                    categoryId: dto.categoryId ?? null,
                    brandId: dto.brandId ?? null,
                    supplierId: dto.supplierId ?? null,
                    imageUrl,
                    imagePublicId,
                    ...(dto.tagIds?.length && { tags: { connect: dto.tagIds.map((id) => ({ id })) } }),
                },
                include: PRODUCT_INCLUDE,
            });

            if (almacen) {
                // T5-15 — el stock inicial de un producto con lotes es una entrada como otra
                // cualquiera: nace en un lote, y sin fecha de caducidad no nace.
                const lotId = await loteDeEntrada(tx, product, { expiresAt: dto.lotExpiresAt, lotCode: dto.lotCode }, hoy);
                await altaConStock(tx, { warehouseId: almacen.id, type: "IN", note: "Stock inicial", productos: [{ id: product.id, stock, lotId }] });
            }
            return product;
        }).catch(traducirUnicidad);
    },

    async update(id: string, dto: UpdateProductDto, file?: Express.Multer.File) {
        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        let imageUrl: string | null | undefined = existing.imageUrl;
        let imagePublicId: string | null | undefined = existing.imagePublicId;

        if (file) {
            if (existing.imagePublicId) await deleteFromCloudinary(existing.imagePublicId);
            const uploaded = await uploadToCloudinary(file.buffer, "stockly/products");
            imageUrl = uploaded.url;
            imagePublicId = uploaded.publicId;
        } else if (String(dto.removeImage) === "true") {
            if (existing.imagePublicId) await deleteFromCloudinary(existing.imagePublicId);
            imageUrl = null;
            imagePublicId = null;
        }

        const newPrice = dto.price !== undefined ? parseFloat(String(dto.price)) : undefined;
        const existingPrice = parseFloat(String(existing.price));
        const priceChanged = newPrice !== undefined && newPrice !== existingPrice;

        // T5-01 — el coste a mano deja rastro igual que el precio. Se compara a los decimales
        // de la columna: reenviar el formulario sin tocar el campo no es un cambio de coste.
        const costChanged = dto.costPrice !== undefined && !mismoCoste(existing.costPrice, dto.costPrice);

        const tagsUpdate = dto.tagIds !== undefined
            ? { tags: { set: dto.tagIds.map((tid) => ({ id: tid })) } }
            : {};

        // T5-14 — `stock` en esta ruta es **el total**, como lo es en la respuesta: lo que cambia
        // es la diferencia con el total que hay, y esa diferencia entra en —o sale de— un
        // almacén, el de la petición o el predeterminado. Así, reenviar el formulario sin tocar
        // el campo no mueve nada aunque el producto esté repartido en varios locales; si `stock`
        // fijara el nivel de un almacén, ese mismo reenvío sumaría al total lo de los demás.
        const hasStockChange = dto.stock !== undefined;
        const newStock = hasStockChange ? parseInt(String(dto.stock), 10) : undefined;
        const almacen = hasStockChange && newStock !== existing.stock ? await almacenParaOperar(dto.warehouseId) : null;
        const hoy = await hoyDelNegocio();
        let movido: Movido | null = null;

        // Producto, historial de precio y movimiento de stock se escriben en una sola
        // transacción para que nunca queden inconsistentes entre sí.
        const updated = await prisma.$transaction(async (tx) => {
            const product = await tx.product.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.sku !== undefined && { sku: dto.sku || null }),
                    ...(dto.barcode !== undefined && { barcode: dto.barcode }),
                    ...(newPrice !== undefined && { price: newPrice }),
                    ...(costChanged && { costPrice: dto.costPrice }),
                    ...(dto.minStock !== undefined && { minStock: parseInt(String(dto.minStock), 10) }),
                    ...(dto.tracksLots !== undefined && { tracksLots: dto.tracksLots }),
                    ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
                    ...(dto.brandId !== undefined && { brandId: dto.brandId }),
                    ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
                    imageUrl,
                    imagePublicId,
                    ...tagsUpdate,
                },
                include: PRODUCT_INCLUDE,
            });

            if (priceChanged) {
                await tx.priceHistory.create({
                    data: { productId: id, oldPrice: existingPrice, newPrice: newPrice! },
                });
            }

            if (costChanged) {
                await tx.costHistory.create({
                    data: { productId: id, oldCost: existing.costPrice, newCost: dto.costPrice ?? null, source: "MANUAL" },
                });
            }

            // La diferencia se calcula contra el total de la fila que el `update` de arriba
            // acaba de devolver y deja bloqueada, no contra la lectura de antes de la transacción.
            const diferencia = almacen ? newStock! - product.stock : 0;
            if (almacen && diferencia !== 0) {
                const movimiento = { productId: id, warehouseId: almacen.id, cantidad: Math.abs(diferencia), note: "Ajuste manual" };
                // T5-15 — subir el total de un producto con lotes desde aquí sería una entrada sin
                // lote, y esta ruta no tiene dónde decirlo: `loteDeEntrada` lo rechaza. Se sube con
                // un movimiento de entrada. Bajarlo sí vale, y sale por orden de caducidad.
                movido = diferencia > 0
                    ? await entrar(tx, { ...movimiento, type: "IN", lotId: await loteDeEntrada(tx, product, {}, hoy) })
                    : await sacar(tx, { ...movimiento, type: "OUT" }, stockNoPuedeQuedarNegativo);
                product.stock = movido.stock;
            }

            return product;
        }).catch(traducirUnicidad);

        const resultado = movido as Movido | null;
        if (resultado && resultado.delta < 0) {
            dispararAlertaStock({ id: updated.id, name: updated.name, stock: resultado.stock, minStock: updated.minStock });
        }

        return updated;
    },

    async delete(id: string) {
        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        if (existing.imagePublicId) await deleteFromCloudinary(existing.imagePublicId);

        await prisma.product.update({
            where: { id },
            data: { isActive: false, imageUrl: null, imagePublicId: null },
        });
    },

    async restore(id: string) {
        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");
        if (existing.isActive) throw new HttpError(400, "El producto ya está activo", "PRODUCT_ALREADY_ACTIVE");

        return prisma.product.update({ where: { id }, data: { isActive: true }, include: PRODUCT_INCLUDE });
    },

    /** Filas que tendrá la exportación, para decidir el tope antes de escribir nada (T2-05). */
    async contarParaExportar() {
        return prisma.product.count();
    },

    /**
     * T2-05 — el catálogo en lotes, por cursor.
     *
     * Se pagina con cursor y no con `skip`: `OFFSET` obliga a Postgres a leer y
     * descartar todas las filas anteriores en cada página, así que la última página de
     * una exportación grande cuesta lo que la tabla entera.
     *
     * El desempate por `id` no estaba antes, y es lo que hace **correcta por
     * construcción** la paginación: `createdAt` no es único —una importación masiva crea
     * cientos de filas en el mismo instante—, y sin un orden total el resultado depende
     * de que Postgres devuelva el mismo orden arbitrario en cada página. En la práctica
     * lo hace mientras nadie escriba entre medias, y de hecho **los tests pasan también
     * sin el desempate**: no es un fallo reproducido, es dejar de depender de una
     * casualidad. Antes daba igual porque no había páginas.
     */
    async *exportarPorLotes() {
        let cursor: string | undefined;

        for (;;) {
            const pagina = await prisma.product.findMany({
                take: TAM_LOTE_EXPORTACION,
                ...(cursor && { cursor: { id: cursor }, skip: 1 }),
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: PRODUCT_EXPORT_SELECT,
            });

            if (pagina.length === 0) return;
            yield pagina.map(filaDeExportacion);
            if (pagina.length < TAM_LOTE_EXPORTACION) return;
            cursor = pagina[pagina.length - 1]!.id;
        }
    },

    async importBulk(products: ImportProductDto[]) {
        // T2-08 — un lote es **dos sentencias**, no dos por producto.
        //
        // Antes, cada elemento hacía su `create` y su movimiento por separado y el lote
        // los lanzaba a la vez: 50 elementos eran hasta 100 consultas simultáneas contra
        // un pool de 10 conexiones, cada una esperando hasta `connectionTimeoutMillis`
        // (5 s) a que se liberara una. Con la base al lado eso no se nota; con latencia o
        // con la base ocupada, es una importación que falla a medias por tiempo de espera
        // y no por los datos.
        //
        // El tamaño ya no gobierna la concurrencia —cada lote son dos sentencias—, así
        // que sirve para acotar otra cosa: cuánto trabajo se repite si un lote falla y
        // hay que reintentarlo fila a fila para saber **qué** fila fue. 200 filas × 7
        // columnas son 1400 parámetros, lejos del tope de Postgres.
        const TAM_LOTE = 200;
        const errors: Array<{ row: number; error: string }> = [];
        let created = 0;

        const [categories, brands, almacen] = await Promise.all([
            prisma.category.findMany({ select: { id: true, name: true } }),
            prisma.brand.findMany({ select: { id: true, name: true } }),
            // T5-14 — el archivo no dice almacén: todo lo importado entra en el predeterminado.
            almacenParaOperar(undefined),
        ]);
        const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
        const brandMap = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));

        /** Los datos de una fila del archivo, ya resueltos contra el catálogo. */
        const filaDeProducto = (dto: ImportProductDto) => ({
            name: dto.name,
            description: dto.description,
            price: parseFloat(String(dto.price)),
            stock: dto.stock !== undefined ? parseInt(String(dto.stock), 10) : 0,
            categoryId: dto.categoryName ? (categoryMap.get(dto.categoryName.toLowerCase()) ?? null) : null,
            brandId: dto.brandName ? (brandMap.get(dto.brandName.toLowerCase()) ?? null) : null,
            isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
        });

        for (let i = 0; i < products.length; i += TAM_LOTE) {
            const lote = products.slice(i, i + TAM_LOTE);

            try {
                // Los productos, sus niveles y sus movimientos: tres sentencias para el lote, en
                // una transacción. El `stock` sale de la fila devuelta y no del índice, así que
                // no depende del orden en que Postgres devuelva lo insertado.
                const creados = await prisma.$transaction(async (tx) => {
                    const filas = await tx.product.createManyAndReturn({
                        data: lote.map(filaDeProducto),
                        select: { id: true, stock: true },
                    });
                    await altaConStock(tx, { warehouseId: almacen.id, type: "IMPORT", note: "Importación masiva", productos: filas });
                    return filas;
                });

                created += creados.length;
            } catch {
                // El lote va en **una** transacción: o entra entero o no entra nada, así
                // que reintentar fila a fila no puede duplicar lo ya insertado.
                // Se hace solo para poder decir *qué* fila falló, que es lo que el
                // usuario necesita para corregir su archivo; el camino rápido se queda
                // para el caso normal, que es que el archivo esté bien.
                const resultados = await Promise.allSettled(
                    lote.map(async (dto) => {
                        const fila = filaDeProducto(dto);
                        return prisma.$transaction(async (tx) => {
                            const product = await tx.product.create({ data: fila });
                            await altaConStock(tx, { warehouseId: almacen.id, type: "IMPORT", note: "Importación masiva", productos: [product] });
                            return product;
                        });
                    }),
                );

                resultados.forEach((resultado, indiceEnLote) => {
                    if (resultado.status === "fulfilled") {
                        created++;
                    } else {
                        errors.push({
                            row: i + indiceEnLote + 1,
                            error: resultado.reason?.message ?? "Error desconocido",
                        });
                    }
                });
            }
        }

        return { created, errors };
    },

    /**
     * T4-15 — el histórico de un producto, paginado y filtrado **en la base**.
     *
     * Antes era un `findMany` sin `take`. Con la media del proyecto —once movimientos por
     * producto— no se notaba; con el producto caliente de la prueba de carga (100 000)
     * **diez usuarios concurrentes hundían la API entera**, y no por la consulta: la base
     * tarda 15 ms. Lo caro es hidratar 100 000 objetos y serializar ~19 MB de JSON **en el
     * bucle de eventos**, que es de un solo hilo — por eso se llevaba por delante a las
     * peticiones de los demás, que no tenían nada que ver con este producto.
     *
     * **Los filtros bajan aquí con la paginación, y no es opcional.** Filtrar en el
     * navegador sobre una página filtra solo lo que se ha traído: el resultado dependería
     * de en qué página estás, en silencio y pareciendo correcto.
     *
     * Orden **descendente**: la primera página es lo último que pasó, que es lo que se
     * quiere ver al abrir un histórico. El desempate por `id` lo hace correcto por
     * construcción — `createdAt` no es único: una importación crea cientos de filas en el
     * mismo instante, y sin orden total una fila puede salir en dos páginas o en ninguna.
     */
    async getMovements(productId: string, query: MovementsQuery = {}) {
        const product = await prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });
        const where = await whereDeMovimientos(productId, query);

        const [movements, total] = await prisma.$transaction([
            prisma.stockMovement.findMany({
                where,
                skip,
                take: limit,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                // T5-15 — de qué lote eran las unidades.
                include: { lot: { select: { id: true, code: true, expiresAt: true } } },
            }),
            prisma.stockMovement.count({ where }),
        ]);

        return {
            product,
            // La caducidad sale como día, no como el instante en que Prisma lee una columna `date`.
            movements: movements.map((m) => ({ ...m, lot: m.lot && { ...m.lot, expiresAt: aDia(m.lot.expiresAt) } })),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    /**
     * Filas que tendrá la exportación, para decidir el tope antes de escribir nada.
     *
     * **La ficha de T4-15 daba esta exportación por resuelta —«escribe por lotes desde
     * T2-05»— y no lo estaba.** Lo que T2-05 convirtió en lotes fue la exportación del
     * catálogo; esta cargaba los 100 000 movimientos de golpe y `buildCsv` concatenaba el
     * archivo entero en una sola cadena. Paginar el listado y dejar aquí el mismo defecto
     * habría movido el problema al botón de al lado.
     */
    async contarMovimientosParaExportar(productId: string, query: MovementsQuery = {}) {
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");
        return prisma.stockMovement.count({ where: await whereDeMovimientos(productId, query) });
    },

    /**
     * El histórico en lotes, **por cursor y no por `skip`**: `OFFSET` obliga a Postgres a
     * leer y descartar todas las filas anteriores en cada página, así que el último lote de
     * una exportación grande cuesta lo que el histórico entero. Mismo patrón que
     * `exportarPorLotes` del catálogo.
     */
    async *exportarMovimientosPorLotes(productId: string, query: MovementsQuery = {}) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: { name: true, sku: true },
        });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        const where = await whereDeMovimientos(productId, query);
        let cursor: string | undefined;

        for (;;) {
            const pagina = await prisma.stockMovement.findMany({
                where,
                take: TAM_LOTE_EXPORTACION,
                ...(cursor && { cursor: { id: cursor }, skip: 1 }),
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                include: { warehouse: { select: { name: true } }, lot: { select: { code: true, expiresAt: true } } },
            });

            if (pagina.length === 0) return;
            yield pagina.map((m) => ({
                productName: product.name,
                sku: product.sku ?? "",
                type: m.type,
                delta: m.delta,
                stockAfter: m.stockAfter,
                note: m.note ?? "",
                createdAt: m.createdAt.toISOString(),
                // T5-14 — dónde ocurrió y lo que quedó allí. Al final, para no mover las
                // columnas que ya había.
                warehouseName: m.warehouse.name,
                warehouseStockAfter: m.warehouseStockAfter,
                // T5-15 — el lote y su caducidad, vacíos en lo que no tenía.
                lotCode: m.lot?.code ?? "",
                lotExpiresAt: m.lot ? aDia(m.lot.expiresAt) : "",
            }));
            if (pagina.length < TAM_LOTE_EXPORTACION) return;
            cursor = pagina[pagina.length - 1]!.id;
        }
    },

    async createManualMovement(productId: string, dto: CreateManualMovementDto) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");
        if (!product.isActive) throw new HttpError(400, "No se puede registrar movimientos en un producto inactivo", "INACTIVE_PRODUCT_MOVEMENT");

        const note = dto.note ? `${dto.reason} — ${dto.note}` : dto.reason;
        // T5-14 — en qué almacén: el de la petición o el predeterminado.
        const almacen = await almacenParaOperar(dto.warehouseId);
        const hoy = await hoyDelNegocio();
        const movimiento = { productId, warehouseId: almacen.id, cantidad: dto.quantity, type: dto.type, note };

        // El ajuste de stock y su movimiento son atómicos. Para `OUT`, un decremento condicional
        // sobre el nivel del almacén (ADR 0001); `ADJUSTMENT` deja **ese almacén** en la cifra,
        // no el total: se ajusta lo que se ha contado, y se cuenta un sitio.
        //
        // T5-15 — con lote, los tres hablan **de ese lote**: la entrada le suma, la salida saca
        // solo de él y el ajuste fija lo que queda de él —a cero, para dar de baja uno caducado—.
        // Sin lote, la salida y el ajuste a la baja siguen el orden de caducidad, vencido
        // incluido: una merma no elige. La entrada de un producto que lleva lotes sí lo exige.
        const movido = await prisma.$transaction(async (tx) => {
            if (dto.type === "IN") {
                // Con la fila bloqueada: es lo que impide que dos entradas creen dos veces el mismo lote.
                await bloquearProductos(tx, [productId]);
                const actual = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, name: true, tracksLots: true } });
                return entrar(tx, { ...movimiento, lotId: await loteDeEntrada(tx, actual, dto, hoy) });
            }

            const lotId = dto.lotId ? (await loteDelProducto(tx, productId, dto.lotId)).id : null;
            if (dto.type === "ADJUSTMENT") return fijar(tx, { ...movimiento, lotId });
            return sacar(tx, { ...movimiento, lotId }, stockNoPuedeQuedarNegativo);
        });

        // Solo alerta si el stock disminuyó. El mínimo se compara con el total.
        if (movido.delta < 0) {
            dispararAlertaStock({ id: productId, name: product.name, stock: movido.stock, minStock: product.minStock });
        }

        return prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    },

    /**
     * T5-15 — los lotes **con existencias** de un producto y dónde está cada uno, del que caduca
     * antes al que caduca después: el orden en que salen. Los agotados no vienen —su rastro son
     * sus movimientos—, así que la lista no crece con cada lote que ha pasado por el almacén.
     */
    async getLots(productId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        const [hoy, niveles] = await Promise.all([
            hoyDelNegocio(),
            prisma.stockLevel.findMany({
                where: { productId, stock: { not: 0 } },
                select: { warehouseId: true, stock: true, lot: { select: { id: true, code: true, expiresAt: true } } },
                orderBy: [{ lot: { expiresAt: "asc" } }, { lot: { code: "asc" } }, { warehouseId: "asc" }],
            }),
        ]);

        const lotes = new Map<string, { id: string; code: string; expiresAt: string; daysLeft: number; expired: boolean; stock: number; levels: Array<{ warehouseId: string; stock: number }> }>();
        let withoutLot = 0;
        for (const nivel of niveles) {
            if (!nivel.lot) {
                withoutLot += nivel.stock;
                continue;
            }
            const expiresAt = aDia(nivel.lot.expiresAt);
            const daysLeft = diasHasta(expiresAt, hoy);
            const lote = lotes.get(nivel.lot.id) ?? { id: nivel.lot.id, code: nivel.lot.code, expiresAt, daysLeft, expired: daysLeft < 0, stock: 0, levels: [] };
            lote.stock += nivel.stock;
            lote.levels.push({ warehouseId: nivel.warehouseId, stock: nivel.stock });
            lotes.set(nivel.lot.id, lote);
        }
        return { lots: [...lotes.values()], withoutLot };
    },

    /**
     * T5-14 — cada cifra es lo que tiene que quedar **en el almacén** de la petición (o en el
     * predeterminado), como en un `ADJUSTMENT` a mano: es la pantalla con la que se corrige el
     * inventario de un sitio.
     */
    async bulkUpdateStock(dto: BulkStockDto) {
        const results: Array<{ productId: string; success: boolean; error?: string }> = [];
        const almacen = await almacenParaOperar(dto.warehouseId);
        const note = dto.reason ?? "Ajuste masivo de inventario";

        await Promise.all(
            dto.items.map(async ({ productId, stock }) => {
                try {
                    // Lee, ajusta y registra el movimiento dentro de una única transacción
                    // para mantener stock y movimiento consistentes ante concurrencia.
                    const movido = await prisma.$transaction((tx) =>
                        fijar(tx, { productId, warehouseId: almacen.id, cantidad: stock, type: "ADJUSTMENT", note }),
                    );

                    if (movido.delta < 0) {
                        dispararAlertaStock({ id: productId, name: movido.name, stock: movido.stock, minStock: movido.minStock });
                    }

                    results.push({ productId, success: true });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Error desconocido";
                    results.push({ productId, success: false, error: message });
                }
            }),
        );

        return results;
    },

    /**
     * T5-01 — los cambios de coste de un producto, del más reciente al más antiguo.
     *
     * Paginado desde el principio, a diferencia del de precios: el precio lo cambia una
     * persona de vez en cuando, pero el coste cambia **en cada recepción**, y un producto
     * que se compra a diario acumula cientos de filas al año (la regla de T4-15).
     */
    async getCostHistory(productId: string, query: CostHistoryQuery = {}) {
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
        const where = { productId };

        const [history, total] = await prisma.$transaction([
            prisma.costHistory.findMany({
                where,
                skip,
                take: limit,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            }),
            prisma.costHistory.count({ where }),
        ]);

        return { history, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },

    async getPriceHistory(productId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        const history = await prisma.priceHistory.findMany({
            where: { productId },
            orderBy: { createdAt: "asc" },
        });

        return { product, history };
    },
};
