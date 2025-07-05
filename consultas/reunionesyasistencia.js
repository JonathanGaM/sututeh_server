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

// Función para detectar si necesitamos conversión de zona horaria
let needsTimezoneConversion = null;

const detectTimezoneNeed = async () => {
  if (needsTimezoneConversion !== null) {
    return needsTimezoneConversion;
  }
  
  try {
    // Comparamos la hora del sistema con la hora de la base de datos
    const [rows] = await pool.query(`
      SELECT 
        NOW() as db_time,
        CONVERT_TZ(NOW(), '+00:00', '-06:00') as mexico_time,
        UTC_TIMESTAMP() as utc_time
    `);
    
    const dbTime = new Date(rows[0].db_time);
    const mexicoTime = new Date(rows[0].mexico_time);
    const utcTime = new Date(rows[0].utc_time);
    
    // Si la diferencia entre NOW() y UTC_TIMESTAMP es 0, la DB está en UTC
    const timeDiffHours = Math.abs(dbTime.getTime() - utcTime.getTime()) / (1000 * 60 * 60);
    
    // Si la diferencia es menos de 1 hora, asumimos que la DB está en UTC
    needsTimezoneConversion = timeDiffHours < 1;
    
    console.log(`🕐 Detección de zona horaria:`);
    console.log(`   DB Time: ${dbTime}`);
    console.log(`   UTC Time: ${utcTime}`);
    console.log(`   Diferencia: ${timeDiffHours} horas`);
    console.log(`   Necesita conversión: ${needsTimezoneConversion}`);
    
    return needsTimezoneConversion;
  } catch (error) {
    console.error('Error detectando zona horaria:', error);
    // Por defecto, no aplicar conversión (modo local)
    needsTimezoneConversion = false;
    return false;
  }
};

// Función helper para obtener NOW() con la zona horaria correcta
const getCurrentTime = async () => {
  const needsConversion = await detectTimezoneNeed();
  return needsConversion 
    ? `CONVERT_TZ(NOW(), '+00:00', '-06:00')`
    : `NOW()`;
};

// POST /api/reuniones
router.post('/', async (req, res) => {
  try {
    const { title, date, time, type, location, description } = req.body;
    const currentTime = await getCurrentTime();
    
    // 1) Inserta
    const [result] = await pool.query(
      `INSERT INTO reuniones 
         (title, date, time, type, location, description, created_at, updated_at)
       VALUES (?,?,?,?,?,?, ${currentTime}, ${currentTime})`,
      [title, date, time, type, location, description]
    );
    const newId = result.insertId;
    
    // 2) Lee de vuelta el registro completo con status calculado
    const [rows] = await pool.query(
      `SELECT 
         id, title, date, time, type, location, description, created_at, updated_at,
         CASE
           WHEN CONCAT(date, ' ', time) > ${currentTime} THEN 'Programada'
           WHEN ${currentTime} BETWEEN CONCAT(date, ' ', time)
                         AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 1 HOUR)
             THEN 'En Curso'
           ELSE 'Terminada'
         END AS status
       FROM reuniones
       WHERE id = ?`,
      [newId]
    );
    
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
    const currentTime = await getCurrentTime();
    
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         created_at,
         updated_at,
         CASE
           WHEN CONCAT(date, ' ', time) > ${currentTime} THEN 'Programada'
           WHEN ${currentTime} BETWEEN CONCAT(date, ' ', time)
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
    const currentTime = await getCurrentTime();
    
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         created_at,
         updated_at,
         CASE
           WHEN CONCAT(date, ' ', time) > ${currentTime} THEN 'Programada'
           WHEN ${currentTime} BETWEEN CONCAT(date, ' ', time)
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
    const currentTime = await getCurrentTime();
    
    // 1) Actualiza el registro
    await pool.query(
      `UPDATE reuniones
         SET title       = ?,
             date        = ?,
             time        = ?,
             type        = ?,
             location    = ?,
             description = ?,
             updated_at  = ${currentTime}
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
         created_at,
         updated_at,
         CASE
           WHEN CONCAT(date, ' ', time) > ${currentTime} THEN 'Programada'
           WHEN ${currentTime} BETWEEN CONCAT(date, ' ', time)
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
  } catch (err) {
    console.error('Error al actualizar reunión:', err);
    res.status(500).json({ error: 'Error interno al actualizar la reunión.' });
  }
});

router.post(
  '/:id/asistencia',
    refreshSession,
    requireAuth,
  async (req, res) => {
    const reunionId = req.params.id;
    const usuarioId = req.user.sub;

    try {
      const currentTime = await getCurrentTime();
      
      await pool.query(
        `INSERT INTO asistencia (reunion_id, usuario_id, registered_at)
           VALUES (?, ?, ${currentTime})
         ON DUPLICATE KEY UPDATE registered_at = ${currentTime}`,
        [reunionId, usuarioId]
      );
      res.json({ message: 'Asistencia registrada' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'No pude registrar asistencia' });
    }
  }
);

// GET /api/reuniones/:id/asistentes
router.get(
  '/:id/asistentes',
  async (req, res) => {
    const reunionId = req.params.id;

    try {
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

// GET /api/reuniones/:id/faltantes
router.get(
  '/:id/faltantes',
  async (req, res) => {
    const reunionId = req.params.id;

    try {
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
 */
router.get(
  '/usuario/asistencia',
  refreshSession,
  requireAuth,
  async (req, res) => {
    const usuarioId = req.user.sub;

    try {
      const currentTime = await getCurrentTime();
      
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
            WHEN CONCAT(r.date, ' ', r.time) > ${currentTime} THEN 'Programada'
            WHEN ${currentTime} BETWEEN CONCAT(r.date, ' ', r.time)
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

      res.json(rows);
    } catch (err) {
      console.error('Error al obtener reuniones con asistencia:', err);
      res.status(500).json({ error: 'Error interno al obtener reuniones.' });
    }
  }
);

/**
 * DELETE /api/reuniones/:id
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