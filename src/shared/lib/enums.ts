import { HttpError } from "@/shared/lib/httpError";

/**
 * T3-02 — traduce un valor de query string a un enum de Prisma, o rechaza la petición.
 *
 * Existe porque al convertir `role`, `action` y `entity` a enums nativos, `tsc` dejó de
 * aceptar `where: { role: query.role }`: la columna ya no admite cualquier cadena. Eso
 * obliga a decidir explícitamente qué pasa con `?role=basura`, que hasta ahora devolvía
 * una lista vacía por accidente.
 *
 * Se rechaza con **400** en vez de ignorar el filtro. Ignorarlo es la opción peligrosa:
 * `?role=admin` en minúscula devolvería **todos** los usuarios en lugar de ninguno, y
 * quien lo escribió no se enteraría. Un filtro que falla debe decirlo.
 *
 * La comprobación es `Object.hasOwn`, no `in`. No es un detalle: los enums generados son
 * objetos literales corrientes, así que heredan de `Object.prototype` y `"toString" in
 * SaleOrderStatus` es **verdadero**. Con `in`, `?status=toString` pasaba la guarda, se
 * casteaba a enum y reventaba dentro de Prisma — un 500 provocado desde la URL.
 */
export function filtroDeEnum<T extends Record<string, string>>(
    valores: T,
    valor: string | undefined,
    campo: string,
): T[keyof T] | undefined {
    if (valor === undefined || valor === "") return undefined;
    if (Object.hasOwn(valores, valor)) return valor as T[keyof T];

    throw new HttpError(
        400,
        `El filtro «${campo}» no admite el valor «${valor}». Valores válidos: ${Object.keys(valores).join(", ")}.`,
        "INVALID_FILTER_VALUE",
        { campo, valor, validos: Object.keys(valores).join(", ") },
    );
}
