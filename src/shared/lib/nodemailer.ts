import nodemailer from "nodemailer";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";
import {
    BRAND,
    renderEmail,
    emailButton,
    emailParagraph,
    emailNote,
    emailSubheading,
    emailTable,
} from "@/shared/lib/emailTemplates";
import { formatearImporte } from "@/shared/lib/moneda";
import type { DatosDelResumen } from "@/shared/lib/resumenSemanal";
import {
    traducirCorreo,
    type Idioma,
    type ClaveDeCorreo,
    type Valores,
} from "@/shared/i18n/correos";

/**
 * T4-12 — **ningún texto de correo se escribe en este archivo.** Cada función recibe el
 * `idioma` de su destinatario —`users.idioma`— y saca de ahí el asunto, el preencabezado, el
 * título, el cuerpo, el rótulo del botón y las notas.
 *
 * El `idioma` es un parámetro obligatorio y no tiene valor por defecto **a propósito**: con
 * uno, cualquier sitio que se olvide de pasarlo compila y manda el correo en español, que es
 * exactamente el fallo de partida. Sin él, `tsc` señala cada llamada.
 */

/**
 * El traductor de un correo, con la marca ya puesta.
 *
 * `{marca}` aparece en casi todas las frases —asuntos, preencabezados, pie— y siempre vale
 * lo mismo; pasarlo en cada llamada es la clase de repetición que se olvida en una y deja un
 * `{marca}` literal en el asunto de un correo real.
 */
function traductorDeCorreo(idioma: Idioma) {
    return (clave: ClaveDeCorreo, valores?: Valores) =>
        traducirCorreo(idioma, clave, { marca: BRAND.name, ...valores });
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Sin `secure` ni `requireTLS`, Nodemailer negocia STARTTLS de forma oportunista y
// sigue en claro si el servidor no lo anuncia: por ahí se irían las credenciales SMTP
// y los tokens de verificación y de reset que viajan en el cuerpo del correo.
// `secure: true` es TLS implícito (puerto 465); en los demás puertos `requireTLS`
// obliga a STARTTLS y aborta el envío si el servidor no lo ofrece.
export const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    requireTLS: true,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
});

// Sin credenciales SMTP el servidor arranca igual (T1-26). El fallo se produce aquí,
// al intentar enviar, con un mensaje que dice qué falta.
function requireSmtp(): void {
    if (!env.smtp.configured) {
        throw new HttpError(
            503,
            "El envío de correo no está configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM en el .env.",
            "EMAIL_NOT_CONFIGURED",
        );
    }
}

