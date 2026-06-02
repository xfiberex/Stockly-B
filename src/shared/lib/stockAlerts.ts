import { prisma } from "@/shared/lib/prisma";
import { settingsService } from "@/modules/settings/settings.service";
import { sendLowStockAlertEmail } from "@/shared/lib/nodemailer";

// Notifica por correo a los administradores cuando un producto queda en/bajo su stock mínimo.
// Compartido por product.service y sale-orders.service para evitar duplicación.
// Es best-effort: los fallos de envío no interrumpen la operación que lo dispara.
export async function checkLowStockAlert(
    productName: string,
    newStock: number,
    minStock: number,
): Promise<void> {
    if (newStock > minStock) return;

    const enabled = await settingsService.get("lowStockAlertEnabled");
    if (!enabled) return;

    const admins = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true, isVerified: true },
        select: { email: true, name: true },
    });

    await Promise.allSettled(
        admins.map((admin) =>
            sendLowStockAlertEmail(admin.email, admin.name, productName, newStock, minStock),
        ),
    );
}
