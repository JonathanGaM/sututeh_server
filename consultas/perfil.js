// consultas/perfil.js
const express = require('express');
const pool    = require('../bd');
const multer  = require('multer');
const { storage } = require('../cloudinaryConfig'); // tu configuración de Cloudinary
const upload  = multer({ storage });
const refreshSession = require('../config/refreshSession');

const router = express.Router();
// Función helper para validar autenticación
const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.sub) {
    return res.status(401).json({ 
      error: 'Usuario no autenticado. Por favor, inicia sesión nuevamente.' 
    });
  }
  next();
};
/**
 * GET /api/perfilAgremiado
 * Devuelve los datos del usuario autenticado (extraídos de la cookie JWT).
 */
/**
 * GET /api/perfilAgremiado
 * Devuelve los datos del usuario autenticado, incluyendo su estatus.
 */
router.get('/',refreshSession, requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
  
      const [[user]] = await pool.query(
        `SELECT
           p.id,
           p.nombre,
           p.apellido_paterno,
           p.apellido_materno,
           DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
           a.correo_electronico,
           p.telefono,
           p.genero,
           p.curp,
           u.nombre            AS universidad,
           pu.nombre           AS puesto,
           pr.nombre           AS programa_educativo,
           n.nombre            AS nivel_educativo,
           p.numero_trabajador,
           p.numero_sindicalizado,
           r.nombre            AS rol_sindicato,
           a.estatus           AS status,
           p.url_foto
         FROM perfil_usuarios p
         JOIN autenticacion_usuarios a ON p.id = a.id
         LEFT JOIN universidades u         ON p.universidad_id   = u.id
         LEFT JOIN puestos_universidad pu  ON p.puesto_id        = pu.id
         LEFT JOIN programas_educativos pr ON p.programa_id      = pr.id
         LEFT JOIN niveles_educativos n    ON p.nivel_id         = n.id
         JOIN roles_sindicato r            ON p.rol_sindicato_id = r.id
         WHERE p.id = ?`,
        [userId]
      );
  
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
  
      res.json(user);
    } catch (err) {
      console.error('Error en GET /api/perfilAgremiado:', err);
      res.status(500).json({ error: 'Error interno al obtener perfil' });
    }
  });

/**
 * POST /api/perfilAgremiado/foto
 * Recibe un archivo 'imagen', lo sube a Cloudinary y guarda la URL en la BD.
 */
router.post(
  '/foto',
   refreshSession,
  requireAuth,
  upload.single('imagen'),
  async (req, res) => {
    try {
      const userId = req.user.sub;

      if (!req.file || !req.file.path) {
        return res.status(400).json({ error: 'No se recibió una imagen válida' });
      }

      const urlFoto = req.file.path; // CloudinaryStorage devuelve la URL en file.path

      // Actualizar la columna url_foto en perfil_usuarios
      await pool.query(
        `UPDATE perfil_usuarios
           SET url_foto = ?
         WHERE id = ?`,
        [urlFoto, userId]
      );

      res.json({ urlFoto });
    } catch (err) {
      console.error('Error en POST /api/perfilAgremiado/foto:', err);
      res.status(500).json({ error: 'Error interno al guardar la foto' });
    }
  }
);

module.exports = router;
