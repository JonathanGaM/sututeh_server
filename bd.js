// bd.js - VERSIÓN CORREGIDA
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

// ✅ FUNCIÓN SIMPLIFICADA PARA CONFIGURAR ZONA HORARIA
const configureTimezone = async (connection) => {
  try {
    // Configurar timezone para México
    await connection.promise().query("SET time_zone = '-06:00'");
    
    // Verificar que se configuró correctamente
    const [result] = await connection.promise().query("SELECT @@session.time_zone as current_tz");
    console.log('✅ Zona horaria configurada:', result[0].current_tz, '(México UTC-6)');
    return true;
  } catch (tzErr) {
    console.warn('⚠️ No se pudo configurar zona horaria:', tzErr.message);
    return false;
  }
};

// Probar la conexión inicial
pool.getConnection(async (err, connection) => {
  if (err) {
    console.error("❌ Error al conectar a la base de datos:", err.message);
    console.error("🔍 Detalles del error:", {
      code: err.code,
      errno: err.errno,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER
    });
    process.exit(1);
  } else {
    console.log("✅ Conexión exitosa a la base de datos MySQL");
    console.log(`🌍 Conectado a: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`🗄️ Base de datos: ${process.env.DB_NAME}`);
    
    // Configurar zona horaria
    await configureTimezone(connection);
    
    // Probar consulta con zona horaria (simplificada)
    try {
      const [rows] = await connection.promise().query('SELECT NOW() as server_time');
      console.log('🕐 Hora del servidor DB (México):', rows[0].server_time);
    } catch (timeErr) {
      console.warn('⚠️ No se pudo obtener hora del servidor:', timeErr.message);
    }
    
    connection.release();
  }
});

// ✅ EVENTOS DE CONEXIÓN SIMPLIFICADOS
pool.on('connection', function (connection) {
  console.log('🔗 Nueva conexión establecida:', connection.threadId);
  // Configurar timezone en nuevas conexiones de forma más simple
  connection.query("SET time_zone = '-06:00'", (err) => {
    if (err) {
      console.warn('⚠️ No se pudo configurar timezone en nueva conexión:', err.message);
    }
  });
});

pool.on('error', function(err) {
  console.error('❌ Error en el pool de conexiones:', err);
  if(err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 Reintentando conexión...');
  }
});

// Exportar el pool con promesas
module.exports = pool.promise();