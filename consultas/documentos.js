  // routes/documentos.js
  const express = require('express');
  const pool    = require('../bd');
  const multer  = require('multer');
  const path    = require('path');
  const fs      = require('fs');
  const { storagePortadas } = require('../cloudinaryConfig');

  const router = express.Router();

  // Multer para portadas en Cloudinary
  const uploadPortada = multer({ storage: storagePortadas });

  // 1.a) Asegúrate de que exista la carpeta
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }


// …crea uploadDir, uploadFile, storage, upload, etc.

// Este es el handler que faltaba:
function uploadPortadaHandler(req, res, next) {
  uploadPortada.single('portada')(req, res, err => {
    if (err) return next(err);
    if (req.file) req.uploadedPortada = req.file;
    next();
  });
}
  
  // Multer para archivos (pdf, docx, etc.) en disco local
const uploadFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext)
        .replace(/\s+/g, '_')
        .substr(0, 50);
      cb(null, `${name}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

  // 1.b) Configura el storage de multer
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // renombra para evitar colisiones
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext)
                    .replace(/\s+/g, '_')
                    .substr(0, 50);
      cb(null, `${name}_${Date.now()}${ext}`);
    }
  });

  // 1.c) Límite de 50 MB
  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }  // 50MB
  });

  /**
   * POST /api/documentos/subirArchivo
   * Recibe un campo 'file' (form-data), guarda en /uploads y devuelve la URL
   */
  router.post(
    '/subirArchivo',
    upload.single('file'),
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No se envió ningún archivo' });
      }
      // Genera la URL pública del archivo
      const protocol = req.secure ? 'https' : 'http';
      const host     = req.headers.host;
      const relative = `/uploads/${req.file.filename}`;
      const url      = `${protocol}://${host}${relative}`;

      res.json({ filename: req.file.filename, url });
    }
  );




  // POST /api/documentos/subirPortada → Cloudinary
  router.post(
    '/subirPortada',
    uploadPortada.single('portada'),
    (req, res) => {
      if (!req.file || !req.file.path) {
        return res.status(400).json({ error: 'Imagen de portada requerida' });
      }
      res.json({ url: req.file.path });
    }
  );

  // GET /api/documentos/roles
  router.get('/roles', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT id, nombre FROM roles_sindicato');
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener roles:', err);
      res.status(500).json({ error: 'Error interno al obtener roles' });
    }
  });

  // GET /api/documentos/categorias
  router.get('/categorias', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT id, nombre FROM categoria_documento');
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener categorías:', err);
      res.status(500).json({ error: 'Error interno al obtener categorías' });
    }
  });

  // POST /api/documentos → guardar metadatos
  router.post('/', async (req, res) => {
    const { nombre, descripcion, categoriaId, permisoAcceso, imgPortada, archivoUrl } = req.body;
    if (!nombre || !descripcion || !categoriaId || !permisoAcceso || !archivoUrl) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    try {
      const [result] = await pool.query(
        `INSERT INTO documentos
          (nombre, descripcion, categoria_id, permiso_acceso, img_portada, archivo_url, fecha_publicacion)
        VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [nombre, descripcion, categoriaId, permisoAcceso, imgPortada || null, archivoUrl]
      );
      res.status(201).json({ id: result.insertId, message: 'Documento creado correctamente' });
    } catch (err) {
      console.error('Error al guardar documento:', err);
      res.status(500).json({ error: 'Error interno al guardar documento' });
    }
  });

  // GET /api/documentos → listar documentos
  router.get('/', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT d.id, d.nombre, d.descripcion, d.img_portada AS portada, d.archivo_url AS url, d.fecha_publicacion, c.nombre AS categoria, r.nombre AS permiso
        FROM documentos d
        JOIN categoria_documento c ON d.categoria_id = c.id
        JOIN roles_sindicato r ON d.permiso_acceso = r.id
        ORDER BY d.fecha_publicacion DESC`
      );
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener documentos:', err);
      res.status(500).json({ error: 'Error interno al obtener documentos' });
    }
  });

  // GET /api/documentos/:id → un documento
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [[doc]] = await pool.query(
        `SELECT d.id, d.nombre, d.descripcion, d.img_portada AS portada, d.archivo_url AS url, d.fecha_publicacion, c.id AS categoriaId, c.nombre AS categoria, r.id AS permisoId, r.nombre AS permiso
        FROM documentos d
        JOIN categoria_documento c ON d.categoria_id = c.id
        JOIN roles_sindicato r ON d.permiso_acceso = r.id
        WHERE d.id = ?`, [id]
      );
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      res.json(doc);
    } catch (err) {
      console.error('Error al obtener documento:', err);
      res.status(500).json({ error: 'Error interno al obtener documento' });
    }
  });
/**
 * PUT /api/documentos/:id/metadata
 * Actualiza nombre, descripción, categoría, permiso y portada (opcional),
 * pero deja intacto el archivo_url
 */
router.put(
  '/:id/metadata',
  uploadPortadaHandler,    // solo para la portada
  async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, categoriaId, permisoAcceso } = req.body;
    // Validación básica
    if (!nombre || !descripcion || !categoriaId || !permisoAcceso) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    try {
      // 1) Leer la portada actual del registro
      const [[doc]] = await pool.query(
        'SELECT img_portada FROM documentos WHERE id = ?', [id]
      );
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

      // 2) Determinar la nueva URL de portada
      let newPortada = doc.img_portada;
      if (req.uploadedPortada) {
        // multer+Cloudinary deja la ruta en req.uploadedPortada.path
        newPortada = req.uploadedPortada.path;
      }

      // 3) Actualizar únicamente metadatos y portada
      await pool.query(
        `UPDATE documentos SET
           nombre         = ?,
           descripcion    = ?,
           categoria_id   = ?,
           permiso_acceso = ?,
           img_portada    = ?
         WHERE id = ?`,
        [nombre, descripcion, categoriaId, permisoAcceso, newPortada, id]
      );

      return res.json({ message: 'Metadatos actualizados correctamente' });
    } catch (err) {
      console.error('Error actualizando metadatos:', err);
      return res.status(500).json({ error: 'Error interno al actualizar metadatos' });
    }
  }
);


 // DELETE /api/documentos/:id → eliminar documento y archivo asociado
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 1) Obtener URL de archivo desde BD
    const [[doc]] = await pool.query(
      `SELECT archivo_url FROM documentos WHERE id = ?`,
      [id]
    );
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    // 2) Extraer ruta de sistema de la URL pública
    let filePath;
    try {
      const url = new URL(doc.archivo_url);
      filePath = path.join(uploadDir, path.basename(url.pathname));
    } catch (e) {
      console.error('URL inválida:', doc.archivo_url);
    }

    // 3) Eliminar del sistema de archivos (si existe)
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 4) Eliminar registro de BD
    await pool.query(`DELETE FROM documentos WHERE id = ?`, [id]);

    res.json({ message: 'Documento eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar documento:', err);
    res.status(500).json({ error: 'Error interno al eliminar documento' });
  }
});


  module.exports = router;
