// consultas/reunionesyasistencia.js
const express = require('express');
const router  = express.Router();
const pool    = require('../bd');  // tu pool.promise()
const refreshSession = require('../config/refreshSession');

// Función helper para validar autenticación
const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.sub) {
    return res.status(401).json({ 
      error: 'Usuario no autenticado. Por favor, inicia sesión nuevamente.' 
    });
  }
  next();
};



// POST /api/reuniones
router.post('/', async (req, res) => {
  try {
    const { title, date, time, type, location, description } = req.body;
    // 1) Inserta
    const [result] = await pool.query(
      `INSERT INTO reuniones 
         (title, date, time, type, location, description)
       VALUES (?,?,?,?,?,?)`,
      [title, date, time, type, location, description]
    );
    const newId = result.insertId;
    // 2) Lee de vuelta el registro completo
    const [rows] = await pool.query(
      `SELECT id, title, date, time, type, location, description
         FROM reuniones
        WHERE id = ?`,
      [ newId ]
    );
    // 3) Devuélvelo al cliente
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No pude crear la reunión' });
  }
});
/**
 * GET /api/reuniones
 * Devuelve todas las reuniones, con un campo status calculado
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         CASE
           WHEN CONCAT(date, ' ', time) > NOW() THEN 'Programada'
           WHEN NOW() BETWEEN CONCAT(date, ' ', time)
                         AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 1 HOUR)
             THEN 'En Curso'
           ELSE 'Terminada'
         END AS status
       FROM reuniones
       ORDER BY date DESC, time DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener reuniones:', error);
    res.status(500).json({ error: 'Error interno al obtener reuniones.' });
  }
});

/**
 * GET /api/reuniones/:id
 * Devuelve una reunión específica con su status
 */
router.get('/:id', async (req, res) => {
  const meetingId = req.params.id;
  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         CASE
           WHEN CONCAT(date, ' ', time) > NOW() THEN 'Programada'
           WHEN NOW() BETWEEN CONCAT(date, ' ', time)
                         AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 1 HOUR)
             THEN 'En Curso'
           ELSE 'Terminada'
         END AS status
       FROM reuniones
       WHERE id = ?`,
      [meetingId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener reunión:', error);
    res.status(500).json({ error: 'Error interno al obtener la reunión.' });
  }
});
/**
 * PUT /api/reuniones/:id
 * Actualiza los datos de una reunión y devuelve la reunión actualizada con su status
 */
router.put('/:id', async (req, res) => {
  const meetingId = req.params.id;
  const { title, date, time, type, location, description } = req.body;

  try {
    // 1) Actualiza el registro
    await pool.query(
      `UPDATE reuniones
         SET title       = ?,
             date        = ?,
             time        = ?,
             type        = ?,
             location    = ?,
             description = ?
       WHERE id = ?`,
      [title, date, time, type, location, description, meetingId]
    );

    // 2) Vuelve a leer el registro completo, incluyendo el status calculado
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         CASE
           WHEN CONCAT(date, ' ', time) > NOW() THEN 'Programada'
           WHEN NOW() BETWEEN CONCAT(date, ' ', time)
                         AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 1 HOUR)
             THEN 'En Curso'
           ELSE 'Terminada'
         END AS status
       FROM reuniones
       WHERE id = ?`,
      [meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }

    // 3) Devuélvelo al cliente
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al actualizar reunión:', err);
    res.status(500).json({ error: 'Error interno al actualizar la reunión.' });
  }
});




