import "dotenv/config";
import colors from "colors";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { env, validateEnv } from "@/config/env";

async function main() {
    validateEnv();

    await prisma.$connect();

    app.listen(env.port, () => {
        const base = `http://localhost:${env.port}`;
        const line  = colors.gray("─".repeat(45));

        console.log("");
        console.log(line);
        console.log(colors.bold.green("  ✦  Stockly API  —  en línea"));
        console.log(line);
        console.log(colors.white(`  🌐  Servidor       ${colors.cyan(`${base}/api/v1`)}`));
        console.log(colors.white(`  📋  Swagger        ${colors.cyan(`${base}/api/v1/docs`)}`));
        console.log(colors.white(`  💚  Healthcheck    ${colors.cyan(`${base}/api/v1/health`)}`));
        console.log(colors.white(`  🗄️   Base de datos  ${colors.green("conectada")}`));
        console.log(colors.white(`  🔧  Entorno        ${colors.yellow(env.nodeEnv)}`));
        console.log(line);
        console.log("");
    });
}

main().catch((error) => {
    console.error(colors.red("Error al iniciar el servidor:"), error);
    process.exit(1);
});