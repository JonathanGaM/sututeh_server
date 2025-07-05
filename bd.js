// bd.js
require("dotenv").config();
const mysql = require("mysql2");

// Detectar si es ambiente local o producción
const isProduction = process.env.NODE_ENV === 'production' || process.env.DB_HOST?.includes('hostinger');

// Configuración para la conexión a la base de datos
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  
  // ✅ Zona horaria de México (funciona tanto local como remoto)
  timezone: '-06:00',
  
  // ✅ SSL solo para producción/Hostinger
  ...(isProduction && {
    ssl: {
      rejectUnauthorized: false
    }
  })
};

// Crear un pool de conexiones
const pool = mysql.createPool(dbConfig);

// Probar la conexión inicial
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Error al conectar a la base de datos:", err.message);
    process.exit(1);
  } else {
    console.log("Conexión exitosa a la base de datos MySQL");
    
    // ✅ CONFIGURAR ZONA HORARIA EN LA CONEXIÓN DE PRUEBA
    connection.query("SET time_zone = '-06:00'", (tzErr) => {
      if (tzErr) {
        console.warn('⚠️ No se pudo configurar zona horaria:', tzErr.message);
      } else {
        console.log('✅ Zona horaria configurada: México (UTC-6)');
      }
      connection.release();
    });
  }
});

// Exportar el pool para usarlo en otros módulos
module.exports = pool.promise();