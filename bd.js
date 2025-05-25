//bd.js
require("dotenv").config();
const mysql = require("mysql2");

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
};

// Crear un pool de conexiones
const pool = mysql.createPool(dbConfig);

// Probar la conexión inicial
pool.getConnection((err) => {
  if (err) {
    console.error("Error al conectar a la base de datos:", err.message);
    process.exit(1);
  } else {
    console.log("Conexión exitosa a la base de datos MySQL");
  }
});

// Exportar el pool para usarlo en otros módulos
module.exports = pool.promise();
