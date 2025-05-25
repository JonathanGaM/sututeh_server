const express = require('express');
const pool = require('../bd');
const multer  = require('multer');

const { body, validationResult } = require('express-validator');
const { storageNosotros } = require('../cloudinaryConfig');

const router = express.Router();
const upload = multer({ storage: storageNosotros });


/**
 * GET /api/nosotros
 * Devuelve todas las entradas de la sección "Nosotros"
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
     id,
     seccion,
     version,
     contenido,
     img,                           
     estado,
     fecha_creacion,
     fecha_actualizacion
   FROM nosotros
   ORDER BY fecha_creacion DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al consultar nosotros:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});


/**
 * POST /api/nosotros
 * Inserta una nueva versión de alguna sección de "Nosotros", incluyendo una imagen opcional
 */
router.post(
  "/",
  upload.single('img'),               // <--- middleware multer
  [
    body('seccion').notEmpty().withMessage('Sección requerida'),
    body('contenido').notEmpty().withMessage('Contenido requerido'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { seccion, contenido } = req.body;
    // multer habrá puesto la URL en req.file.path
    const img = req.file ? req.file.path : null;

    try {
      // 1) calcular nueva versión
      const [[{ max_version }]] = await pool.query(
        `SELECT COALESCE(MAX(version), 0) AS max_version
           FROM nosotros WHERE seccion = ?`,
        [seccion]
      );
      const nuevaVersion = (parseFloat(max_version) + 0.1).toFixed(1);

      // 2) desactivar previas
      await pool.query(
        `UPDATE nosotros SET estado = 'No Vigente'
           WHERE seccion = ? AND estado = 'Vigente'`,
        [seccion]
      );

      // 3) insertar con img
      const [result] = await pool.query(
        `INSERT INTO nosotros
           (seccion, version, contenido, img, estado)
         VALUES (?, ?, ?, ?, 'Vigente')`,
        [seccion, nuevaVersion, contenido, img]
      );

      res.status(201).json({
        id: result.insertId,
        version: nuevaVersion,
        img,
        message: "Versión creada correctamente",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error interno" });
    }
  }
);


  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [result] = await pool.query(
        `DELETE FROM nosotros WHERE id = ?`,
        [id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'No se encontró la versión indicada' });
      }
      res.json({ message: 'Versión eliminada correctamente' });
    } catch (err) {
      console.error('Error al eliminar nosotros:', err);
      res.status(500).json({ error: 'Error interno' });
    }
  });

 router.put(
  '/:id',
  upload.single('img'),                    // <— multer procesa campo "img"
  [
    body('contenido').notEmpty().withMessage('Contenido requerido'),
  ],
  async (req, res) => {
    // 1) Validaciones
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { contenido } = req.body;

    try {
      // 2) Construimos dinámicamente el SET según si viene imagen
      const sets = ['contenido = ?', 'fecha_actualizacion = NOW()'];
      const vals = [contenido];

      if (req.file) {
        // req.file.path  → URL de Cloudinary
        // req.file.filename → public_id en Cloudinary
       sets.push('img = ?');
   vals.push(req.file.path);
      }

      // 3) Ejecutamos el UPDATE
      vals.push(id);
      const sql = `
        UPDATE nosotros
          SET ${sets.join(', ')}
        WHERE id = ?
      `;
      const [result] = await pool.query(sql, vals);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Versión no encontrada' });
      }

      // 4) (Opcional) Devolver la fila actualizada
      const [[updated]] = await pool.query(
        `SELECT id, seccion, version, contenido, img, estado, fecha_creacion, fecha_actualizacion
           FROM nosotros
          WHERE id = ?`,
        [id]
      );

      res.json({ message: 'Versión actualizada', updated });
    } catch (err) {
      console.error('Error al actualizar nosotros:', err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

/**
 * GET /api/nosotros/vigentes
 * Devuelve sólo las entradas activas (estado = 'Vigente')
 */
router.get('/vigentes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         seccion,
         version,
         contenido,
         img,
         estado,
         fecha_creacion,
         fecha_actualizacion
       FROM nosotros
      WHERE estado = 'Vigente'
      ORDER BY seccion, version DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al consultar nosotros vigentes:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
