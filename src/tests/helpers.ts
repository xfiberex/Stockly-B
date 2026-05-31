import { prisma } from "@/shared/lib/prisma";
import { signToken } from "@/shared/lib/jwt";
import { hashPassword } from "@/shared/lib/hash";

export async function cleanDb() {
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.user.deleteMany();
}

interface CreateUserOptions {
    name?: string;
    email?: string;
    password?: string;
    isVerified?: boolean;
    role?: string;
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
