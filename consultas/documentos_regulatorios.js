// server/consultas/documentos_regulatorios.js
const express = require('express');
const pool = require('../bd');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// GET /api/documentos-regulatorios
// Devuelve todas las versiones de documentos regulatorios
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, seccion, version, contenido, estado, fecha_creacion, fecha_actualizacion
       FROM documentos_regulatorios
       ORDER BY fecha_creacion DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al consultar documentos_regulatorios:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/documentos-regulatorios
// Inserta una nueva versión de un documento regulatorio
router.post(
  '/',
  [
    body('seccion')
      .isIn(['Políticas de Servicio','Políticas de Privacidad','Términos y Condiciones'])
      .withMessage('Sección inválida'),
    body('contenido')
      .notEmpty()
      .withMessage('Contenido requerido'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { seccion, contenido } = req.body;

    try {
      // 1) obtener la versión máxima actual
      const [[{ max_version }]] = await pool.query(
        `SELECT COALESCE(MAX(version), 0) AS max_version
           FROM documentos_regulatorios
          WHERE seccion = ?`,
        [seccion]
      );
      const nuevaVersion = (parseFloat(max_version) + 0.1).toFixed(1);

      // 2) marcar previas como No Vigente
      await pool.query(
        `UPDATE documentos_regulatorios
           SET estado = 'No Vigente'
         WHERE seccion = ? AND estado = 'Vigente'`,
        [seccion]
      );

      // 3) insertar nueva versión
      const [result] = await pool.query(
        `INSERT INTO documentos_regulatorios
           (seccion, version, contenido, estado)
         VALUES (?, ?, ?, 'Vigente')`,
        [seccion, nuevaVersion, contenido]
      );

      res.status(201).json({
        id: result.insertId,
        version: nuevaVersion,
        message: 'Versión creada correctamente'
      });
    } catch (err) {
      console.error('Error al insertar documentos_regulatorios:', err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// PUT /api/documentos-regulatorios/:id
// Actualiza sólo el contenido de una versión existente
router.put(
  '/:id',
  [
    body('contenido')
      .notEmpty()
      .withMessage('Contenido requerido'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const { contenido } = req.body;

    try {
      const [result] = await pool.query(
        `UPDATE documentos_regulatorios
           SET contenido = ?, fecha_actualizacion = NOW()
         WHERE id = ?`,
        [contenido, id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Versión no encontrada' });
      }

      // devolver la fila actualizada
      const [[updated]] = await pool.query(
        `SELECT id, seccion, version, contenido, estado, fecha_creacion, fecha_actualizacion
           FROM documentos_regulatorios
          WHERE id = ?`,
        [id]
      );
      res.json({ message: 'Contenido actualizado', updated });
    } catch (err) {
      console.error('Error al actualizar documentos_regulatorios:', err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// DELETE /api/documentos-regulatorios/:id
// Elimina una versión
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `DELETE FROM documentos_regulatorios WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Versión no encontrada' });
    }
    res.json({ message: 'Versión eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar documentos_regulatorios:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});
/**
 * GET /api/documentos-regulatorios/public
 * Devuelve sólo la versión vigente de cada sección.
 * Si una sección no tiene ninguna fila con estado='Vigente', no aparece.
 */
router.get('/public', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, seccion, version, contenido, fecha_creacion, fecha_actualizacion
         FROM documentos_regulatorios
        WHERE estado = 'Vigente'
        ORDER BY seccion`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al consultar documentos_regulatorios/public:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
