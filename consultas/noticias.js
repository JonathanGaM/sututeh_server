// routes/noticias.js
const express = require("express");
const pool    = require("../bd");
const multer  = require("multer");
const { storageNoticias } = require("../cloudinaryConfig");
const upload = multer({ storage: storageNoticias });
const router = express.Router();

// GET /api/noticias
router.get('/', async (req, res) => {
  try {
    const [noticias] = await pool.query(`
      SELECT 
        n.id, n.titulo, n.descripcion, n.contenido,
        n.fecha_publicacion, n.estado, n.fecha_creacion,
        n.fecha_actualizacion,
        -- imágenes como array JSON
        COALESCE(
          CONCAT('["', GROUP_CONCAT(nm.url_imagen SEPARATOR '","'), '"]'),
          '[]'
        ) AS imagenes,
        -- un único vídeo (o NULL)
        MAX(nm.url_video) AS url_video
      FROM noticias n
      LEFT JOIN noticias_multimedia nm
        ON nm.noticia_id = n.id
      GROUP BY n.id
      ORDER BY n.fecha_publicacion DESC
    `);
    res.json(noticias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/noticias/publicados
 * Devuelve solo las noticias con estado = 'Publicado'
 */
router.get('/publicados', async (req, res) => {
  try {
    const [noticias] = await pool.query(`
      SELECT 
        n.id,
        n.titulo,
        n.descripcion,
        n.contenido,
        n.fecha_publicacion,
        n.estado,
        n.fecha_creacion,
        n.fecha_actualizacion,
        COALESCE(
          CONCAT('["', GROUP_CONCAT(nm.url_imagen SEPARATOR '","'), '"]'),
          '[]'
        ) AS imagenes,
        MAX(nm.url_video) AS url_video
      FROM noticias n
      LEFT JOIN noticias_multimedia nm
        ON nm.noticia_id = n.id
      WHERE n.estado = 'Publicado'
      GROUP BY n.id
      ORDER BY n.fecha_publicacion DESC
    `);

    

    res.json(noticias);
  } catch (err) {
    console.error('Error al consultar noticias publicadas:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});


/**
 * GET /api/noticias/:id
 * Devuelve una sola noticia con sus imágenes y vídeo
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [[row]] = await pool.query(`
      SELECT 
        n.id, n.titulo, n.descripcion, n.contenido,
        n.fecha_publicacion, n.estado, n.fecha_creacion,
        n.fecha_actualizacion,
        MAX(nm.url_video)   AS url_video,
        COALESCE(
          CONCAT('["', GROUP_CONCAT(nm.url_imagen SEPARATOR '","'), '"]'),
          '[]'
        ) AS imagenes
      FROM noticias n
      LEFT JOIN noticias_multimedia nm 
        ON nm.noticia_id = n.id
      WHERE n.id = ?
      GROUP BY n.id
    `, [id]);

    if (!row) return res.status(404).json({ error: 'Noticia no encontrada' });
    // parsear JSON de imágenes
    row.imagenes = JSON.parse(row.imagenes);
    res.json(row);
  } catch (err) {
    console.error('Error al consultar noticia:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/noticias
router.post(
  "/",
  upload.fields([
    { name: "imagenes", maxCount: 5 },
    { name: "video",    maxCount: 1 }
  ]),
  async (req, res) => {
    const { titulo, descripcion, contenido, fecha_publicacion, estado } = req.body;
    if (!titulo || !descripcion || !contenido || !fecha_publicacion || !estado) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
    try {
      // 1) Insertar noticia
      const [result] = await pool.query(
        `INSERT INTO noticias
          (titulo, descripcion, contenido, fecha_publicacion, estado)
         VALUES (?, ?, ?, ?, ?)`,
        [titulo, descripcion, contenido, fecha_publicacion, estado]
      );
      const noticiaId = result.insertId;

      // 2) Insertar imágenes (url_imagen)
      for (const file of req.files.imagenes || []) {
        await pool.query(
          `INSERT INTO noticias_multimedia 
             (noticia_id, url_imagen, orden)
           VALUES (?, ?, ?)`,
          [noticiaId, file.path, 0]
        );
      }

      // 3) Insertar vídeo (url_video)
      if (req.files.video && req.files.video[0]) {
        await pool.query(
          `INSERT INTO noticias_multimedia 
             (noticia_id, url_imagen, orden, url_video)
           VALUES (?, '', 0, ?)`,
          [noticiaId, req.files.video[0].path]
        );
      }

      res.status(201).json({ id: noticiaId, message: "Noticia creada" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// PUT /api/noticias/:id
router.put(
  "/:id",
  upload.fields([
    { name: "imagenes", maxCount: 5 },
    { name: "video",    maxCount: 1 }
  ]),
  async (req, res) => {
    const { id } = req.params;
    const { titulo, descripcion, contenido, fecha_publicacion, estado } = req.body;
    try {
      // 1) Actualizar campos de texto
      const campos = [], valores = [];
      if (titulo)            { campos.push("titulo = ?");            valores.push(titulo); }
      if (descripcion)       { campos.push("descripcion = ?");       valores.push(descripcion); }
      if (contenido)         { campos.push("contenido = ?");         valores.push(contenido); }
      if (fecha_publicacion) { campos.push("fecha_publicacion = ?"); valores.push(fecha_publicacion); }
      if (estado)            { campos.push("estado = ?");            valores.push(estado); }
      if (campos.length) {
        valores.push(id);
        await pool.query(
          `UPDATE noticias
             SET ${campos.join(", ")}, fecha_actualizacion = NOW()
           WHERE id = ?`,
          valores
        );
      }

       // 2) Borrar las imágenes antiguas de esta noticia
      await pool.query(
        `DELETE FROM noticias_multimedia
           WHERE noticia_id = ?
             AND url_imagen IS NOT NULL`,
        [id]
      );
      // 3) Insertar las nuevas imágenes
      for (const file of req.files.imagenes || []) {
        await pool.query(
          `INSERT INTO noticias_multimedia 
             (noticia_id, url_imagen, orden)
           VALUES (?, ?, 0)`,
          [id, file.path]
        );
      }

     

      // 3) Insertar/Reemplazar vídeo
      if (req.files.video && req.files.video[0]) {
        // Opcional: borrar antiguo vídeo si lo deseas
        // await pool.query(`DELETE FROM noticias_multimedia WHERE noticia_id=? AND url_video IS NOT NULL`, [id]);

        await pool.query(
          `INSERT INTO noticias_multimedia 
             (noticia_id, url_imagen, orden, url_video)
           VALUES (?, '', 0, ?)`,
          [id, req.files.video[0].path]
        );
      }

      res.json({ message: "Noticia actualizada" });
    } catch (err) {
      console.error("Error al actualizar noticia:", err);

      res.status(500).json({ error: "Error interno" });
    }
  }
);

/**
 * DELETE /api/noticias/:id
 * Elimina la noticia y todo su multimedia (gracias a ON DELETE CASCADE)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Elimina la noticia; las filas de noticias_multimedia se borran automáticamente
    const [result] = await pool.query(
      `DELETE FROM noticias WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }
    res.json({ message: 'Noticia eliminada' });
  } catch (err) {
    console.error('Error al eliminar noticia:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