router.post(
  '/:id/asistencia',
    refreshSession,                 // <— asegura que req.user.sub esté presente
    requireAuth,
  async (req, res) => {
    const reunionId = req.params.id;
    const usuarioId = req.user.sub;

    try {
      await pool.query(
        `INSERT INTO asistencia (reunion_id, usuario_id)
           VALUES (?, ?)
         ON DUPLICATE KEY UPDATE registered_at = NOW()`,
        [reunionId, usuarioId]
      );
      res.json({ message: 'Asistencia registrada' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'No pude registrar asistencia' });
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// GET /api/reuniones/:id/asistentes
// Devuelve todos los usuarios (nombre y apellidos) que asistieron a la reunión.
// ───────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id/asistentes',
  /*
    Si NO quieres que este endpoint requiera estar logueado,
    simplemente comenta o quita la siguiente línea:
  */
  /* refreshSession, */
  async (req, res) => {
    const reunionId = req.params.id;

    try {
      // --------------------------------------------------------
      // En lugar de unir a "autenticacion_usuarios" (que no tiene
      // columnas de nombre/apellidos), unimos a "perfil_usuarios".
      // Se asume que "perfil_usuarios.id" coincide con el "usuario_id".
      // --------------------------------------------------------
      const [rows] = await pool.query(
        `
        SELECT 
          pu.id,
          pu.nombre,
          pu.apellido_paterno,
          pu.apellido_materno
        FROM asistencia a
        JOIN perfil_usuarios pu
          ON a.usuario_id = pu.id
        WHERE a.reunion_id = ?
        `,
        [reunionId]
      );

      res.json(rows);
    } catch (err) {
      console.error('Error al obtener asistentes:', err);
      res.status(500).json({ error: 'Error interno al obtener asistentes.' });
    }
  }
);


// ───────────────────────────────────────────────────────────────────────────────
// GET /api/reuniones/:id/faltantes
// Devuelve todos los usuarios “activos” que NO asistieron a la reunión.
// ───────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id/faltantes',
  /*
    Si NO quieres que este endpoint requiera estar logueado,
    simplemente comenta o quita la siguiente línea:
  */
  /* refreshSession, */
  async (req, res) => {
    const reunionId = req.params.id;

    try {
      // --------------------------------------------------------
      // Seleccionamos de "perfil_usuarios" (con sus datos personales)
      // todos aquellos usuarios cuyo "estatus" en autenticacion_usuarios
      // sea 'Activo' y cuyo id NO esté en la tabla `asistencia` para
      // la reunión dada.
      // --------------------------------------------------------
      const [rows] = await pool.query(
        `
        SELECT 
          pu.id,
          pu.nombre,
          pu.apellido_paterno,
          pu.apellido_materno
        FROM perfil_usuarios pu
        JOIN autenticacion_usuarios au
          ON pu.id = au.id
        WHERE au.estatus = 'Activo'
          AND pu.id NOT IN (
            SELECT usuario_id 
            FROM asistencia 
            WHERE reunion_id = ?
          )
        `,
        [reunionId]
      );

      res.json(rows);
    } catch (err) {
      console.error('Error al obtener faltantes:', err);
      res.status(500).json({ error: 'Error interno al obtener faltantes.' });
    }
  }
);

/**
 * GET /api/reuniones/usuario/asistencia
 *
 * - Requiere refreshSession para obtener `req.user.sub` (el ID del usuario autenticado).
 * - Devuelve todas las reuniones junto con:
 *    • status:   "Programada" / "En Curso" / "Terminada" (según date+time vs NOW())  
 *    • asistio:  1 si el usuario ya está en la tabla `asistencia` para esa reunión,
 *               0 si no.
 */
router.get(
  '/usuario/asistencia',
  refreshSession, // asegura que req.user.sub exista
  requireAuth,
  async (req, res) => {
    const usuarioId = req.user.sub;

    try {
      const [rows] = await pool.query(
        `
        SELECT
          r.id,
          r.title,
          r.date,
          r.time,
          r.type,
          r.location,
          r.description,
          CASE
            WHEN CONCAT(r.date, ' ', r.time) > NOW() THEN 'Programada'
            WHEN NOW() BETWEEN CONCAT(r.date, ' ', r.time)
                          AND DATE_ADD(CONCAT(r.date, ' ', r.time), INTERVAL 1 HOUR)
              THEN 'En Curso'
            ELSE 'Terminada'
          END AS status,
          CASE
            WHEN a.usuario_id IS NOT NULL THEN 1
            ELSE 0
          END AS asistio
        FROM reuniones r
        LEFT JOIN asistencia a
          ON a.reunion_id = r.id
          AND a.usuario_id = ?
        ORDER BY r.date DESC, r.time DESC
        `,
        [usuarioId]
      );

      // rows = [
      //   { id, title, date, time, type, location, description, status, asistio },
      //   …
      // ]

      res.json(rows);
    } catch (err) {
      console.error('Error al obtener reuniones con asistencia:', err);
      res.status(500).json({ error: 'Error interno al obtener reuniones.' });
    }
  }
);
/**
 * DELETE /api/reuniones/:id
 * Elimina la reunión indicada por id y caduca automáticamente su asistencia.
 */
router.delete('/:id', async (req, res) => {
  const meetingId = req.params.id;
  try {
    const [result] = await pool.query(
      `DELETE FROM reuniones WHERE id = ?`,
      [meetingId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }
    return res.json({ message: 'Reunión eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar reunión:', err);
    return res.status(500).json({ error: 'Error interno al eliminar la reunión.' });
  }
});


module.exports = router;
