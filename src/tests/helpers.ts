import { prisma } from "@/shared/lib/prisma";
import { signToken } from "@/shared/lib/jwt";
import { hashPassword } from "@/shared/lib/hash";
import type { $Enums } from "@/generated/prisma/client";

export async function cleanDb() {
    await prisma.saleOrderItem.deleteMany();
    await prisma.saleOrder.deleteMany();
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.appSetting.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
}

interface CreateUserOptions {
    name?: string;
    email?: string;
    password?: string;
    isVerified?: boolean;
    // T3-02: el enum de Prisma, no `string`. Así un rol mal escrito en un test falla al
    // compilar en vez de al ejecutar contra la base.
    role?: $Enums.Role;
}

export async function createUser(options: CreateUserOptions = {}) {
    const {
        name = "Test User",
        email = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`,
        password = "Test1234!",
        isVerified = true,
        role = "USER",
    } = options;

    const hashed = await hashPassword(password);
    return prisma.user.create({
        data: { name, email, password: hashed, isVerified, role },
    });
}

export function getAuthCookie(userId: string): string {
    const token = signToken({ userId });
    return `token=${token}`;
}
