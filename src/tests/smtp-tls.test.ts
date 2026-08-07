import net from "node:net";
import nodemailer from "nodemailer";
import { transporter } from "@/shared/lib/nodemailer";

// T1-20: el transporte debe exigir cifrado. Este archivo no mockea nodemailer:
// comprueba la configuración real y el comportamiento contra un servidor sin STARTTLS.

// Servidor SMTP mínimo que **no** anuncia STARTTLS y lo rechaza si se lo piden.
// Es el escenario peligroso: sin `requireTLS`, nodemailer sigue en claro contra él.
function servidorSinTls(): Promise<{ port: number; cerrar: () => Promise<void> }> {
    const server = net.createServer((socket) => {
        socket.write("220 fake ESMTP\r\n");
        let enDatos = false;

        socket.on("data", (buf) => {
            for (const linea of buf.toString().split("\r\n").filter(Boolean)) {
                if (enDatos) {
                    if (linea === ".") {
                        enDatos = false;
                        socket.write("250 OK: queued\r\n");
                    }
                    continue;
                }
                if (linea.startsWith("EHLO") || linea.startsWith("HELO")) socket.write("250 fake\r\n");
                else if (linea.startsWith("STARTTLS")) socket.write("502 Command not implemented\r\n");
                else if (linea.startsWith("DATA")) {
                    enDatos = true;
                    socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
                } else if (linea.startsWith("QUIT")) {
                    socket.write("221 Bye\r\n");
                    socket.end();
                } else socket.write("250 OK\r\n");
            }
        });
    });

    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as net.AddressInfo;
            resolve({
                port,
                cerrar: () => new Promise<void>((r) => server.close(() => r())),
            });
        });
    });
}

const correo = { from: "a@example.com", to: "b@example.com", subject: "x", text: "y" };

describe("Transporte SMTP con TLS obligatorio", () => {
    it("exige STARTTLS en la configuración del transporte", () => {
        const opciones = transporter.options as { requireTLS?: boolean; secure?: boolean; port?: number };
        expect(opciones.requireTLS).toBe(true);
        // TLS implícito solo en el puerto 465; en el resto se negocia con STARTTLS.
        expect(opciones.secure).toBe(opciones.port === 465);
    });

    it("aborta el envío si el servidor no ofrece STARTTLS, en vez de transmitir en claro", async () => {
        const { port, cerrar } = await servidorSinTls();
        const conRequireTls = nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, requireTLS: true });

        // `ETLS`: el servidor rechaza STARTTLS y el envío se aborta antes de enviar nada.
        await expect(conRequireTls.sendMail(correo)).rejects.toMatchObject({ code: "ETLS" });

        conRequireTls.close();
        await cerrar();
    }, 15000);

    it("sin `requireTLS`, ese mismo envío se completa en claro — la razón de la tarea", async () => {
        const { port, cerrar } = await servidorSinTls();
        const sinRequireTls = nodemailer.createTransport({ host: "127.0.0.1", port, secure: false });

        // El correo sale, sin cifrar, y el servidor lo acepta.
        await expect(sinRequireTls.sendMail(correo)).resolves.toMatchObject({ accepted: [correo.to] });

        sinRequireTls.close();
        await cerrar();
    }, 15000);
});