export async function sendVerificationEmail(to: string, name: string, token: string, idioma: Idioma) {
    requireSmtp();
    const url =`${env.frontendUrl}/auth/confirm-account?token=${token}`;
    const t = traductorDeCorreo(idioma);

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(name) })) +
        emailParagraph(t("verificacion.cuerpo")) +
        emailButton(url, t("verificacion.boton")) +
        emailNote(t("verificacion.nota"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: t("verificacion.asunto"),
        html: renderEmail({
            preheader: t("verificacion.preencabezado"),
            heading: t("verificacion.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string, idioma: Idioma) {
    requireSmtp();
    const url =`${env.frontendUrl}/auth/reset-password?token=${token}`;
    const t = traductorDeCorreo(idioma);

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(name) })) +
        emailParagraph(t("reset.cuerpo")) +
        emailButton(url, t("reset.boton")) +
        emailNote(t("reset.nota"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: t("reset.asunto"),
        html: renderEmail({
            preheader: t("reset.preencabezado"),
            heading: t("reset.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}

export async function sendLowStockAlertEmail(
    to: string,
    adminName: string,
    productName: string,
    currentStock: number,
    minStock: number,
    idioma: Idioma,
) {
    requireSmtp();
    const safeProduct = escapeHtml(productName);
    const url = `${env.frontendUrl}/products`;
    const t = traductorDeCorreo(idioma);

    // Tabla de datos con estilos inline (email-safe). Los rótulos de la columna izquierda
    // también se traducen: son texto, no datos.
    const stockTable = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:4px 0 8px;border:1px solid ${BRAND.border};border-radius:8px;">
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${t("stock.filaProducto")}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${BRAND.text};border-bottom:1px solid ${BRAND.border};">${safeProduct}</td>
        </tr>
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${t("stock.filaActual")}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#b91c1c;border-bottom:1px solid ${BRAND.border};">${currentStock}</td>
        </tr>
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};">${t("stock.filaMinimo")}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${BRAND.text};">${minStock}</td>
        </tr>
    </table>`;

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(adminName) })) +
        emailParagraph(t("stock.cuerpo", { producto: safeProduct })) +
        stockTable +
        emailButton(url, t("stock.boton")) +
        emailNote(t("stock.nota"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        // El asunto es texto plano: va el nombre sin escapar, porque `&amp;` en la bandeja
        // de entrada se lee como lo que es, un error.
        subject: t("stock.asunto", { producto: productName }),
        html: renderEmail({
            preheader: t("stock.preencabezado", { producto: safeProduct, actual: currentStock, minimo: minStock }),
            heading: t("stock.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}

/**
 * Aviso de pico de errores 5xx (T4-06).
 *
 * A diferencia del resto de correos de este archivo, este **no lo provoca una persona**:
 * lo dispara el propio servidor al detectar que está fallando. Por eso dice qué mirar y
 * dónde —las rutas afectadas y un `requestId` con el que recuperar la traza entera— en vez
 * de mandar a nadie a la interfaz: cuando llega esto, la interfaz es lo que no funciona.
 */
export async function sendServerErrorAlertEmail(
    to: string,
    adminName: string,
    resumen: {
        total: number;
        ventanaMinutos: number;
        rutas: Array<{ ruta: string; total: number }>;
        requestId?: string;
    },
    idioma: Idioma,
) {
    requireSmtp();
    const t = traductorDeCorreo(idioma);

    const filas = resumen.rutas
        .slice(0, 5)
        .map(
            ({ ruta, total }) => `
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${escapeHtml(ruta)}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#b91c1c;border-bottom:1px solid ${BRAND.border};">${total}</td>
        </tr>`,
        )
        .join("");

    const tabla = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:4px 0 8px;border:1px solid ${BRAND.border};border-radius:8px;">
        ${filas}
    </table>`;

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(adminName) })) +
        emailParagraph(t("errores.cuerpo", { total: resumen.total, minutos: resumen.ventanaMinutos })) +
        tabla +
        (resumen.requestId
            ? emailNote(t("errores.notaTraza", { requestId: escapeHtml(resumen.requestId) }))
            : "") +
        emailNote(t("errores.notaEnfriamiento"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: t("errores.asunto", { total: resumen.total, minutos: resumen.ventanaMinutos }),
        html: renderEmail({
            preheader: t("errores.preencabezado", { total: resumen.total, minutos: resumen.ventanaMinutos }),
            heading: t("errores.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}

/** El `locale` con el que se escriben las fechas de un correo. */
const localeDe = (idioma: Idioma) => (idioma === "EN" ? "en-US" : "es");

/** `21–27 sept 2026`: los dos extremos son días del negocio (`AAAA-MM-DD`), sin hora ni zona. */
function rangoDeDias(idioma: Idioma, from: string, to: string): string {
    const formato = new Intl.DateTimeFormat(localeDe(idioma), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return formato.formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
}

/**
 * T5-11 — el resumen semanal: lo vendido la semana anterior y lo que sigue pendiente hoy.
 *
 * Como la alerta de stock, **no lo pide nadie**: lo lanza un comando programado, así que el
 * idioma sale de la fila de cada destinatario. Las secciones sin nada que decir no salen,
 * salvo «lo más vendido», que dice que no hubo ventas: es la que da sentido a las cifras.
 *
 * No lleva nombres de clientes: una venta pendiente se identifica por su número.
 */
export async function sendWeeklyDigestEmail(to: string, adminName: string, datos: DatosDelResumen, idioma: Idioma) {
    requireSmtp();
    const t = traductorDeCorreo(idioma);
    const periodo = rangoDeDias(idioma, datos.from, datos.to);
    const numero = (id: string) => id.slice(0, 8).toUpperCase();
    const dia = new Intl.DateTimeFormat(localeDe(idioma), { day: "numeric", month: "short", timeZone: datos.zona });

    /** «Se muestran 10 de 37», solo cuando la tabla no los trae todos. */
    const recorte = (mostrados: number, total: number) =>
        total > mostrados ? emailNote(t("resumen.mostrados", { mostrados, total })) : "";

    const cifras = emailTable(null, [
        [t("resumen.cifra.ordenes"), String(datos.ventas.ordenes)],
        [t("resumen.cifra.unidades"), String(datos.ventas.unidades)],
        [t("resumen.cifra.importe"), formatearImporte(datos.ventas.importe)],
        [t("resumen.cifra.pendientes"), String(datos.pendientes.total)],
        [t("resumen.cifra.stockBajo"), String(datos.stockBajo.total)],
        [t("resumen.cifra.comprasAtrasadas"), String(datos.comprasAtrasadas.total)],
    ]);

    const masVendido =
        emailSubheading(t("resumen.masVendido.titulo")) +
        (datos.masVendido.length > 0
            ? emailTable(
                [t("resumen.col.producto"), t("resumen.col.unidades"), t("resumen.col.importe")],
                datos.masVendido.map((p) => [escapeHtml(p.nombre), String(p.unidades), formatearImporte(p.importe)]),
            )
            : emailParagraph(t("resumen.masVendido.vacio")));

    const stockBajo =
        datos.stockBajo.total > 0
            ? emailSubheading(t("resumen.stockBajo.titulo")) +
              emailTable(
                  [t("resumen.col.producto"), t("resumen.col.stock"), t("resumen.col.minimo")],
                  datos.stockBajo.productos.map((p) => [escapeHtml(p.nombre), String(p.stock), String(p.minimo)]),
              ) +
              recorte(datos.stockBajo.productos.length, datos.stockBajo.total)
            : "";

    const pendientes =
        datos.pendientes.total > 0
            ? emailSubheading(t("resumen.pendientes.titulo")) +
              emailTable(
                  [t("resumen.col.orden"), t("resumen.col.fecha"), t("resumen.col.importe")],
                  datos.pendientes.ordenes.map((o) => [
                      t("resumen.venta", { numero: numero(o.id) }),
                      dia.format(o.fecha),
                      formatearImporte(o.importe),
                  ]),
              ) +
              recorte(datos.pendientes.ordenes.length, datos.pendientes.total)
            : "";

    const compras =
        datos.comprasAtrasadas.total > 0
            ? emailSubheading(t("resumen.compras.titulo")) +
              emailTable(
                  [t("resumen.col.orden"), t("resumen.col.proveedor"), t("resumen.col.retraso")],
                  datos.comprasAtrasadas.ordenes.map((o) => [
                      t("resumen.compra", { numero: numero(o.id) }),
                      o.proveedor ? escapeHtml(o.proveedor) : t("resumen.sinProveedor"),
                      String(o.diasDeRetraso),
                  ]),
              ) +
              recorte(datos.comprasAtrasadas.ordenes.length, datos.comprasAtrasadas.total)
            : "";

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(adminName) })) +
        emailParagraph(t("resumen.cuerpo", { periodo })) +
        cifras +
        masVendido +
        stockBajo +
        pendientes +
        compras +
        emailButton(`${env.frontendUrl}/reports`, t("resumen.boton")) +
        emailNote(t("resumen.nota"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: t("resumen.asunto", { periodo }),
        html: renderEmail({
            preheader: t("resumen.preencabezado", {
                ordenes: datos.ventas.ordenes,
                importe: formatearImporte(datos.ventas.importe),
                pendientes: datos.pendientes.total,
                stockBajo: datos.stockBajo.total,
            }),
            heading: t("resumen.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}
