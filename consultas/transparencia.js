// routes/transparencia.js
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const pool = require('../bd');

const router = express.Router();
// URL externa para subir archivos vía PHP
const UPLOAD_PHP_URL = 'https://portal.sututeh.com/upload.php';

// Multer en memoria para recibir el file
const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /api/transparencia/categorias
 * Devuelve el catálogo de categorías de transparencia
 */
router.get('/categorias', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nombre FROM categorias_transparencia ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener categorías de transparencia:', err);
    res.status(500).json({ error: 'Error interno al obtener categorías' });
  }
});

/**
 * POST /api/transparencia
 * Recibe form-data con:
 *  - file        (archivo PDF/DOC/etc)
 *  - titulo      (string)
 *  - categoriaId (número)
 *
 * Sube el file a UPLOAD_PHP_URL, obtiene { url },
 * y luego inserta el registro en la tabla transparencia.
 */
router.post('/', upload.single('file'), async (req, res) => {
  const { titulo, categoriaId } = req.body;
  if (!req.file || !titulo || !categoriaId) {
    return res.status(400).json({ error: 'Faltan archivo, título o categoría' });
  }

  try {
    // 1) Armar el form-data para PHP
    const form = new FormData();
    form.append('file', req.file.buffer, req.file.originalname);

    // 2) Enviar a tu endpoint PHP
    const phpRes = await axios.post(UPLOAD_PHP_URL, form, {
      headers: form.getHeaders()
    });

    const archivoUrl = phpRes.data.url;
    if (!archivoUrl) {
      return res.status(500).json({ error: 'PHP no devolvió URL' });
    }

    // 3) Guardar metadatos en BD
    const [ result ] = await pool.query(
      `INSERT INTO transparencia
         (titulo, categoria_id, url_archivo)
       VALUES (?, ?, ?)`,
      [titulo, categoriaId, archivoUrl]
    );

    res.status(201).json({
      id: result.insertId,
      url: archivoUrl,
      message: 'Documento de transparencia creado correctamente'
    });
  } catch (err) {
    console.error('Error en POST /api/transparencia:', err);
    res.status(500).json({ error: 'Error interno al crear transparencia' });
  }
});


/**
 * GET /api/transparencia
 * Devuelve todos los documentos de transparencia
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id,
              t.titulo,
              t.url_archivo AS url,
              t.fecha_publicacion,
              c.nombre AS categoria
       FROM transparencia t
       JOIN categorias_transparencia c ON t.categoria_id = c.id
       ORDER BY t.fecha_publicacion DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener documentos de transparencia:', err);
    res.status(500).json({ error: 'Error interno al obtener documentos' });
  }
});

/**
 * GET /api/transparencia/:id
 * Devuelve un documento de transparencia por su ID
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [[doc]] = await pool.query(
      `SELECT t.id,
              t.titulo,
              t.url_archivo AS url,
              t.fecha_publicacion,
              c.id AS categoriaId,
              c.nombre AS categoria
       FROM transparencia t
       JOIN categorias_transparencia c ON t.categoria_id = c.id
       WHERE t.id = ?`,
      [id]
    );
    if (!doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    res.json(doc);
  } catch (err) {
    console.error('Error al obtener documento de transparencia:', err);
    res.status(500).json({ error: 'Error interno al obtener documento' });
  }
});


// PUT actualizar sólo metadata (titulo y categoría)
router.put('/:id', async (req, res) => {
  const { titulo, categoriaId } = req.body;
  if (!titulo || !categoriaId) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const [result] = await pool.query(
      'UPDATE transparencia SET titulo = ?, categoria_id = ? WHERE id = ?',
      [titulo, categoriaId, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    res.json({ message: 'Metadatos actualizados correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno al actualizar documento' });
  }
});


/**
 * DELETE /api/transparencia/:id
 * Elimina un documento de transparencia de la BD y del storage PHP
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 1) Obtener URL de archivo desde BD
    const [[doc]] = await pool.query(
      'SELECT url_archivo FROM transparencia WHERE id = ?', [id]
    );
    if (!doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    // 2) Extraer nombre de archivo
    const fileName = doc.url_archivo.split('/').pop();

    // 3) Eliminar archivo vía endpoint PHP usando query param
    await axios.delete(`${UPLOAD_PHP_URL}?file=${encodeURIComponent(fileName)}`);

    // 4) Eliminar registro de la BD
    await pool.query('DELETE FROM transparencia WHERE id = ?', [id]);

    res.json({ message: 'Documento eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar documento de transparencia:', err);
    res.status(500).json({ error: 'Error interno al eliminar documento' });
  }
});

module.exports = router;
