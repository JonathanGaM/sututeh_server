// consultas/reunionesyasistencia.js - VERSIÓN CORREGIDA
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

// Función para calcular el estado de la reunión basado en tiempos del reglamento
const getEstadoReunion = () => {
  return `
    CASE
      WHEN NOW() < DATE_SUB(CONCAT(date, ' ', time), INTERVAL 10 MINUTE) THEN 'Programada'
      WHEN NOW() BETWEEN DATE_SUB(CONCAT(date, ' ', time), INTERVAL 10 MINUTE) 
                     AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 15 MINUTE) THEN 'Registro_Abierto'
      WHEN NOW() BETWEEN DATE_ADD(CONCAT(date, ' ', time), INTERVAL 15 MINUTE)
                     AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 30 MINUTE) THEN 'Retardos_Permitidos'
      WHEN NOW() BETWEEN DATE_ADD(CONCAT(date, ' ', time), INTERVAL 30 MINUTE)
                     AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 60 MINUTE) THEN 'Falta_No_Justificada'
      ELSE 'Terminada'
    END
  `;
};

// POST /api/reuniones
router.post('/', async (req, res) => {
  try {
    const { title, date, time, type, location, description } = req.body;
    
    // Forzar zona horaria de México
    await pool.execute("SET time_zone = '-06:00'");
    
    // 1) Inserta
    const result = await pool.query(
      `INSERT INTO reuniones 
         (title, date, time, type, location, description)
       VALUES (?,?,?,?,?,?)`,
      [title, date, time, type, location, description]
    );
    
    const newId = Array.isArray(result) ? result[0].insertId : result.insertId;
    
    // 2) Lee de vuelta el registro completo con status calculado
    const rows = await pool.query(
      `SELECT 
         id, title, date, time, type, location, description,
         ${getEstadoReunion()} AS status
       FROM reuniones
       WHERE id = ?`,
      [newId]
    );
    
    const resultRow = Array.isArray(rows) ? rows[0][0] : rows[0];
    res.status(201).json(resultRow);
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
    // Forzar zona horaria de México en la consulta
    await pool.execute("SET time_zone = '-06:00'");
    
    // Cambio principal: usar pool.query en lugar de pool.execute y manejar el resultado correctamente
    const result = await pool.query(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         ${getEstadoReunion()} AS status
       FROM reuniones
       ORDER BY date DESC, time DESC`
    );
    
    // Manejar tanto el formato [rows, fields] como rows directamente
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    
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
    // Forzar zona horaria de México en la consulta
    await pool.execute("SET time_zone = '-06:00'");
    
    const result = await pool.query(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         ${getEstadoReunion()} AS status
       FROM reuniones
       WHERE id = ?`,
      [meetingId]
    );
    
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    
    if (!rows || rows.length === 0) {
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
    const result = await pool.query(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         ${getEstadoReunion()} AS status
       FROM reuniones
       WHERE id = ?`,
      [meetingId]
    );

    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error al actualizar reunión:', err);
    res.status(500).json({ error: 'Error interno al actualizar la reunión.' });
  }
});

// POST /api/reuniones/:id/asistencia - MODIFICADO
router.post(
  '/:id/asistencia',
    refreshSession,
    requireAuth,
  async (req, res) => {
    const reunionId = req.params.id;
    const usuarioId = req.user.sub;

    try {
      // Forzar zona horaria de México
      await pool.execute("SET time_zone = '-06:00'");
      
      // 1) Obtener información de la reunión y su estado actual
      const meetingResult = await pool.query(
        `SELECT 
           id, date, time,
           ${getEstadoReunion()} AS status,
           CONCAT(date, ' ', time) AS meeting_datetime
         FROM reuniones 
         WHERE id = ?`,
        [reunionId]
      );

      const meetingRows = Array.isArray(meetingResult) && Array.isArray(meetingResult[0]) ? meetingResult[0] : meetingResult;

      if (!meetingRows || meetingRows.length === 0) {
        return res.status(404).json({ error: 'Reunión no encontrada' });
      }

      const meeting = meetingRows[0];
      
      // 2) Verificar si el registro está permitido
      if (meeting.status === 'Programada' || meeting.status === 'Terminada') {
        return res.status(400).json({ 
          error: meeting.status === 'Programada' 
            ? 'La reunión aún no está disponible para registro'
            : 'La reunión ya ha terminado' 
        });
      }

      // 3) Determinar el estado de asistencia basado en el estado actual de la reunión
      let estadoAsistencia, puntaje;
      
      switch (meeting.status) {
        case 'Registro_Abierto':
          estadoAsistencia = 'asistencia_completa';
          puntaje = 3;
          break;
        case 'Retardos_Permitidos':
          estadoAsistencia = 'retardo';
          puntaje = 2;
          break;
        case 'Falta_No_Justificada':
          estadoAsistencia = 'falta_no_justificada';
          puntaje = 0;
          break;
        default:
          return res.status(400).json({ error: 'Estado de reunión no válido para registro' });
      }

      // 4) Insertar o actualizar el registro de asistencia
      await pool.query(
        `INSERT INTO asistencia (reunion_id, usuario_id, registered_at, estado_asistencia, puntaje)
           VALUES (?, ?, NOW(), ?, ?)
         ON DUPLICATE KEY UPDATE 
           registered_at = NOW(),
           estado_asistencia = VALUES(estado_asistencia),
           puntaje = VALUES(puntaje)`,
        [reunionId, usuarioId, estadoAsistencia, puntaje]
      );

      res.json({ 
        message: 'Asistencia registrada correctamente',
        estado: estadoAsistencia,
        puntaje: puntaje,
        estadoReunion: meeting.status
      });
      
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'No pude registrar asistencia' });
    }
  }
);

// GET /api/reuniones/:id/asistentes - MODIFICADO PARA ESTADÍSTICAS
router.get(
  '/:id/asistentes',
  async (req, res) => {
    const reunionId = req.params.id;

    try {
      const result = await pool.query(
        `SELECT 
          pu.id,
          pu.nombre,
          pu.apellido_paterno,
          pu.apellido_materno,
          a.estado_asistencia,
          a.puntaje,
          a.registered_at
        FROM asistencia a
        JOIN perfil_usuarios pu
          ON a.usuario_id = pu.id
        WHERE a.reunion_id = ?
        ORDER BY a.registered_at ASC`,
        [reunionId]
      );

      const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener asistentes:', err);
      res.status(500).json({ error: 'Error interno al obtener asistentes.' });
    }
  }
);

// GET /api/reuniones/:id/faltantes - MODIFICADO PARA ESTADÍSTICAS
router.get(
  '/:id/faltantes',
  async (req, res) => {
    const reunionId = req.params.id;

    try {
      const result = await pool.query(
        `SELECT 
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
          )`,
        [reunionId]
      );

      const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener faltantes:', err);
      res.status(500).json({ error: 'Error interno al obtener faltantes.' });
    }
  }
);

// GET /api/reuniones/:id/estadisticas - NUEVO ENDPOINT PARA ESTADÍSTICAS
router.get(
  '/:id/estadisticas',
  async (req, res) => {
    const reunionId = req.params.id;

    try {
      await pool.execute("SET time_zone = '-06:00'");

      // 1) Obtener información de la reunión
      const meetingResult = await pool.query(
        `SELECT 
           id, title, date, time, type, location, description,
           ${getEstadoReunion()} AS status
         FROM reuniones 
         WHERE id = ?`,
        [reunionId]
      );

      const meetingRows = Array.isArray(meetingResult) && Array.isArray(meetingResult[0]) ? meetingResult[0] : meetingResult;

      if (!meetingRows || meetingRows.length === 0) {
        return res.status(404).json({ error: 'Reunión no encontrada' });
      }

      const meeting = meetingRows[0];

      // 2) Si la reunión ya pasó de "Registro_Abierto", crear registros faltantes
      if (meeting.status === 'Retardos_Permitidos' || 
          meeting.status === 'Falta_No_Justificada' || 
          meeting.status === 'Terminada') {
        
        // Crear registros de "falta_no_justificada" para usuarios que no se registraron
        await pool.query(`
          INSERT INTO asistencia (reunion_id, usuario_id, estado_asistencia, puntaje)
          SELECT ?, pu.id, 'falta_no_justificada', 0
          FROM perfil_usuarios pu
          JOIN autenticacion_usuarios au ON pu.id = au.id
          WHERE au.estatus = 'Activo'
            AND pu.id NOT IN (
              SELECT usuario_id 
              FROM asistencia 
              WHERE reunion_id = ?
            )
        `, [reunionId, reunionId]);
      }

      // 3) Obtener todos los registros de asistencia (incluyendo los recién creados)
      const allAttendanceResult = await pool.query(
        `SELECT 
          pu.id,
          pu.nombre,
          pu.apellido_paterno,
          pu.apellido_materno,
          a.estado_asistencia,
          a.puntaje,
          a.registered_at
        FROM asistencia a
        JOIN perfil_usuarios pu ON a.usuario_id = pu.id
        WHERE a.reunion_id = ?
        ORDER BY pu.nombre, pu.apellido_paterno`,
        [reunionId]
      );

      const allAttendance = Array.isArray(allAttendanceResult) && Array.isArray(allAttendanceResult[0]) ? allAttendanceResult[0] : allAttendanceResult;

      // 4) Separar en asistieron y no asistieron
      const asistieron = allAttendance.filter(a => 
        a.estado_asistencia === 'asistencia_completa' || 
        a.estado_asistencia === 'retardo'
      );

      const noAsistieron = allAttendance.filter(a => 
        a.estado_asistencia === 'falta_justificada' || 
        a.estado_asistencia === 'falta_no_justificada'
      );

      res.json({
        meeting,
        asistieron,
        noAsistieron,
        todos: allAttendance
      });

    } catch (err) {
      console.error('Error al obtener estadísticas:', err);
      res.status(500).json({ error: 'Error interno al obtener estadísticas.' });
    }
  }
);

// PUT /api/reuniones/:reunionId/asistencia/:usuarioId - NUEVO ENDPOINT PARA CAMBIAR ESTADOS
router.put(
  '/:reunionId/asistencia/:usuarioId',
  async (req, res) => {
    const { reunionId, usuarioId } = req.params;
    const { estado_asistencia } = req.body;

    // Validar estado
    const estadosValidos = ['asistencia_completa', 'retardo', 'falta_justificada', 'falta_no_justificada'];
    if (!estadosValidos.includes(estado_asistencia)) {
      return res.status(400).json({ error: 'Estado de asistencia no válido' });
    }

    // Determinar puntaje basado en el estado
    let puntaje;
    switch (estado_asistencia) {
      case 'asistencia_completa':
        puntaje = 3;
        break;
      case 'retardo':
      case 'falta_justificada':
        puntaje = 2;
        break;
      case 'falta_no_justificada':
        puntaje = 0;
        break;
    }

    try {
      // Actualizar o insertar el registro de asistencia
      await pool.query(
        `INSERT INTO asistencia (reunion_id, usuario_id, estado_asistencia, puntaje, registered_at)
           VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           estado_asistencia = VALUES(estado_asistencia),
           puntaje = VALUES(puntaje)`,
        [reunionId, usuarioId, estado_asistencia, puntaje]
      );

      res.json({ 
        message: 'Estado de asistencia actualizado correctamente',
        estado_asistencia,
        puntaje
      });

    } catch (err) {
      console.error('Error al actualizar estado:', err);
      res.status(500).json({ error: 'Error interno al actualizar estado.' });
    }
  }
);

/**
 * GET /api/reuniones/usuario/asistencia - MODIFICADO
 */
router.get(
  '/usuario/asistencia',
  refreshSession,
  requireAuth,
  async (req, res) => {
    const usuarioId = req.user.sub;

    try {
      await pool.execute("SET time_zone = '-06:00'");
      
      const result = await pool.query(
        `SELECT
          r.id,
          r.title,
          r.date,
          r.time,
          r.type,
          r.location,
          r.description,
          ${getEstadoReunion()} AS status,
          COALESCE(a.estado_asistencia, 'falta_no_justificada') AS estado_asistencia,
          COALESCE(a.puntaje, 0) AS puntaje,
          a.registered_at
        FROM reuniones r
        LEFT JOIN asistencia a
          ON a.reunion_id = r.id
          AND a.usuario_id = ?
        ORDER BY r.date DESC, r.time DESC`,
        [usuarioId]
      );

      const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener reuniones con asistencia:', err);
      res.status(500).json({ error: 'Error interno al obtener reuniones.' });
    }
  }
);
// AGREGAR ESTE ENDPOINT en reunionesyasistencia.js

// GET /api/reuniones/estadisticas-anuales/:year
router.get(
  '/estadisticas-anuales/:year',
  async (req, res) => {
    const year = req.params.year;

    try {
      await pool.execute("SET time_zone = '-06:00'");

      // 1) Obtener todas las reuniones del año
      const reunionesResult = await pool.query(
        `SELECT 
           id, title, date, time, type
         FROM reuniones 
         WHERE YEAR(date) = ?
         ORDER BY date DESC`,
        [year]
      );

      const reuniones = Array.isArray(reunionesResult) && Array.isArray(reunionesResult[0]) ? reunionesResult[0] : reunionesResult;

      // 2) Obtener solo usuarios activos con registro completado
      const usuariosResult = await pool.query(
        `SELECT 
           pu.id,
           pu.nombre,
           pu.apellido_paterno,
           pu.apellido_materno
         FROM perfil_usuarios pu
         JOIN autenticacion_usuarios au ON pu.id = au.id
         WHERE au.estatus = 'Activo' 
           AND au.registro_completado = 1
         ORDER BY pu.nombre, pu.apellido_paterno`
      );

      const usuarios = Array.isArray(usuariosResult) && Array.isArray(usuariosResult[0]) ? usuariosResult[0] : usuariosResult;

      // 3) Calcular estadísticas para cada usuario
      const estadisticasUsuarios = await Promise.all(
        usuarios.map(async (usuario) => {
          // Obtener asistencias del usuario en el año
          const asistenciasResult = await pool.query(
            `SELECT 
               a.estado_asistencia,
               a.puntaje,
               r.date
             FROM asistencia a
             JOIN reuniones r ON a.reunion_id = r.id
             WHERE a.usuario_id = ? AND YEAR(r.date) = ?`,
            [usuario.id, year]
          );

          const asistencias = Array.isArray(asistenciasResult) && Array.isArray(asistenciasResult[0]) ? asistenciasResult[0] : asistenciasResult;

          // Calcular estadísticas
          const totalReuniones = reuniones.length;
          const puntajeMaximo = totalReuniones * 3; // 3 puntos por reunión
          const puntajeObtenido = asistencias.reduce((sum, a) => sum + (a.puntaje || 0), 0);
          const reunionesAsistidas = asistencias.filter(a => 
            a.estado_asistencia === 'asistencia_completa' || 
            a.estado_asistencia === 'retardo'
          ).length;
          
          // Aplicar la fórmula del reglamento: Σ(Puntajes) / N
          const promedioAnual = totalReuniones > 0 ? puntajeObtenido / totalReuniones : 0;
          const porcentajeAsistencia = totalReuniones > 0 ? (reunionesAsistidas / totalReuniones) * 100 : 0;

          return {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido_paterno: usuario.apellido_paterno,
            apellido_materno: usuario.apellido_materno,
            puntaje_total: puntajeObtenido,
            puntaje_maximo: puntajeMaximo,
            promedio_anual: promedioAnual.toFixed(2),
            porcentaje_asistencia: porcentajeAsistencia.toFixed(1),
            reuniones_asistidas: reunionesAsistidas,
            total_reuniones: totalReuniones
          };
        })
      );

      // 4) Calcular resumen general
      const promedioGeneral = estadisticasUsuarios.length > 0 
        ? estadisticasUsuarios.reduce((sum, u) => sum + parseFloat(u.promedio_anual), 0) / estadisticasUsuarios.length 
        : 0;

      // Clasificar usuarios por rendimiento
      const usuariosExcelente = estadisticasUsuarios.filter(u => parseFloat(u.promedio_anual) >= 2.5).length;
      const usuariosBueno = estadisticasUsuarios.filter(u => parseFloat(u.promedio_anual) >= 2.0 && parseFloat(u.promedio_anual) < 2.5).length;
      const usuariosRegular = estadisticasUsuarios.filter(u => parseFloat(u.promedio_anual) >= 1.0 && parseFloat(u.promedio_anual) < 2.0).length;
      const usuariosDeficiente = estadisticasUsuarios.filter(u => parseFloat(u.promedio_anual) < 1.0).length;

      const resumenGeneral = {
        total_reuniones: reuniones.length,
        total_usuarios: usuarios.length,
        promedio_general: promedioGeneral.toFixed(2),
        usuarios_excelente: usuariosExcelente,
        usuarios_bueno: usuariosBueno,
        usuarios_regular: usuariosRegular,
        usuarios_deficiente: usuariosDeficiente
      };

      res.json({
        usuarios: estadisticasUsuarios,
        reuniones: reuniones,
        resumenGeneral: resumenGeneral
      });

    } catch (err) {
      console.error('Error al obtener estadísticas anuales:', err);
      res.status(500).json({ error: 'Error interno al obtener estadísticas anuales.' });
    }
  }
);
/**
 * DELETE /api/reuniones/:id
 */
router.delete('/:id', async (req, res) => {
  const meetingId = req.params.id;
  try {
    const result = await pool.query(
      `DELETE FROM reuniones WHERE id = ?`,
      [meetingId]
    );
    
    const deleteResult = Array.isArray(result) ? result[0] : result;
    
    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }
    return res.json({ message: 'Reunión eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar reunión:', err);
    return res.status(500).json({ error: 'Error interno al eliminar la reunión.' });
  }
});

module.exports = router;