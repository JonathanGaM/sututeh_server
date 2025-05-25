// consultas/preguntas.js
const express    = require('express');
const pool       = require('../bd');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');

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


  
router.post(
    '/:id/responder',
    [ body('respuesta').notEmpty().withMessage('La respuesta es requerida') ],
    async (req, res) => {
      // 0) Validar esquema
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
  
        if (mensaje.id_usuario) {
          // USUARIO REGISTRADO → guardamos in-app
          await pool.query(
            `INSERT INTO mensajes_contacto_respuestas
               (mensaje_id, respuesta, respondido_por)
             VALUES (?, ?, ?)`,
            [mensajeId, respuesta, mensaje.id_usuario]
          );
          // actualizamos estado
          await pool.query(
            `UPDATE mensajes_contacto SET estado = 'respondido' WHERE id = ?`,
            [mensajeId]
          );
          return res.json({ message: "Respuesta guardada in-app." });
  
        } else {
          // USUARIO NO REGISTRADO → enviamos email
          let html = htmlTemplate
            .replace('{{nombre}}', `${mensaje.nombre}`)
            .replace('{{pregunta}}', mensaje.pregunta)
            .replace('{{respuesta}}', respuesta);
  
          await transporter.sendMail({
            from:    process.env.EMAIL_USER,
            to:      mensaje.correo_electronico,
            subject: "Respuesta a tu consulta (SUTUTEH)",
            html
          });
  
          // **Nuevo**: guardar la respuesta en la tabla de respuestas
          await pool.query(
            `INSERT INTO mensajes_contacto_respuestas
               (mensaje_id, respuesta, respondido_por)
             VALUES (?, ?, NULL)`,
            [mensajeId, respuesta]
          );
  
          // actualizar estado
          await pool.query(
            `UPDATE mensajes_contacto SET estado = 'respondido' WHERE id = ?`,
            [mensajeId]
          );
  
          return res.json({ message: "Respuesta enviada por correo y guardada en BD." });
        }
  
      } catch (err) {
        console.error("Error en POST /preguntas/:id/responder:", err);
        res.status(500).json({ error: "Error interno al responder la pregunta." });
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
 * POST /api/preguntas/:id/responder
 * Responde una pregunta. 
 * - Si viene de usuario registrado, guarda la respuesta in-app.
 * - Si es pública, envía un email con la plantilla.
 */
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
        `SELECT id_usuario, nombre, apellido_paterno, apellido_materno,
                correo_electronico, mensaje AS pregunta
         FROM mensajes_contacto
         WHERE id = ?`,
        [mensajeId]
      );
      if (!mensaje) {
        return res.status(404).json({ error: "Pregunta no encontrada" });
      }

      if (mensaje.id_usuario) {
        // USUARIO REGISTRADO → guardamos in-app
        await pool.query(
          `INSERT INTO mensajes_contacto_respuestas
             (mensaje_id, respuesta, respondido_por)
           VALUES (?, ?, ?)`,
          [mensajeId, respuesta, mensaje.id_usuario]
        );
        // actualizamos estado
        await pool.query(
          `UPDATE mensajes_contacto SET estado = 'respondido' WHERE id = ?`,
          [mensajeId]
        );
        return res.json({ message: "Respuesta guardada in-app." });
      } else {
        // USUARIO NO REGISTRADO → enviamos email
        // preparar HTML
        let html = htmlTemplate
          .replace('{{nombre}}', `${mensaje.nombre}`)
          .replace('{{pregunta}}', mensaje.pregunta)
          .replace('{{respuesta}}', respuesta);

        await transporter.sendMail({
          from:    process.env.EMAIL_USER,
          to:      mensaje.correo_electronico,
          subject: "Respuesta a tu consulta (SUTUTEH)",
          html
        });

        // actualizamos estado
        await pool.query(
          `UPDATE mensajes_contacto SET estado = 'respondido' WHERE id = ?`,
          [mensajeId]
        );
        return res.json({ message: "Respuesta enviada por correo." });
      }
    } catch (err) {
      console.error("Error en POST /preguntas/:id/responder:", err);
      res.status(500).json({ error: "Error interno al responder la pregunta." });
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

module.exports = router;
