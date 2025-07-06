// routes/noticias.js - VERSIÓN CORREGIDA
const express = require("express");
const pool    = require("../bd");
const multer  = require("multer");
const { storageNoticias } = require("../cloudinaryConfig");
const upload = multer({ storage: storageNoticias });
const router = express.Router();

// GET /api/noticias - Con estado calculado dinámicamente
router.get('/', async (req, res) => {
  try {
    // ✅ Configurar zona horaria de México
    await pool.execute("SET time_zone = '-06:00'");
    
    const [noticias] = await pool.query(`
      SELECT 
        n.id, n.titulo, n.descripcion, n.contenido,
        n.fecha_publicacion, n.fecha_creacion, n.fecha_actualizacion,
        -- ✅ Estado calculado dinámicamente basado en fecha
        CASE
          WHEN DATE(n.fecha_publicacion) <= CURDATE() THEN 'Publicado'
          ELSE 'Programado'
        END AS estado,
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

// GET /api/noticias/publicados - Solo noticias publicadas
router.get('/publicados', async (req, res) => {
  try {
    await pool.execute("SET time_zone = '-06:00'");
    
    const [noticias] = await pool.query(`
      SELECT 
        n.id, n.titulo, n.descripcion, n.contenido,
        n.fecha_publicacion, n.fecha_creacion, n.fecha_actualizacion,
        'Publicado' AS estado,
        COALESCE(
          CONCAT('["', GROUP_CONCAT(nm.url_imagen SEPARATOR '","'), '"]'),
          '[]'
        ) AS imagenes,
        MAX(nm.url_video) AS url_video
      FROM noticias n
      LEFT JOIN noticias_multimedia nm
        ON nm.noticia_id = n.id
      WHERE DATE(n.fecha_publicacion) <= CURDATE()  -- ✅ Solo las ya publicadas
      GROUP BY n.id
      ORDER BY n.fecha_publicacion DESC
    `);
    res.json(noticias);
  } catch (err) {
    console.error('Error al consultar noticias publicadas:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/noticias/:id - Una noticia específica
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.execute("SET time_zone = '-06:00'");
    
    const [[row]] = await pool.query(`
      SELECT 
        n.id, n.titulo, n.descripcion, n.contenido,
        n.fecha_publicacion, n.fecha_creacion, n.fecha_actualizacion,
        CASE
          WHEN DATE(n.fecha_publicacion) <= CURDATE() THEN 'Publicado'
          ELSE 'Programado'
        END AS estado,
        MAX(nm.url_video) AS url_video,
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

// POST /api/noticias - Crear nueva noticia
router.post(
  "/",
  upload.fields([
    { name: "imagenes", maxCount: 5 },
    { name: "video",    maxCount: 1 }
  ]),
  async (req, res) => {
    const { titulo, descripcion, contenido, fecha_publicacion } = req.body;
    
    if (!titulo || !descripcion || !contenido || !fecha_publicacion) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
    
    try {
      await pool.execute("SET time_zone = '-06:00'");
      
      // ✅ Calcular estado en el servidor usando la fecha actual de México
      const [[{ estado_calculado }]] = await pool.query(`
        SELECT 
          CASE
            WHEN DATE(?) <= CURDATE() THEN 'Publicado'
            ELSE 'Programado'
          END AS estado_calculado
      `, [fecha_publicacion]);
      
      // 1) Insertar noticia
      const [result] = await pool.query(
        `INSERT INTO noticias
          (titulo, descripcion, contenido, fecha_publicacion, estado)
         VALUES (?, ?, ?, ?, ?)`,
        [titulo, descripcion, contenido, fecha_publicacion, estado_calculado]
      );
      const noticiaId = result.insertId;

      // 2) Insertar imágenes
      for (const file of req.files.imagenes || []) {
        await pool.query(
          `INSERT INTO noticias_multimedia 
             (noticia_id, url_imagen, orden)
           VALUES (?, ?, ?)`,
          [noticiaId, file.path, 0]
        );
      }

      // 3) Insertar vídeo
      if (req.files.video && req.files.video[0]) {
        await pool.query(
          `INSERT INTO noticias_multimedia 
             (noticia_id, url_imagen, orden, url_video)
           VALUES (?, '', 0, ?)`,
          [noticiaId, req.files.video[0].path]
        );
      }

      res.status(201).json({ 
        id: noticiaId, 
        message: "Noticia creada",
        estado: estado_calculado 
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// PUT /api/noticias/:id - Actualizar noticia
router.put(
  "/:id",
  upload.fields([
    { name: "imagenes", maxCount: 5 },
    { name: "video",    maxCount: 1 }
  ]),
  async (req, res) => {
    const { id } = req.params;
    const { titulo, descripcion, contenido, fecha_publicacion } = req.body;
    
    try {
      await pool.execute("SET time_zone = '-06:00'");
      
      // 1) Calcular nuevo estado si se cambió la fecha
      let estado_calculado = null;
      if (fecha_publicacion) {
        const [[{ estado }]] = await pool.query(`
          SELECT 
            CASE
              WHEN DATE(?) <= CURDATE() THEN 'Publicado'
              ELSE 'Programado'
            END AS estado
        `, [fecha_publicacion]);
        estado_calculado = estado;
      }
      
      // 2) Actualizar campos de texto
      const campos = [], valores = [];
      if (titulo)            { campos.push("titulo = ?");            valores.push(titulo); }
      if (descripcion)       { campos.push("descripcion = ?");       valores.push(descripcion); }
      if (contenido)         { campos.push("contenido = ?");         valores.push(contenido); }
      if (fecha_publicacion) { 
        campos.push("fecha_publicacion = ?"); 
        valores.push(fecha_publicacion);
        campos.push("estado = ?");
        valores.push(estado_calculado);
      }
      
      if (campos.length) {
        valores.push(id);
        await pool.query(
          `UPDATE noticias
             SET ${campos.join(", ")}, fecha_actualizacion = NOW()
           WHERE id = ?`,
          valores
        );
      }

      // 3) Manejar imágenes si hay nuevas
      if (req.files.imagenes && req.files.imagenes.length > 0) {
        // Borrar imágenes antiguas
        await pool.query(
          `DELETE FROM noticias_multimedia
             WHERE noticia_id = ? AND url_imagen != ''`,
          [id]
        );
        
        // Insertar nuevas imágenes
        for (const file of req.files.imagenes) {
          await pool.query(
            `INSERT INTO noticias_multimedia 
               (noticia_id, url_imagen, orden)
             VALUES (?, ?, 0)`,
            [id, file.path]
          );
        }
      }

      // 4) Manejar vídeo si hay uno nuevo
      if (req.files.video && req.files.video[0]) {
        // Borrar vídeo antiguo
        await pool.query(
          `DELETE FROM noticias_multimedia 
             WHERE noticia_id = ? AND url_video IS NOT NULL`,
          [id]
        );
        
        // Insertar nuevo vídeo
        await pool.query(
          `INSERT INTO noticias_multimedia 
             (noticia_id, url_imagen, orden, url_video)
           VALUES (?, '', 0, ?)`,
          [id, req.files.video[0].path]
        );
      }

      res.json({ 
        message: "Noticia actualizada",
        estado: estado_calculado 
      });
    } catch (err) {
      console.error("Error al actualizar noticia:", err);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// DELETE /api/noticias/:id - Eliminar noticia
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
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