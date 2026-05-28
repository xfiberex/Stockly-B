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
