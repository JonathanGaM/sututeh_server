// index.js
require("dotenv").config();
const express        = require("express");
const cors           = require("cors");
const cookieParser   = require("cookie-parser");
const pool           = require("./bd");
const refreshSession = require("./config/refreshSession");


const app = express();
const port = process.env.PORT || 3001;
const path = require('path');


// 1) CORS
app.use(cors({
  origin:    
  [
    'http://localhost:3000',
    'https://sututeh.com',
    'https://www.sututeh.com'
  ],
  credentials: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.json());
app.use(cookieParser());
// Ruta principal
app.get("/", (req, res) => {
  res.send("Servidor y API funcionando correctamente");
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


// REFRESH DE SESIÓN (renueva JWT si existe)
app.use(refreshSession);

// RUTAS PROTEGIDAS (después de refreshSession)
const perfilRouter = require('./consultas/perfil');
const imgRoutes             = require("./consultas/img");

app.use('/api/perfilAgremiado', perfilRouter);
app.use('/api/img',             imgRoutes);



app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
