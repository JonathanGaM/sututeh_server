// server/consultas/gestion_puestos.js

const express = require('express');
const router = express.Router();
const pool = require('../bd');

/**
 * POST /api/puestos
 * Crea un nuevo puesto en la tabla `puestos_sindicato`
 * Body esperado: { nombre: string, responsabilidad: string }
 * (Deja usuario_id = NULL por defecto)
 */
router.post('/', async (req, res) => {
  const { nombre, responsabilidad } = req.body;

  if (!nombre || !responsabilidad) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO puestos_sindicato (nombre, responsabilidad, usuario_id)
       VALUES (?, ?, NULL)`,
      [nombre, responsabilidad]
    );

    return res.status(201).json({
      id: result.insertId,
      nombre,
      responsabilidad,
      usuario_id: null
    });
  } catch (err) {
    console.error('Error al crear puesto:', err);
    return res.status(500).json({ error: 'Error en la base de datos.' });
  }
});

// --------------------------------------------------
// GET /api/puestos
// Devuelve la lista completa de puestos_sindicato,
// incluyendo, si existe, el usuario asignado a cada puesto.
// --------------------------------------------------

/**
 * GET /api/puestos
 * Devuelve lista de puestos + datos del usuario asignado (si existe)
 */
router.get('/', async (req, res) => {
  try {
    // Hacemos LEFT JOIN con perfil_usuarios para traer datos del usuario asignado (si hay).
    const [rows] = await pool.query(`
      SELECT
        ps.id                    AS puesto_id,
        ps.nombre                AS puesto_nombre,
        ps.responsabilidad       AS puesto_responsabilidad,
        ps.usuario_id            AS usuario_id,
        u.nombre                 AS usuario_nombre,
        u.apellido_paterno       AS usuario_apellido_paterno,
        u.apellido_materno       AS usuario_apellido_materno,
        u.url_foto               AS usuario_url_foto
      FROM puestos_sindicato ps
      LEFT JOIN perfil_usuarios u
        ON ps.usuario_id = u.id
    `);

    return res.json(rows);
  } catch (err) {
    console.error('Error al listar todos los puestos:', err);
    return res.status(500).json({ error: 'Error en la base de datos.' });
  }
});

/**
 * GET /api/puestos/usuario/:usuario_id
 * Devuelve el puesto en el que está asignado cierto usuario.
 */
router.get('/usuario/:usuario_id', async (req, res) => {
  const { usuario_id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        ps.id                    AS puesto_id,
        ps.nombre                AS puesto_nombre,
        ps.responsabilidad       AS puesto_responsabilidad,
        u.nombre                 AS usuario_nombre,
        u.apellido_paterno       AS usuario_apellido_paterno,
        u.apellido_materno       AS usuario_apellido_materno,
        u.url_foto               AS usuario_url_foto
      FROM puestos_sindicato ps
      JOIN perfil_usuarios u
        ON ps.usuario_id = u.id
      WHERE ps.usuario_id = ?
      `,
      [usuario_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No se encontraron puestos para ese usuario.' });
    }

    return res.json(rows);
  } catch (err) {
    console.error('Error al consultar puestos por usuario:', err);
    return res.status(500).json({ error: 'Error en la base de datos.' });
  }
});

/**
 * PUT /api/puestos/:id
 * Actualiza los datos de un puesto en la tabla `puestos_sindicato`.
 * Body esperado: { nombre?: string, responsabilidad?: string, usuario_id?: number|null }
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, responsabilidad, usuario_id } = req.body;

  if (nombre === undefined && responsabilidad === undefined && usuario_id === undefined) {
    return res.status(400).json({ error: 'Debes enviar al menos un campo para actualizar.' });
  }

  const campos = [];
  const valores = [];

  if (nombre !== undefined) {
    campos.push('nombre = ?');
    valores.push(nombre);
  }
  if (responsabilidad !== undefined) {
    campos.push('responsabilidad = ?');
    valores.push(responsabilidad);
  }
  if (usuario_id !== undefined) {
    campos.push('usuario_id = ?');
    valores.push(usuario_id);
  }

  valores.push(id);

  const sql = `
    UPDATE puestos_sindicato
    SET ${campos.join(', ')}
    WHERE id = ?
  `;

  try {
    const [result] = await pool.query(sql, valores);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Puesto no encontrado.' });
    }

    // Devolvemos el registro actualizado con datos de usuario si existe
    const [rows] = await pool.query(
      `
      SELECT
        ps.id                    AS puesto_id,
        ps.nombre                AS puesto_nombre,
        ps.responsabilidad       AS puesto_responsabilidad,
        ps.usuario_id            AS usuario_id,
        u.nombre                 AS usuario_nombre,
        u.apellido_paterno       AS usuario_apellido_paterno,
        u.apellido_materno       AS usuario_apellido_materno,
        u.url_foto               AS usuario_url_foto
      FROM puestos_sindicato ps
      LEFT JOIN perfil_usuarios u
        ON ps.usuario_id = u.id
      WHERE ps.id = ?
      `,
      [id]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error('Error al actualizar puesto:', err);
    return res.status(500).json({ error: 'Error de base de datos.' });
  }
});

/**
 * DELETE /api/puestos/:id
 * Elimina un puesto de la tabla `puestos_sindicato` según su ID.
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'DELETE FROM puestos_sindicato WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Puesto no encontrado.' });
    }

    return res.status(200).json({ message: 'Puesto eliminado correctamente.' });
  } catch (err) {
    console.error('Error al eliminar puesto:', err);
    return res.status(500).json({ error: 'Error de base de datos.' });
  }
});

/**
 * GET /api/puestos/libres
 * Devuelve todos los usuarios que NO están asignados a ningún puesto.
 */
router.get('/libres', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        u.id,
        u.nombre,
        u.apellido_paterno,
        u.apellido_materno,
        u.url_foto
      FROM perfil_usuarios u
      WHERE u.id NOT IN (
        SELECT usuario_id
        FROM puestos_sindicato
        WHERE usuario_id IS NOT NULL
      )
    `);

    return res.json(rows);
  } catch (err) {
    console.error('Error al obtener usuarios libres:', err);
    return res.status(500).json({ error: 'Error en la base de datos.' });
  }
});


/**
 * GET /api/puestos/estadisticas/agremiados
 * Devuelve el total de agremiados activos
 */
router.get('/estadisticas/agremiados', async (req, res) => {
  try {
    const [[{ total_agremiados }]] = await pool.query(`
      SELECT COUNT(*) as total_agremiados 
      FROM autenticacion_usuarios 
      WHERE estatus = 'Activo'
    `);

    return res.json({ 
      total_agremiados: total_agremiados || 0,
      message: 'Total de agremiados activos obtenido correctamente'
    });
  } catch (err) {
    console.error('Error al obtener total de agremiados:', err);
    return res.status(500).json({ error: 'Error en la base de datos.' });
  }
});
module.exports = router;
