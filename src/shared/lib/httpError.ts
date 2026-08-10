import type { CodigoDeError } from "@/contratos/api";

/** Los huecos del mensaje, para que el cliente pueda componer el suyo (T4-04). */
export type ParametrosDeError = Record<string, string | number>;

export class HttpError extends Error {
    public statusCode: number;

    /**
     * El código estable del error (T4-04). El `message` sigue siendo la frase en español que
     * ve quien consulta la API sin interfaz; el código es lo que permite al frontend enseñar
     * el suyo en el idioma del usuario. Es opcional porque no todo lo que se lanza tiene un
     * código pensado —un error de terceros que se reenvía, por ejemplo—, y sin él el cliente
     * cae al mensaje, que es lo que hacía siempre.
     */
    public code?: CodigoDeError;

    /**
     * Los valores que el mensaje interpola. Van aparte **porque una frase con los huecos ya
     * rellenos no se puede traducir**: «Stock insuficiente para "Teclado". Disponible: 3,
     * requerido: 5» necesita las tres piezas sueltas para volver a componerse en otro idioma,
     * donde además no van en el mismo orden.
     */
    public params?: ParametrosDeError;

    constructor(statusCode: number, message: string, code?: CodigoDeError, params?: ParametrosDeError) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.params = params;
        this.name = "HttpError";
        // Necesario para que instanceof funcione correctamente con clases que extienden Error en TS
        Object.setPrototypeOf(this, HttpError.prototype);
    }
}
