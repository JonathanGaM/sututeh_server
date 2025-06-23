// consultas/rifas.js
const express = require('express');
const router = express.Router();
const pool = require('../bd');
const multer = require('multer');
const { cloudinary, storageRifas, storageProductosRifa } = require('../cloudinaryConfig');



const uploadRifa = multer({ storage: storageRifas });
const uploadProducto = multer({ storage: storageProductosRifa });

// ========================================
// OBTENER TODAS LAS RIFAS
// ========================================
router.get('/', async (req, res) => {
  try {
    const [rifas] = await pool.execute(`
      SELECT 
        r.*,
        COUNT(pr.id) as total_productos
      FROM rifas r
      LEFT JOIN productos_rifa pr ON r.id = pr.rifa_id
      GROUP BY r.id
      ORDER BY r.fecha_creacion DESC
    `);

    // Para cada rifa, obtener sus productos
    for (let rifa of rifas) {
      const [productos] = await pool.execute(`
        SELECT id, titulo, descripcion, foto
        FROM productos_rifa 
        WHERE rifa_id = ?
        ORDER BY id ASC
      `, [rifa.id]);
      
      rifa.productos = productos;
    }

    res.json({
      success: true,
      data: rifas
    });
  } catch (error) {
    console.error('Error al obtener rifas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ========================================
// OBTENER UNA RIFA POR ID
// ========================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener datos de la rifa
    const [rifas] = await pool.execute(`
      SELECT * FROM rifas WHERE id = ?
    `, [id]);

    if (rifas.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rifa no encontrada'
      });
    }

    // Obtener productos de la rifa
    const [productos] = await pool.execute(`
      SELECT id, titulo, descripcion, foto
      FROM productos_rifa 
      WHERE rifa_id = ?
      ORDER BY id ASC
    `, [id]);

    const rifa = rifas[0];
    rifa.productos = productos;

    res.json({
      success: true,
      data: rifa
    });
  } catch (error) {
    console.error('Error al obtener rifa:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ========================================
// CREAR NUEVA RIFA
// ========================================
router.post('/', uploadRifa.single('foto_rifa'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      titulo,
      descripcion,
      fecha,
      hora,
      precio,
      ubicacion,
      boletos_disponibles,
      fecha_publicacion,
      fecha_cierre,
      productos
    } = req.body;

    // Validaciones básicas
    if (!titulo || !fecha || !hora || !precio || !boletos_disponibles) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios'
      });
    }

    // URL de la foto principal - IGUAL que en noticias
    const foto_rifa = req.file ? req.file.path : null;
    console.log('Foto de rifa URL:', foto_rifa);

    // Insertar rifa principal
    const [result] = await connection.execute(`
      INSERT INTO rifas (
        titulo, descripcion, fecha, hora, precio, ubicacion, 
        boletos_disponibles, foto_rifa, fecha_publicacion, fecha_cierre
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      titulo,
      descripcion,
      fecha,
      hora,
      precio,
      ubicacion,
      boletos_disponibles,
      foto_rifa,
      fecha_publicacion || null,
      fecha_cierre || null
    ]);

    const rifaId = result.insertId;

    // Insertar productos si existen
    let productosArray = [];
    if (productos) {
      try {
        productosArray = JSON.parse(productos);
      } catch (e) {
        console.error('Error al parsear productos:', e);
      }
    }

    if (productosArray && Array.isArray(productosArray)) {
      for (const producto of productosArray) {
        if (producto.titulo && producto.titulo.trim()) {
          await connection.execute(`
            INSERT INTO productos_rifa (rifa_id, titulo, descripcion, foto)
            VALUES (?, ?, ?, ?)
          `, [rifaId, producto.titulo, producto.descripcion || '', producto.foto || null]);
        }
      }
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Rifa creada exitosamente',
      data: { id: rifaId }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al crear rifa:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
});
// ========================================
// ACTUALIZAR RIFA
// ========================================
router.put('/:id', uploadRifa.single('foto_rifa'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      titulo,
      descripcion,
      fecha,
      hora,
      precio,
      ubicacion,
      boletos_disponibles,
      fecha_publicacion,
      fecha_cierre,
      productos
    } = req.body;

    // Verificar que la rifa existe
    const [rifaExistente] = await connection.execute(
      'SELECT * FROM rifas WHERE id = ?', [id]
    );

    if (rifaExistente.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rifa no encontrada'
      });
    }

    // Determinar URL de foto
    let foto_rifa = rifaExistente[0].foto_rifa; // Mantener la actual
    if (req.file) {
      foto_rifa = req.file.path; // Nueva foto subida
    }

    // Actualizar datos de la rifa
    await connection.execute(`
      UPDATE rifas SET 
        titulo = ?, descripcion = ?, fecha = ?, hora = ?, precio = ?,
        ubicacion = ?, boletos_disponibles = ?, foto_rifa = ?,
        fecha_publicacion = ?, fecha_cierre = ?, fecha_actualizacion = NOW()
      WHERE id = ?
    `, [
      titulo, descripcion, fecha, hora, precio, ubicacion,
      boletos_disponibles, foto_rifa, fecha_publicacion, fecha_cierre, id
    ]);

    // Eliminar productos existentes y agregar los nuevos
    await connection.execute('DELETE FROM productos_rifa WHERE rifa_id = ?', [id]);

    // Insertar productos actualizados
    if (productos && Array.isArray(productos)) {
      for (const producto of productos) {
        if (producto.titulo && producto.titulo.trim()) {
          await connection.execute(`
            INSERT INTO productos_rifa (rifa_id, titulo, descripcion, foto)
            VALUES (?, ?, ?, ?)
          `, [id, producto.titulo, producto.descripcion || '', producto.foto || null]);
        }
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Rifa actualizada exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar rifa:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
});

// ========================================
// ELIMINAR RIFA
// ========================================
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Verificar que la rifa existe
    const [rifaExistente] = await connection.execute(
      'SELECT foto_rifa FROM rifas WHERE id = ?', [id]
    );

    if (rifaExistente.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rifa no encontrada'
      });
    }

    // Obtener fotos de productos para eliminar de Cloudinary
    const [productos] = await connection.execute(
      'SELECT foto FROM productos_rifa WHERE rifa_id = ? AND foto IS NOT NULL', [id]
    );

    // Eliminar productos (CASCADE eliminará automáticamente)
    await connection.execute('DELETE FROM rifas WHERE id = ?', [id]);

    await connection.commit();

    // Eliminar fotos de Cloudinary (opcional, en background)
    try {
      // Eliminar foto principal si existe
      if (rifaExistente[0].foto_rifa) {
        const publicId = rifaExistente[0].foto_rifa.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`rifas/imagenes/${publicId}`);
      }

      // Eliminar fotos de productos
      for (const producto of productos) {
        if (producto.foto) {
          const publicId = producto.foto.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`rifas/productos/${publicId}`);
        }
      }
    } catch (cloudinaryError) {
      console.error('Error al eliminar imágenes de Cloudinary:', cloudinaryError);
      // No fallar la operación por errores de Cloudinary
    }

    res.json({
      success: true,
      message: 'Rifa eliminada exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al eliminar rifa:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    connection.release();
  }
});

// ========================================
// SUBIR FOTO DE PRODUCTO
// ========================================
// ========================================
// SUBIR FOTO DE PRODUCTO
// ========================================
// ========================================
// SUBIR FOTO DE PRODUCTO
// ========================================
router.post('/producto/foto', uploadProducto.single('foto_producto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó archivo'
      });
    }

    // IGUAL que en noticias - usar req.file.path directamente
    res.json({
      success: true,
      message: 'Foto de producto subida exitosamente',
      data: {
        url: req.file.path  // <-- Esto es lo que funciona en noticias
      }
    });
  } catch (error) {
    console.error('Error al subir foto de producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});
module.exports = router;