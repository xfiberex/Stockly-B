const dotenv = require('dotenv');
const path = require('path');

// Carga credenciales base del .env de desarrollo
dotenv.config({ path: path.join(__dirname, '.env') });

// Redirige a la base de datos de prueba para no contaminar datos de desarrollo
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
    // Reemplaza solo el nombre de la base de datos al final de la URL
    process.env.DATABASE_URL = dbUrl.replace(/\/(\w+)(\?.*)?$/, '/Stockly_test$2');
}

process.env.NODE_ENV = 'test';

// Los grupos opcionales, **siempre** configurados y **siempre** falsos, pisen o no lo que traiga
// el `.env`. Hasta el 2026-09-28 los tests heredaban los del desarrollador: pasaban en una
// máquina con SMTP y Cloudinary reales, fallaban 14 en un clon limpio —lo destapó la primera
// ejecución de la CI, ADR 0008— y un test que olvidara el mock de `nodemailer` podía mandar un
// correo de verdad. El entorno de los tests lo define la suite, no quien la ejecuta. Las suites
// que prueban la ausencia de un grupo lo borran ellas mismas.
//
// `.invalid` es un dominio reservado (RFC 2606): nunca resuelve, así que ni por error sale nada.
Object.assign(process.env, {
    SMTP_HOST: 'smtp.stockly.invalid',
    SMTP_PORT: '587',
    SMTP_USER: 'tests@stockly.invalid',
    SMTP_PASS: 'no-es-una-contrasena',
    SMTP_FROM: 'Stockly <no-reply@stockly.invalid>',
    CLOUDINARY_CLOUD_NAME: 'stockly-tests',
    CLOUDINARY_API_KEY: '000000000000000',
    CLOUDINARY_API_SECRET: 'no-es-un-secreto',
});
