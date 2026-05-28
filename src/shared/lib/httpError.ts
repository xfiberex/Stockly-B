export class HttpError extends Error {
    public statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.name = "HttpError";
        // Necesario para que instanceof funcione correctamente con clases que extienden Error en TS
        Object.setPrototypeOf(this, HttpError.prototype);
    }
}
