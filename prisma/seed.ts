import "dotenv/config";
import { prisma, Prisma } from "../src/shared/lib/prisma";

const products: Prisma.ProductCreateInput[] = [
    {
        name: 'Laptop Pro 15',
        description: 'Laptop de alto rendimiento con procesador Intel i9',
        price: new Prisma.Decimal('1299.99'),
        stock: 15,
        category: 'Electrónica',
    },
    {
        name: 'Monitor UltraWide 34"',
        description: 'Monitor curvo 3440x1440 con 144Hz',
        price: new Prisma.Decimal('549.99'),
        stock: 8,
        category: 'Electrónica',
    },
    {
        name: 'Teclado Mecánico RGB',
        description: 'Switches Cherry MX Red, layout español',
        price: new Prisma.Decimal('89.99'),
        stock: 30,
        category: 'Periféricos',
    },
    {
        name: 'Mouse Inalámbrico Ergonómico',
        description: 'DPI ajustable hasta 4000, batería 90 días',
        price: new Prisma.Decimal('45.00'),
        stock: 50,
        category: 'Periféricos',
    },
    {
        name: 'Silla Gaming Lumbar',
        description: 'Soporte lumbar ajustable, reclinable 180°',
        price: new Prisma.Decimal('320.00'),
        stock: 5,
        category: 'Muebles',
    },
    {
        name: 'Escritorio Standing Desk',
        description: 'Altura ajustable eléctrica, 140x70cm',
        price: new Prisma.Decimal('450.00'),
        stock: 3,
        category: 'Muebles',
    },
    {
        name: 'Auriculares Noise Cancelling',
        description: 'Sony WH-1000XM5, cancelación de ruido activa',
        price: new Prisma.Decimal('279.99'),
        stock: 12,
        category: 'Audio',
    },
    {
        name: 'Webcam 4K',
        description: 'Resolución 4K/30fps, autoenfoque, micrófono dual',
        price: new Prisma.Decimal('129.99'),
        stock: 20,
        category: 'Periféricos',
    },
];

async function main() {
    console.log("Iniciando seeding de productos...");

    await prisma.product.deleteMany();

    for (const product of products) {
        await prisma.product.create({ data: product });
    }

    console.log("Seeding completado.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });