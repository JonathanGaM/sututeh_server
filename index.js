// index.js - VERSIÓN SIMPLIFICADA Y CORREGIDA
process.env.TZ = 'America/Mexico_City';
require("dotenv").config();
const express        = require("express");
const cors           = require("cors");
const cookieParser   = require("cookie-parser");
const pool           = require("./bd");
const refreshSession = require("./config/refreshSession");

const app = express();
const port = process.env.PORT || 3001;
const path = require('path');

// 🕐 FUNCIÓN PARA OBTENER FECHA/HORA DE MÉXICO
const getMexicoTime = () => {
  return new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// 📊 FUNCIÓN PARA FORMATEAR UPTIME
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
};

// 1) CORS
app.use(cors({
  origin: [
    //backen local y render
    'http://localhost:3000',
    'https://sututeh-server.onrender.com',
    //hostinger fronthen
    'https://sututeh.com',
    'https://www.sututeh.com',
  ],
  credentials: true
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use(cookieParser());

// 🚀 HEALTH CHECK SIMPLIFICADO PERO COMPLETO
app.get('/health', async (req, res) => {
  try {
    const mexicoTime = getMexicoTime();
    const isoTime = new Date().toISOString();
    const uptimeSeconds = process.uptime();
    
    // 🗄️ Probar conexión a base de datos de forma más simple
    let dbStatus = 'Unknown';
    let dbTime = null;
    
    try {
      const [dbResult] = await pool.query('SELECT NOW() as current_time');
      dbStatus = 'Connected';
      dbTime = dbResult[0]?.current_time;
    } catch (dbErr) {
      dbStatus = `Error: ${dbErr.message}`;
    }
    
    res.status(200).json({ 
      status: 'OK', 
      timestamp: isoTime,
      mexicoTime: mexicoTime,
      timezone: 'America/Mexico_City',
      message: 'Servidor SUTUTEH funcionando correctamente',
      uptime: Math.floor(uptimeSeconds),
      uptimeFormatted: formatUptime(uptimeSeconds),
      database: {
        status: dbStatus,
        time: dbTime
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      }
    });
  } catch (error) {
    console.error('❌ Error en health check:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Error en health check',
      error: error.message,
      timestamp: new Date().toISOString(),
      mexicoTime: getMexicoTime()
    });
  }
});

// 🎯 ENDPOINT PING SIMPLE PARA ANTI-SLEEP
app.get('/ping', (req, res) => {
  res.status(200).json({ 
    pong: true, 
    time: getMexicoTime(),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// 🔄 AUTO-PING SIMPLIFICADO (SOLO EN PRODUCCIÓN)
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  const https = require('https');
  
  console.log('🤖 Iniciando sistema anti-sleep...');
  
  // Ping cada 14 minutos para mantener activo
  setInterval(() => {
    const options = {
      hostname: 'sututeh-server.onrender.com',
      path: '/ping',
      method: 'GET',
      timeout: 10000
    };
    
    const req = https.request(options, (res) => {
      console.log(`🏃‍♂️ Keep-alive ping exitoso: ${res.statusCode} - ${getMexicoTime()}`);
    });
    
    req.on('error', (err) => {
      console.log(`❌ Keep-alive ping error: ${err.message}`);
    });
    
    req.on('timeout', () => {
      console.log(`⏰ Keep-alive ping timeout`);
      req.destroy();
    });
    
    req.setTimeout(10000);
    req.end();
  }, 14 * 60 * 1000); // 14 minutos
}

// Ruta principal
app.get("/", (req, res) => {
  const mexicoTime = getMexicoTime();
  
  res.json({
    message: "Servidor y API SUTUTEH funcionando correctamente",
    status: "active",
    time: mexicoTime,
    timezone: "America/Mexico_City",
    uptime: formatUptime(process.uptime())
  });
});

// RUTAS PÚBLICAS (antes de refreshSession)
const registroRoutes            = require('./consultas/registro');
const loginRoutes               = require('./consultas/login');
const recuperarContrasenaRoutes = require("./consultas/recuperarContrasena");
const filosofiaRoutes = require('./consultas/filosofia');
const documentosRegulatoriosRoutes = require('./consultas/documentos_regulatorios');
const datosEmpresaRoutes = require('./consultas/datos_empresa');
const noticiasRouter = require("./consultas/noticias");
const preguntasRouter = require('./consultas/preguntas');
const reunionesRouter  = require('./consultas/reunionesyasistencia');
const puestosRouter = require('./consultas/gestion_puestos');
const encuestasVotacionesRouter = require('./consultas/encuestasVotaciones');
const documentosRouter = require('./consultas/documentos');
const transparenciaRouter = require('./consultas/transparencia');
const rifasRouter = require('./consultas/rifas');
const authCheckRouter = require('./consultas/authCheck');
const verificarUsuarioRoutes = require('./consultas/verificarUsuario');
const gestionUsuariosRouter = require('./consultas/gestion_usuarios');

app.use('/api/registro',            registroRoutes);
app.use('/api/login',               loginRoutes);
app.use('/api/recuperarContrasena', recuperarContrasenaRoutes);
app.use('/api/nosotros', filosofiaRoutes);
app.use('/api/documentos-regulatorios', documentosRegulatoriosRoutes);
app.use('/api/datos-empresa', datosEmpresaRoutes);
app.use("/api/noticias", noticiasRouter);
app.use('/api/preguntas', preguntasRouter);
app.use('/api/reuniones',           reunionesRouter);
app.use('/api/puestos', puestosRouter);
app.use('/api/encuestas-votaciones', encuestasVotacionesRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api/transparencia', transparenciaRouter);
app.use('/api/rifas', rifasRouter);
app.use('/api/verificar-usuario', verificarUsuarioRoutes);
app.use('/api/usuarios', gestionUsuariosRouter);

// REFRESH DE SESIÓN (renueva JWT si existe)
app.use(refreshSession);
app.use('/api/auth-check', authCheckRouter);

// RUTAS PROTEGIDAS (después de refreshSession)
const perfilRouter = require('./consultas/perfil');
const imgRoutes             = require("./consultas/img");

app.use('/api/perfilAgremiado', perfilRouter);
app.use('/api/img',             imgRoutes);

app.listen(port, () => {
  const startTime = getMexicoTime();
  
  console.log('🚀 ================================');
  console.log('🏢 SERVIDOR SUTUTEH INICIADO');
  console.log('🚀 ================================');
  console.log(`🌐 Puerto: ${port}`);
  console.log(`🔗 URL Local: http://localhost:${port}`);
  console.log(`🔗 URL Producción: https://sututeh-server.onrender.com`);
  console.log(`🕐 Hora de inicio: ${startTime}`);
  console.log(`🌍 Zona horaria: America/Mexico_City`);
  console.log(`🗄️ Base de datos: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
  console.log(`🤖 Auto-ping: ${process.env.NODE_ENV === 'production' || process.env.RENDER ? 'ACTIVADO' : 'DESACTIVADO'}`);
  console.log('🚀 ================================');
});

module.exports = app;