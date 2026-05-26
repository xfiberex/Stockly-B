// Exporta una clase de error personalizada para manejar errores HTTP
export class HttpError extends Error {
    // Código de estado HTTP asociado al error
    public statusCode: number;

    // Constructor que recibe el código de estado y el mensaje del error
    constructor(statusCode: number, message: string) {
        // Llama al constructor de la clase base Error con el mensaje del error
        super(message);

        // Asigna el código de estado al error
        this.statusCode = statusCode;

        // Establece el nombre del error para facilitar su identificación
        this.name = "HttpError";

        // Asegura que el prototipo del error sea correcto para que instanceof funcione correctamente
        Object.setPrototypeOf(this, HttpError.prototype);
    }
}