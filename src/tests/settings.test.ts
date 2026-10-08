import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";
import { settingsService } from "@/modules/settings/settings.service";
import { uploadToCloudinary, deleteFromCloudinary } from "@/shared/middlewares/upload.middleware";
import { negocioSchema } from "@/contratos/api";

// T6-03 — solo se sustituyen las dos llamadas a Cloudinary. **multer y la comprobación de firma
// son los de verdad**: es lo que permite probar la subida del logo por HTTP, con su
// `multipart/form-data`, en vez de dar por buena una ruta que nunca ha visto un archivo.
jest.mock("@/shared/middlewares/upload.middleware", () => ({
    ...jest.requireActual("@/shared/middlewares/upload.middleware"),
    uploadToCloudinary: jest.fn(),
    deleteFromCloudinary: jest.fn(),
}));

const subir = uploadToCloudinary as jest.MockedFunction<typeof uploadToCloudinary>;
const borrar = deleteFromCloudinary as jest.MockedFunction<typeof deleteFromCloudinary>;

const BASE = "/api/v1/settings";

describe("Settings API (ADMIN)", () => {
    let adminCookie: string;
    let userCookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "settings_admin@example.com", role: "ADMIN" });
        const user = await createUser({ email: "settings_user@example.com", role: "USER" });
        adminCookie = getAuthCookie(admin.id);
        userCookie = getAuthCookie(user.id);
    });

    afterEach(async () => {
        await prisma.appSetting.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("Guardia de autenticación y rol", () => {
        it("401: GET /settings sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("403: un USER no puede acceder a configuración", async () => {
            const res = await request(app).get(BASE).set("Cookie", userCookie);
            expect(res.status).toBe(403);
        });
    });

    describe("Lectura y escritura", () => {
        it("devuelve el catálogo con el valor por defecto (lowStockAlertEnabled=false)", async () => {
            const res = await request(app).get(BASE).set("Cookie", adminCookie);
            expect(res.status).toBe(200);
            const setting = res.body.data.find((s: { key: string }) => s.key === "lowStockAlertEnabled");
            expect(setting).toBeDefined();
            expect(setting.value).toBe(false);
        });

        it("actualiza en lote y persiste el nuevo valor", async () => {
            const patch = await request(app)
                .patch(BASE)
                .set("Cookie", adminCookie)
                .send({ lowStockAlertEnabled: true });
            expect(patch.status).toBe(200);

            const res = await request(app).get(BASE).set("Cookie", adminCookie);
            const setting = res.body.data.find((s: { key: string }) => s.key === "lowStockAlertEnabled");
            expect(setting.value).toBe(true);

            const stored = await prisma.appSetting.findUnique({ where: { key: "lowStockAlertEnabled" } });
            expect(stored?.value).toBe("true");
        });

    });

    // El endpoint aceptaba cualquier cuerpo y respondía 200 sin efecto, que es como
    // T1-05 (el frontend enviaba `{ updates: {...} }`) sobrevivió sin ser detectado.
    // Desde T1-07 el esquema es estricto y se genera desde SETTINGS_CATALOG.
    describe("Validación del cuerpo (T1-07)", () => {
        it("422: una clave fuera del catálogo se rechaza en lugar de ignorarse", async () => {
            const res = await request(app)
                .patch(BASE)
                .set("Cookie", adminCookie)
                .send({ claveInventada: true, lowStockAlertEnabled: false });

            expect(res.status).toBe(422);
            expect(await prisma.appSetting.count()).toBe(0);
        });

        it("422: el payload antiguo `{ updates: {...} }` se rechaza", async () => {
            const res = await request(app)
                .patch(BASE)
                .set("Cookie", adminCookie)
                .send({ updates: { lowStockAlertEnabled: true } });

            expect(res.status).toBe(422);
            expect(await prisma.appSetting.count()).toBe(0);
        });

        it("422: un valor con el tipo equivocado se rechaza", async () => {
            const res = await request(app)
                .patch(BASE)
                .set("Cookie", adminCookie)
                .send({ lowStockAlertEnabled: "true" });

            expect(res.status).toBe(422);
            expect(res.body.errors[0].field).toBe("lowStockAlertEnabled");
        });

        it("422: un cuerpo que no es objeto no provoca un 500", async () => {
            const res = await request(app)
                .patch(BASE)
                .set("Cookie", adminCookie)
                .set("Content-Type", "application/json")
                .send("[1,2]");

            expect(res.status).toBe(422);
        });

        it("422: un cuerpo vacío se rechaza en lugar de responder 200 sin efecto", async () => {
            const res = await request(app).patch(BASE).set("Cookie", adminCookie).send({});
            expect(res.status).toBe(422);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("Datos del negocio y moneda (T6-03)", () => {
        const guardar = (cuerpo: Record<string, unknown>) => request(app).patch(BASE).set("Cookie", adminCookie).send(cuerpo);
        const negocio = (cookie = userCookie) => request(app).get(`${BASE}/business`).set("Cookie", cookie);

        beforeEach(() => {
            subir.mockReset();
            borrar.mockReset();
        });

        describe("GET /settings/business", () => {
            it("401 sin sesión", async () => {
                expect((await request(app).get(`${BASE}/business`)).status).toBe(401);
            });

            it("sin nada guardado, un USER recibe el `$` de siempre, los datos vacíos y ningún logo", async () => {
                const res = await negocio();

                expect(res.status).toBe(200);
                expect(res.body.data).toEqual({
                    name: "", taxId: "", address: "", phone: "", email: "", currencySymbol: "$", taxName: "", taxRate: 0, logoUrl: null,
                });
                expect(negocioSchema.safeParse(res.body.data).success).toBe(true);
            });

            it("un USER ve la moneda y los datos que guardó el ADMIN, y sigue sin entrar en GET /settings", async () => {
                const patch = await guardar({ currencySymbol: "RD$", businessName: "Ferretería El Tornillo", businessTaxId: "1-31-12345-6" });
                expect(patch.status).toBe(200);

                const res = await negocio();
                expect(res.body.data).toMatchObject({ currencySymbol: "RD$", name: "Ferretería El Tornillo", taxId: "1-31-12345-6" });

                expect((await request(app).get(BASE).set("Cookie", userCookie)).status).toBe(403);
            });

            it("no trae ningún ajuste de administración: solo sus nueve campos", async () => {
                // Con todo el catálogo guardado, para que no sea la ausencia de filas lo que lo oculte.
                await guardar({ lowStockAlertEnabled: true, weeklyDigestEnabled: true, defaultLeadTimeDays: 9, timezone: "UTC" });

                const res = await negocio();

                expect(Object.keys(res.body.data).sort()).toEqual(
                    ["address", "currencySymbol", "email", "logoUrl", "name", "phone", "taxId", "taxName", "taxRate"],
                );
                expect(JSON.stringify(res.body.data)).not.toContain("UTC");
            });
        });

        describe("El símbolo de la moneda", () => {
            it.each(["$", "RD$", "S/", "Bs.", "€", "£", "¥", "Q", "CRC", "R$", "kr"])("guarda «%s»", async (simbolo) => {
                const res = await guardar({ currencySymbol: simbolo });

                expect(res.status).toBe(200);
                expect(await settingsService.moneda()).toBe(simbolo);
            });

            it.each([
                ["vacío", ""],
                ["de seis caracteres", "RD$MXN"],
                ["que el PDF no sabe imprimir", "₡"],
                ["con una cifra, que se confundiría con el importe", "1$"],
                ["con un signo", "-$"],
                ["con un espacio", "RD $"],
                ["con HTML", "<b>"],
            ])("422: un símbolo %s se rechaza y no se guarda", async (_caso, simbolo) => {
                const res = await guardar({ currencySymbol: simbolo });

                expect(res.status).toBe(422);
                expect(res.body.errors[0].field).toBe("currencySymbol");
                expect(await prisma.appSetting.count()).toBe(0);
            });

            it("si la tabla trae uno que no vale, se usa `$` en vez de imprimir un importe sin moneda", async () => {
                // Solo puede pasar editando la base a mano: el PATCH no lo deja entrar.
                await prisma.appSetting.create({ data: { key: "currencySymbol", value: "₡" } });

                expect(await settingsService.moneda()).toBe("$");
                expect((await negocio()).body.data.currencySymbol).toBe("$");
            });
        });

        describe("Los datos del negocio", () => {
            it("se guardan recortados, y una cadena vacía los borra", async () => {
                await guardar({ businessName: "  Ferretería El Tornillo  ", businessPhone: "809-555-0101" });
                expect((await negocio()).body.data).toMatchObject({ name: "Ferretería El Tornillo", phone: "809-555-0101" });

                expect((await guardar({ businessPhone: "" })).status).toBe(200);
                expect((await negocio()).body.data.phone).toBe("");
            });

            it.each([
                ["un nombre de más de 120 caracteres", { businessName: "x".repeat(121) }, "businessName"],
                ["un correo que no lo es", { businessEmail: "ventas@" }, "businessEmail"],
                ["una dirección con un salto de línea, que descolocaría el PDF", { businessAddress: "Calle 1\nSanto Domingo" }, "businessAddress"],
                ["un número donde va un texto", { businessTaxId: 131123456 }, "businessTaxId"],
            ])("422: %s", async (_caso, cuerpo, campo) => {
                const res = await guardar(cuerpo);

                expect(res.status).toBe(422);
                expect(res.body.errors[0].field).toBe(campo);
                expect(await prisma.appSetting.count()).toBe(0);
            });

            it("el correo es opcional, y uno válido se guarda", async () => {
                expect((await guardar({ businessEmail: "ventas@eltornillo.do" })).status).toBe(200);
                expect((await negocio()).body.data.email).toBe("ventas@eltornillo.do");
            });

            it("GET /settings dice a qué grupo pertenece cada ajuste y el tope de los textos", async () => {
                const res = await request(app).get(BASE).set("Cookie", adminCookie);
                const por = Object.fromEntries(res.body.data.map((a: { key: string }) => [a.key, a]));

                expect(por.businessName).toMatchObject({ group: "business", type: "string", value: "", maxLength: 120 });
                expect(por.currencySymbol).toMatchObject({ group: "business", value: "$", maxLength: 5 });
                expect(por.timezone).toMatchObject({ group: "general" });
                expect(por.timezone.maxLength).toBeUndefined();
                expect(res.body.data.every((a: { group: string }) => ["business", "general"].includes(a.group))).toBe(true);
            });
        });

        describe("El logo", () => {
            const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
            const subirLogo = (cookie = adminCookie, archivo: Buffer = PNG, tipo = "image/png") =>
                request(app).put(`${BASE}/logo`).set("Cookie", cookie).attach("logo", archivo, { filename: "logo.png", contentType: tipo });

            it("un ADMIN lo sube: se guarda como PNG acotado y lo ve cualquier rol", async () => {
                subir.mockResolvedValue({ url: "https://res.cloudinary.com/demo/logo-1.png", publicId: "stockly/business/logo-1" });

                const res = await subirLogo();

                expect(res.status).toBe(200);
                expect(res.body.data.logoUrl).toBe("https://res.cloudinary.com/demo/logo-1.png");
                expect(subir).toHaveBeenCalledWith(expect.any(Buffer), "stockly/business", {
                    format: "png",
                    transformation: { width: 600, height: 600, crop: "limit" },
                });
                expect((await negocio()).body.data.logoUrl).toBe("https://res.cloudinary.com/demo/logo-1.png");
            });

            it("al sustituirlo borra el anterior de Cloudinary, y solo después de tener el nuevo", async () => {
                subir.mockResolvedValueOnce({ url: "https://res.cloudinary.com/demo/logo-1.png", publicId: "stockly/business/logo-1" });
                await subirLogo();
                subir.mockResolvedValueOnce({ url: "https://res.cloudinary.com/demo/logo-2.png", publicId: "stockly/business/logo-2" });

                const res = await subirLogo();

                expect(res.body.data.logoUrl).toBe("https://res.cloudinary.com/demo/logo-2.png");
                expect(borrar).toHaveBeenCalledTimes(1);
                expect(borrar).toHaveBeenCalledWith("stockly/business/logo-1");
                expect(borrar.mock.invocationCallOrder[0]!).toBeGreaterThan(subir.mock.invocationCallOrder[1]!);
            });

            it("si la subida falla, el negocio se queda con el logo que tenía", async () => {
                subir.mockResolvedValueOnce({ url: "https://res.cloudinary.com/demo/logo-1.png", publicId: "stockly/business/logo-1" });
                await subirLogo();
                subir.mockRejectedValueOnce(new Error("Cloudinary no responde"));

                const res = await subirLogo();

                expect(res.status).toBe(500);
                expect(borrar).not.toHaveBeenCalled();
                expect((await negocio()).body.data.logoUrl).toBe("https://res.cloudinary.com/demo/logo-1.png");
            });

            it("422 IMAGE_REQUIRED sin archivo", async () => {
                const res = await request(app).put(`${BASE}/logo`).set("Cookie", adminCookie);

                expect(res.status).toBe(422);
                expect(res.body.code).toBe("IMAGE_REQUIRED");
                expect(subir).not.toHaveBeenCalled();
            });

            it("422: un ejecutable con cabecera de imagen no llega a Cloudinary", async () => {
                const res = await subirLogo(adminCookie, Buffer.from("MZ\x90\x00ejecutable"), "image/png");

                expect(res.status).toBe(422);
                expect(res.body.code).toBe("INVALID_IMAGE_FILE");
                expect(subir).not.toHaveBeenCalled();
            });

            it("413 IMAGE_TOO_LARGE: una imagen de más de 2 MB la corta multer, y no es un 500", async () => {
                // Lo cortaba multer con un `MulterError` que nadie traducía: salía 500, «Error
                // interno», con la petición mal y el servidor bien. Igual que en productos.
                const grande = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);

                const res = await subirLogo(adminCookie, grande);

                expect(res.status).toBe(413);
                expect(res.body.code).toBe("IMAGE_TOO_LARGE");
                expect(res.body.params).toEqual({ megas: 2 });
                expect(subir).not.toHaveBeenCalled();
            });

            it("422 INVALID_IMAGE_FILE: un tipo que no se admite se rechaza por su cabecera, y tampoco es un 500", async () => {
                const res = await subirLogo(adminCookie, Buffer.from("GIF89a..."), "image/gif");

                expect(res.status).toBe(422);
                expect(res.body.code).toBe("INVALID_IMAGE_FILE");
                expect(subir).not.toHaveBeenCalled();
            });

            it("400: un archivo en un campo que no es «logo» no es un 500", async () => {
                const res = await request(app).put(`${BASE}/logo`).set("Cookie", adminCookie).attach("foto", PNG, "logo.png");

                expect(res.status).toBe(400);
                expect(res.body.code).toBe("UNEXPECTED_FILE_FIELD");
            });

            it("403: un USER ni lo sube ni lo quita", async () => {
                expect((await subirLogo(userCookie)).status).toBe(403);
                expect((await request(app).delete(`${BASE}/logo`).set("Cookie", userCookie)).status).toBe(403);
                expect(subir).not.toHaveBeenCalled();
            });

            it("el PATCH no puede escribir la URL del logo: no es un ajuste del catálogo", async () => {
                // De esa URL va a tirar el servidor para el comprobante (T6-07): solo puede
                // ponerla quien acaba de subir la imagen.
                const res = await guardar({ businessLogoUrl: "http://169.254.169.254/latest/meta-data" });

                expect(res.status).toBe(422);
                expect(await prisma.appSetting.count()).toBe(0);
            });

            it("quitarlo lo borra de la base y de Cloudinary; quitarlo otra vez no es un error", async () => {
                subir.mockResolvedValue({ url: "https://res.cloudinary.com/demo/logo-1.png", publicId: "stockly/business/logo-1" });
                await subirLogo();

                const res = await request(app).delete(`${BASE}/logo`).set("Cookie", adminCookie);
                expect(res.status).toBe(200);
                expect(res.body.data.logoUrl).toBeNull();
                expect(borrar).toHaveBeenCalledWith("stockly/business/logo-1");
                expect(await prisma.appSetting.count()).toBe(0);

                const otraVez = await request(app).delete(`${BASE}/logo`).set("Cookie", adminCookie);
                expect(otraVez.status).toBe(200);
                expect(borrar).toHaveBeenCalledTimes(1);
            });

            it("si Cloudinary no deja borrar el anterior, el logo se quita igualmente", async () => {
                subir.mockResolvedValue({ url: "https://res.cloudinary.com/demo/logo-1.png", publicId: "stockly/business/logo-1" });
                await subirLogo();
                borrar.mockRejectedValueOnce(new Error("Cloudinary no responde"));

                const res = await request(app).delete(`${BASE}/logo`).set("Cookie", adminCookie);

                expect(res.status).toBe(200);
                expect((await negocio()).body.data.logoUrl).toBeNull();
            });
        });
    });
});
