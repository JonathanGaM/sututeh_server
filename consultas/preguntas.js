// consultas/preguntas.js
const express    = require('express');
const pool       = require('../bd');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const refreshSession = require('../config/refreshSession');


const router = express.Router();

// Configurar nodemailer
const transporter = nodemailer.createTransport({
  host:   "smtp.hostinger.com",
  port:   465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Cargar plantilla HTML de respuesta
const templatePath = path.join(__dirname, "../emailTemplates/emailrespuesta.htm");
const htmlTemplate = fs.readFileSync(templatePath, "utf8");


  
// ELIMINA TODAS las definiciones duplicadas de router.post('/:id/responder')
// y usa SOLO esta versión corregida:

router.post(
  '/:id/responder',
  [ body('respuesta').notEmpty().withMessage('La respuesta es requerida') ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const mensajeId = req.params.id;
    const { respuesta } = req.body;

    try {
      // 1) Obtener datos del mensaje
      const [[mensaje]] = await pool.query(
        `SELECT id_usuario,
                nombre,
                apellido_paterno,
                apellido_materno,
                correo_electronico,
                mensaje AS pregunta
         FROM mensajes_contacto
         WHERE id = ?`,
        [mensajeId]
      );
      
      if (!mensaje) {
        return res.status(404).json({ error: "Pregunta no encontrada" });
      }

      // 2) Guardar la respuesta en la BD (para ambos casos)
      await pool.query(
        `INSERT INTO mensajes_contacto_respuestas
           (mensaje_id, respuesta, respondido_por)
         VALUES (?, ?, ?)`,
        [mensajeId, respuesta.trim(), mensaje.id_usuario || null]
      );

      // 3) Actualizar estado
      await pool.query(
        `UPDATE mensajes_contacto SET estado = 'respondido' WHERE id = ?`,
        [mensajeId]
      );

      // 4) Si es usuario NO registrado, enviar email
      if (!mensaje.id_usuario) {
        try {
          // Preparar HTML con los reemplazos
          let htmlEmail = htmlTemplate
            .replace(/{{nombre}}/g, mensaje.nombre || 'Usuario')
            .replace(/{{pregunta}}/g, mensaje.pregunta || '')
            .replace(/{{respuesta}}/g, respuesta || '');

          // Enviar email
          const info = await transporter.sendMail({
            from: `"SUTUTEH" <${process.env.EMAIL_USER}>`,
            to: mensaje.correo_electronico,
            subject: "Respuesta a tu consulta - SUTUTEH",
            html: htmlEmail
          });

          console.log('Email enviado:', info.messageId);
          
          return res.json({ 
            message: "Respuesta guardada y enviada por correo.",
            emailSent: true 
          });
          
        } catch (emailError) {
          console.error("Error al enviar email:", emailError);
          // Aunque falle el email, la respuesta ya se guardó
          return res.json({ 
            message: "Respuesta guardada, pero hubo un error al enviar el correo.",
            emailSent: false,
            warning: emailError.message 
          });
        }
      }

      // 5) Usuario registrado (solo guardar en BD)
      return res.json({ 
        message: "Respuesta guardada correctamente.",
        emailSent: false 
      });

    } catch (err) {
      console.error("Error en POST /preguntas/:id/responder:", err);
      res.status(500).json({ 
        error: "Error interno al responder la pregunta.",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
);

 // POST /api/preguntas
// Crea una nueva pregunta de usuario no registrado
router.post(
  '/',
  [
    body('nombre').notEmpty().withMessage('El nombre es requerido'),
    body('apellidoPaterno').notEmpty().withMessage('El apellido paterno es requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('mensaje').notEmpty().withMessage('El mensaje es requerido')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
      return res.status(400).json({ errors: errors.array() });

    const {
      nombre,
      apellidoPaterno,
      apellidoMaterno = '',
      telefono = null,
      email,
      mensaje
    } = req.body;

    try {
      const [result] = await pool.query(
        `INSERT INTO mensajes_contacto
           (id_usuario, nombre, apellido_paterno, apellido_materno, correo_electronico, telefono, mensaje)
         VALUES
           (NULL, ?, ?, ?, ?, ?, ?)`,
        [nombre, apellidoPaterno, apellidoMaterno, email, telefono, mensaje]
      );
      res.status(201).json({
        id: result.insertId,
        message: 'Pregunta creada correctamente'
      });
    } catch (err) {
      console.error('Error en POST /api/preguntas:', err);
      res.status(500).json({ error: 'Error interno al crear la pregunta.' });
    }
  }
);
 

/**
 * POST /api/preguntas/registrado
 * Guarda una pregunta de usuario autenticado leyendo su cookie JWT.
 */
router.post(
  '/registrado',
  refreshSession,
  [ body('mensaje').notEmpty().withMessage('El mensaje es requerido') ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const usuarioId = req.user.sub;
    const { mensaje } = req.body;

    try {
      // 1) Obtener datos del usuario
      const [[user]] = await pool.query(
        `SELECT 
           u.nombre,
           u.apellido_paterno   AS apellidoPaterno,
           u.apellido_materno   AS apellidoMaterno,
           u.telefono,
           au.correo_electronico AS email
         FROM perfil_usuarios u
         JOIN autenticacion_usuarios au ON au.id = u.id
         WHERE u.id = ?`,
        [usuarioId]
      );
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

      // 2) Insertar la pregunta con referencia al usuario
      const [result] = await pool.query(
        `INSERT INTO mensajes_contacto
           (id_usuario, nombre, apellido_paterno, apellido_materno,
            correo_electronico, telefono, mensaje)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          usuarioId,
          user.nombre,
          user.apellidoPaterno,
          user.apellidoMaterno,
          user.email,
          user.telefono,
          mensaje.trim()
        ]
      );

      return res.status(201).json({
        id: result.insertId,
        message: 'Pregunta creada correctamente para usuario registrado.'
      });
    } catch (err) {
      console.error('Error POST /api/preguntas/registrado:', err);
      return res.status(500).json({ error: 'Error interno al crear la pregunta.' });
    }
  }
);

  

/**
 * POST /api/preguntas/:id/responder-registrado
 * Solo para usuarios autenticados (agremiados). No envía email.
 */
router.post(
  '/:id/responder-registrado',
  refreshSession,                            // refresca y valida la cookie JWT
  [ body('respuesta').notEmpty() ],          // valida que haya texto
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const mensajeId = req.params.id;
    const usuarioId = req.user.sub;           // ID del agremiado

    try {
      // 1) Obtener el mensaje y asegurarnos de que sea de este agremiado
      const [[mensaje]] = await pool.query(
        `SELECT id_usuario
           FROM mensajes_contacto
          WHERE id = ?`,
        [mensajeId]
      );
      if (!mensaje) {
        return res.status(404).json({ error: 'Pregunta no encontrada.' });
      }
      if (mensaje.id_usuario !== usuarioId) {
        return res.status(403).json({ error: 'No autorizado para responder esta pregunta.' });
      }

      // 2) Guardar la respuesta in-app
      await pool.query(
        `INSERT INTO mensajes_contacto_respuestas
           (mensaje_id, respuesta, respondido_por)
         VALUES (?, ?, ?)`,
        [mensajeId, req.body.respuesta.trim(), usuarioId]
      );

      // 3) Actualizar estado a 'respondido'
      await pool.query(
        `UPDATE mensajes_contacto
            SET estado = 'respondido'
          WHERE id = ?`,
        [mensajeId]
      );

      res.json({ message: 'Respuesta guardada correctamente.' });
    } catch (err) {
      console.error('Error POST /preguntas/:id/responder-registrado:', err);
      res.status(500).json({ error: 'Error interno al guardar la respuesta.' });
    }
  }
);


/**
 * GET /api/preguntas
 * Consulta todas las preguntas junto con sus respuestas
 */
router.get('/', async (req, res) => {
  try {
    // 1) Traer todas las preguntas
    const [mensajes] = await pool.query(`
      SELECT 
        id,
        id_usuario,
        nombre,
        apellido_paterno,
        apellido_materno,
        correo_electronico,
        telefono,
        mensaje,
        estado,
        DATE_FORMAT(creado_en, '%Y-%m-%d') AS date
      FROM mensajes_contacto
      ORDER BY creado_en DESC
    `);

    // 2) Para cada mensaje, traer sus respuestas
    const results = await Promise.all(mensajes.map(async m => {
      const [resps] = await pool.query(
        `SELECT respuesta FROM mensajes_contacto_respuestas WHERE mensaje_id = ? ORDER BY respondido_en`,
        [m.id]
      );
      return {
        id:           m.id,
        registrado:   m.id_usuario !== null,
        nombre:       m.nombre,
        apellidoP:    m.apellido_paterno,
        apellidoM:    m.apellido_materno,
        telefono:     m.telefono,
        correo:       m.correo_electronico,
        date:         m.date,
        question:     m.mensaje,
        estado:       m.estado,
        responses:    resps.map(r => r.respuesta)
      };
    }));

    res.json(results);
  } catch (err) {
    console.error("Error en GET /preguntas:", err);
    res.status(500).json({ error: "Error interno al consultar preguntas." });
  }
});

/**
 * POST /api/preguntas/:id/responder-admin
 * Para uso en Thunder Client o panel admin, sin cookie.
 * Inserta la respuesta en la BD y marca el mensaje como 'respondido'.
 */
router.post(
  '/:id/responder-admin',
  [ body('respuesta').notEmpty().withMessage('La respuesta es requerida') ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const mensajeId = req.params.id;
    const { respuesta } = req.body;

    try {
      // 1) Verificar que exista el mensaje
      const [[mensaje]] = await pool.query(
        `SELECT id FROM mensajes_contacto WHERE id = ?`,
        [mensajeId]
      );
      if (!mensaje) {
        return res.status(404).json({ error: 'Pregunta no encontrada.' });
      }

      // 2) Guardar la respuesta in-app (respondido_por=NULL indica admin)
      await pool.query(
        `INSERT INTO mensajes_contacto_respuestas
           (mensaje_id, respuesta, respondido_por)
         VALUES (?, ?, NULL)`,
        [mensajeId, respuesta.trim()]
      );

      // 3) Actualizar estado a 'respondido'
      await pool.query(
        `UPDATE mensajes_contacto
            SET estado = 'respondido'
          WHERE id = ?`,
        [mensajeId]
      );

      return res.json({ message: 'Respuesta guardada correctamente (admin).' });
    } catch (err) {
      console.error('Error POST /preguntas/:id/responder-admin:', err);
      return res.status(500).json({ error: 'Error interno al guardar la respuesta.' });
    }
  }
);



/**
 * DELETE /api/preguntas/:id
 * Elimina una pregunta y, por cascada, sus respuestas.
 */
router.delete('/:id', async (req, res) => {
  const mensajeId = req.params.id;
  try {
    await pool.query(
      `DELETE FROM mensajes_contacto WHERE id = ?`,
      [mensajeId]
    );
    res.json({ message: "Pregunta eliminada correctamente." });
  } catch (err) {
    console.error("Error en DELETE /preguntas/:id:", err);
    res.status(500).json({ error: "Error interno al eliminar la pregunta." });
  }
});
/**
 * GET /api/preguntas/usuario
 * Devuelve solo las preguntas (y sus respuestas) del usuario logueado.
 */
router.get(
  '/usuario',
  refreshSession,
  async (req, res) => {
    const usuarioId = req.user.sub;
    try {
      // 1) Traer las preguntas de este usuario
    const [mensajes] = await pool.query(
        `SELECT 
           id, mensaje AS question, estado,
           DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i') AS date
         FROM mensajes_contacto
         WHERE id_usuario = ?
         ORDER BY creado_en ASC`,      // ← ASC para que primero vengan las más antiguas
        [usuarioId]
      );

      // 2) Para cada una, sus respuestas
      const results = await Promise.all(
        mensajes.map(async m => {
          const [resps] = await pool.query(
            `SELECT respuesta FROM mensajes_contacto_respuestas
             WHERE mensaje_id = ? ORDER BY respondido_en`,
            [m.id]
          );
          return {
            id: m.id,
            question: m.question,
            date: m.date,
            estado: m.estado,
            responses: resps.map(r => r.respuesta)
          };
        })
      );

      res.json(results);
    } catch (err) {
      console.error('Error GET /preguntas/usuario:', err);
      res.status(500).json({ error: 'Error interno al consultar tus preguntas.' });
    }
  }
);


module.exports = router;
