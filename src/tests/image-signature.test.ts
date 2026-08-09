import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import { verificarFirmaDeImagen } from "@/shared/middlewares/upload.middleware";
import { HttpError } from "@/shared/lib/httpError";

// T2-32: `fileFilter` decidía por `file.mimetype`, que lo escribe quien envía. Un archivo
// cualquiera con la cabecera `image/jpeg` pasaba el filtro y se subía a Cloudinary, donde
// queda alojado en un dominio de confianza y servido por la URL que guarda el producto.
//
// Se prueba el middleware **directamente**, no por HTTP: `upload.middleware` está
// mockeado en `products.test.ts` y multer —que es quien parsea `multipart/form-data`—
// nunca llega a ejecutarse en la suite (trampa ya documentada en CONTEXTO.md). Una
// prueba por HTTP no comprobaría nada de esto.

/** Una petición con el archivo que multer habría dejado en `req.file`. */
function peticionCon(buffer: Buffer, mimetypeDeclarado = "image/jpeg") {
    return { file: { buffer, mimetype: mimetypeDeclarado } } as unknown as Request;
}

const res = {} as Response;

/** Ejecuta el middleware y dice si dejó pasar, o devuelve el error que lanzó. */
function ejecutar(req: Request) {
    let paso = false;
    try {
        verificarFirmaDeImagen(req, res, () => { paso = true; });
        return { paso, error: null as HttpError | null };
    } catch (error) {
        return { paso: false, error: error as HttpError };
    }
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);

describe("Firma real de las imágenes (T2-32)", () => {
    it("rechaza con 422 un ejecutable disfrazado de JPEG", () => {
        // `MZ`: cabecera de un ejecutable de Windows. Es el caso del criterio de
        // aceptación — cabecera `image/jpeg`, contenido que no lo es.
        const { paso, error } = ejecutar(peticionCon(Buffer.from("MZ\x90\x00ejecutable"), "image/jpeg"));

        expect(paso).toBe(false);
        expect(error).toBeInstanceOf(HttpError);
        expect(error?.statusCode).toBe(422);
    });

    it.each([
        ["JPEG", JPEG, "image/jpeg"],
        ["PNG", PNG, "image/png"],
        ["WebP", WEBP, "image/webp"],
    ])("deja pasar un %s de verdad", (_nombre, buffer, mime) => {
        const req = peticionCon(buffer as Buffer, mime as string);

        expect(ejecutar(req).paso).toBe(true);
    });

    it("un RIFF que no es WebP no cuela", () => {
        // La marca de WebP está **partida**: `RIFF` al principio y `WEBP` en el byte 8,
        // con el tamaño en medio. Un WAV empieza igual y no es una imagen.
        const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(20)]);

        expect(ejecutar(peticionCon(wav, "image/webp")).error?.statusCode).toBe(422);
    });

    it("un buffer más corto que la firma no revienta: se rechaza", () => {
        const { paso, error } = ejecutar(peticionCon(Buffer.from([0xff, 0xd8])));

        expect(paso).toBe(false);
        expect(error?.statusCode).toBe(422);
    });

    it("si el contenido es una imagen admitida pero la cabecera miente, manda el contenido", () => {
        const req = peticionCon(PNG, "image/jpeg");

        expect(ejecutar(req).paso).toBe(true);
        // Un navegador que etiqueta mal un PNG no es un ataque, y lo que importaba
        // —que sea una imagen— ya está comprobado. Se corrige en vez de rechazar.
        expect(req.file?.mimetype).toBe("image/png");
    });

    it("sin archivo deja pasar: la imagen es opcional al crear y editar", () => {
        expect(ejecutar({} as Request).paso).toBe(true);
    });
});

describe("Firma real de las imágenes — está enchufada (T2-32)", () => {
    it("toda ruta con `upload.single` lleva detrás la comprobación de firma", () => {
        // El middleware más correcto del mundo no sirve de nada si una ruta nueva se
        // olvida de él, y eso no lo caza ningún test de comportamiento.
        const rutas = fs.readFileSync(
            path.join(__dirname, "../modules/products/product.routes.ts"),
            "utf8",
        );
        const conSubida = rutas.split("\n").filter((l) => l.includes("upload.single("));

        expect(conSubida.length).toBeGreaterThan(0);
        for (const linea of conSubida) {
            expect(linea).toContain("verificarFirmaDeImagen");
        }
    });
});
