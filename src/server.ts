import "dotenv/config";
import colors from "colors";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { env } from "@/config/env";

async function main() {
    await prisma.$connect();
    console.log(colors.green("Conexión a la base de datos establecida"));

    app.listen(env.port, () => {
        console.log(colors.blue(`Servidor corriendo en http://localhost:${env.port}`));
    });
}

main().catch((error) => {
    console.error(colors.red("Error al iniciar el servidor:"), error);
    process.exit(1);
});