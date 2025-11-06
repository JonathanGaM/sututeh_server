// consultas/dashboard.js
const express = require('express');
const router = express.Router();
const pool = require('../bd');

/**
 * =============================================================================
 * ENDPOINTS PARA DASHBOARD ADMINISTRATIVO
 * =============================================================================
 */

/**
 * GET /api/dashboard/participacion-mensual
 * Calcula el porcentaje de participación mensual en actividades sindicales
 * Query params: año (opcional, default: año actual)
 */
router.get('/participacion-mensual', async (req, res) => {
  try {
    const año = req.query.año || new Date().getFullYear();
    
    await pool.execute("SET time_zone = '-06:00'");

    // Obtener total de agremiados activos
    const [[{ totalAgremiados }]] = await pool.query(`
      SELECT COUNT(*) as totalAgremiados
      FROM autenticacion_usuarios
      WHERE estatus = 'Activo' AND registro_completado = 1
    `);

    if (totalAgremiados === 0) {
      return res.json({
        success: true,
        data: Array.from({ length: 12 }, (_, i) => ({
          mes: i + 1,
          nombre_mes: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][i],
          porcentaje: 0,
          total_actividades: 0,
          participaciones_unicas: 0
        }))
      });
    }

    // Calcular participación por mes
    const [participacionMensual] = await pool.query(`
      SELECT 
        mes,
        COUNT(DISTINCT usuario_id) as participaciones_unicas,
        COUNT(*) as total_participaciones,
        ROUND((COUNT(DISTINCT usuario_id) / ?) * 100, 2) as porcentaje
      FROM (
        -- Participaciones en reuniones
        SELECT 
          MONTH(r.date) as mes,
          a.usuario_id
        FROM asistencia a
        JOIN reuniones r ON a.reunion_id = r.id
        WHERE YEAR(r.date) = ?
          AND a.estado_asistencia IN ('asistencia_completa', 'retardo')
        
        UNION ALL
        
        -- Participaciones en encuestas/votaciones
        SELECT 
          MONTH(ev.publication_date) as mes,
          re.user_id as usuario_id
        FROM respuestas_encuesta re
        JOIN encuestas_votaciones ev ON re.encuesta_id = ev.id
        WHERE YEAR(ev.publication_date) = ?
        
        UNION ALL
        
        -- Participaciones en rifas (compra de boletos)
        -- Si tienes tabla de boletos_rifa, agrégala aquí
        SELECT 
          MONTH(r.fecha) as mes,
          NULL as usuario_id  -- Ajustar cuando tengas tabla de participantes
        FROM rifas r
        WHERE YEAR(r.fecha) = ?
          AND 0 = 1  -- Temporalmente deshabilitado hasta tener tabla de participantes
      ) AS participaciones
      GROUP BY mes
      ORDER BY mes
    `, [totalAgremiados, año, año, año]);

    // Crear array completo de 12 meses (rellenar meses sin datos con 0)
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    const resultado = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const data = participacionMensual.find(p => p.mes === mes);
      
      return {
        mes: mes,
        nombre_mes: mesesNombres[i],
        porcentaje: data ? parseFloat(data.porcentaje) : 0,
        participaciones_unicas: data ? data.participaciones_unicas : 0,
        total_participaciones: data ? data.total_participaciones : 0
      };
    });

    res.json({
      success: true,
      año: parseInt(año),
      total_agremiados: totalAgremiados,
      data: resultado
    });

  } catch (error) {
    console.error('Error en /dashboard/participacion-mensual:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al calcular participación mensual'
    });
  }
});

/**
 * GET /api/dashboard/actividades-recientes
 * Lista de actividades recientes del sindicato con filtros
 * Query params: año, mes, limite (default: 20)
 */
router.get('/actividades-recientes', async (req, res) => {
  try {
    const año = req.query.año || new Date().getFullYear();
    const mes = req.query.mes || null;
    const limite = parseInt(req.query.limite) || 20;

    await pool.execute("SET time_zone = '-06:00'");

    // Construir condiciones de filtro usando nombres de columnas reales
    const condicionMesReuniones = mes ? `AND MONTH(r.date) = ${parseInt(mes)}` : '';
    const condicionMesEncuestas = mes ? `AND MONTH(ev.publication_date) = ${parseInt(mes)}` : '';
    const condicionMesRifas = mes ? `AND MONTH(r.fecha) = ${parseInt(mes)}` : '';
    const condicionMesPreguntas = mes ? `AND MONTH(m.creado_en) = ${parseInt(mes)}` : '';

    const [actividades] = await pool.query(`
      SELECT * FROM (
        -- Reuniones
        SELECT 
          CONCAT('REU-', r.id) COLLATE utf8mb4_unicode_ci as id,
          'reunion' COLLATE utf8mb4_unicode_ci as tipo,
          'Comité Ejecutivo' COLLATE utf8mb4_unicode_ci as responsable,
          CAST(r.title AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as actividad,
          CASE
            WHEN NOW() < DATE_SUB(CONCAT(r.date, ' ', r.time), INTERVAL 10 MINUTE) THEN 'Programada'
            WHEN NOW() > DATE_ADD(CONCAT(r.date, ' ', r.time), INTERVAL 60 MINUTE) THEN 'Terminada'
            ELSE 'En Curso'
          END COLLATE utf8mb4_unicode_ci as estado,
          r.date as fecha_actividad,
          DATE_FORMAT(r.date, '%d/%m/%Y') as fecha_formato
        FROM reuniones r
        WHERE YEAR(r.date) = ? ${condicionMesReuniones}
        
        UNION ALL
        
        -- Encuestas/Votaciones
        SELECT 
          CONCAT('ENC-', ev.id) COLLATE utf8mb4_unicode_ci as id,
          LOWER(ev.type) COLLATE utf8mb4_unicode_ci as tipo,
          'Secretaría General' COLLATE utf8mb4_unicode_ci as responsable,
          CAST(ev.title AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as actividad,
          CASE
            WHEN CONCAT(ev.publication_date, ' ', ev.publication_time) > NOW() THEN 'Programado'
            WHEN CONCAT(ev.close_date, ' ', ev.close_time) < NOW() THEN 'Cerrado'
            ELSE 'Activo'
          END COLLATE utf8mb4_unicode_ci as estado,
          ev.publication_date as fecha_actividad,
          DATE_FORMAT(ev.publication_date, '%d/%m/%Y') as fecha_formato
        FROM encuestas_votaciones ev
        WHERE YEAR(ev.publication_date) = ? ${condicionMesEncuestas}
        
        UNION ALL
        
        -- Rifas
        SELECT 
          CONCAT('RIF-', r.id) COLLATE utf8mb4_unicode_ci as id,
          'rifa' COLLATE utf8mb4_unicode_ci as tipo,
          'Comité Social' COLLATE utf8mb4_unicode_ci as responsable,
          CAST(r.titulo AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as actividad,
          CASE
            WHEN r.fecha_publicacion > NOW() THEN 'Programada'
            WHEN r.fecha_cierre < NOW() THEN 'Cerrada'
            ELSE 'En Proceso'
          END COLLATE utf8mb4_unicode_ci as estado,
          r.fecha as fecha_actividad,
          DATE_FORMAT(r.fecha, '%d/%m/%Y') as fecha_formato
        FROM rifas r
        WHERE YEAR(r.fecha) = ? ${condicionMesRifas}
        
        UNION ALL
        
        -- Preguntas
        SELECT 
          CONCAT('PRE-', m.id) COLLATE utf8mb4_unicode_ci as id,
          'pregunta' COLLATE utf8mb4_unicode_ci as tipo,
          CAST(CONCAT(m.nombre, ' ', m.apellido_paterno) AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as responsable,
          CAST(LEFT(m.mensaje, 50) AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as actividad,
          CAST(m.estado AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as estado,
          DATE(m.creado_en) as fecha_actividad,
          DATE_FORMAT(m.creado_en, '%d/%m/%Y') as fecha_formato
        FROM mensajes_contacto m
        WHERE YEAR(m.creado_en) = ? ${condicionMesPreguntas}
      ) AS todas_actividades
      ORDER BY fecha_actividad DESC
      LIMIT ?
    `, [año, año, año, año, limite]);

    res.json({
      success: true,
      año: parseInt(año),
      mes: mes ? parseInt(mes) : null,
      total: actividades.length,
      data: actividades
    });

  } catch (error) {
    console.error('Error en /dashboard/actividades-recientes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al obtener actividades recientes'
    });
  }
});

/**
 * GET /api/dashboard/estado-actividades
 * Estado consolidado de todas las actividades por año
 * Query params: año (opcional, default: año actual)
 */
router.get('/estado-actividades', async (req, res) => {
  try {
    const año = req.query.año || new Date().getFullYear();

    await pool.execute("SET time_zone = '-06:00'");

    // Reuniones
    const [[reuniones]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN NOW() > DATE_ADD(CONCAT(date, ' ', time), INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) as completadas
      FROM reuniones
      WHERE YEAR(date) = ?
    `, [año]);

    // Encuestas
    const [[encuestas]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN CONCAT(close_date, ' ', close_time) < NOW() THEN 1 ELSE 0 END) as completadas
      FROM encuestas_votaciones
      WHERE type = 'Encuesta' AND YEAR(publication_date) = ?
    `, [año]);

    // Votaciones - calcular activas dinámicamente
    const [[votaciones]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE 
          WHEN CONCAT(publication_date, ' ', publication_time) <= NOW() 
           AND CONCAT(close_date, ' ', close_time) > NOW() 
          THEN 1 ELSE 0 
        END) as activas
      FROM encuestas_votaciones
      WHERE type = 'Votación' AND YEAR(publication_date) = ?
    `, [año]);

    // Rifas
    const [[rifas]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN fecha_cierre < NOW() THEN 1 ELSE 0 END) as completadas
      FROM rifas
      WHERE YEAR(fecha) = ?
    `, [año]);

    // Preguntas
    const [[preguntas]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado = 'respondido' THEN 1 ELSE 0 END) as respondidas
      FROM mensajes_contacto
      WHERE YEAR(creado_en) = ?
    `, [año]);

    const resultado = [
      {
        nombre: 'Reuniones Ordinarias',
        completadas: reuniones.completadas || 0,
        total: reuniones.total || 0,
        color: '#2196f3'
      },
      {
        nombre: 'Encuestas Sindicales',
        completadas: encuestas.completadas || 0,
        total: encuestas.total || 0,
        color: '#4caf50'
      },
      {
        nombre: 'Votaciones Activas',
        completadas: votaciones.activas || 0,
        total: votaciones.total || 0,
        color: '#ff9800'
      },
      {
        nombre: 'Rifas Benéficas',
        completadas: rifas.completadas || 0,
        total: rifas.total || 0,
        color: '#9c27b0'
      },
      {
        nombre: 'Preguntas Respondidas',
        completadas: preguntas.respondidas || 0,
        total: preguntas.total || 0,
        color: '#f44336'
      }
    ];

    res.json({
      success: true,
      año: parseInt(año),
      data: resultado
    });

  } catch (error) {
    console.error('Error en /dashboard/estado-actividades:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al obtener estado de actividades'
    });
  }
});

/**
 * GET /api/dashboard/estadisticas-generales
 * Estadísticas consolidadas para las 5 cards del dashboard
 * Sin filtros de año - siempre datos actuales/activos
 */
router.get('/estadisticas-generales', async (req, res) => {
  try {
    await pool.execute("SET time_zone = '-06:00'");

    // Total agremiados activos
    const [[{ totalAgremiados }]] = await pool.query(`
      SELECT COUNT(*) as totalAgremiados
      FROM autenticacion_usuarios
      WHERE estatus = 'Activo' AND registro_completado = 1
    `);

    // Reuniones activas (Programadas o En Curso)
    const [[{ reunionesActivas }]] = await pool.query(`
      SELECT COUNT(*) as reunionesActivas
      FROM reuniones
      WHERE CASE
        WHEN NOW() < DATE_SUB(CONCAT(date, ' ', time), INTERVAL 10 MINUTE) THEN 'Programada'
        WHEN NOW() BETWEEN DATE_SUB(CONCAT(date, ' ', time), INTERVAL 10 MINUTE) 
                       AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 60 MINUTE) THEN 'En_Curso'
        ELSE 'Terminada'
      END IN ('Programada', 'En_Curso')
    `);

    // Encuestas activas
    const [[{ encuestasActivas }]] = await pool.query(`
      SELECT COUNT(*) as encuestasActivas
      FROM encuestas_votaciones
      WHERE type = 'Encuesta'
        AND CONCAT(publication_date, ' ', publication_time) <= NOW()
        AND CONCAT(close_date, ' ', close_time) > NOW()
    `);

    // Votaciones activas
    const [[{ votacionesActivas }]] = await pool.query(`
      SELECT COUNT(*) as votacionesActivas
      FROM encuestas_votaciones
      WHERE type = 'Votación'
        AND CONCAT(publication_date, ' ', publication_time) <= NOW()
        AND CONCAT(close_date, ' ', close_time) > NOW()
    `);

    // Preguntas pendientes
    const [[{ preguntasPendientes }]] = await pool.query(`
      SELECT COUNT(*) as preguntasPendientes
      FROM mensajes_contacto
      WHERE estado = 'pendiente'
    `);

    res.json({
      success: true,
      data: {
        totalAgremiados: totalAgremiados || 0,
        reunionesActivas: reunionesActivas || 0,
        encuestasActivas: encuestasActivas || 0,
        votacionesActivas: votacionesActivas || 0,
        preguntasPendientes: preguntasPendientes || 0
      }
    });

  } catch (error) {
    console.error('Error en /dashboard/estadisticas-generales:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al obtener estadísticas generales'
    });
  }
});

/**
 * GET /api/dashboard/exportar-csv
 * Exporta datos del dashboard a CSV
 * Query params: tipo (participacion|actividades|estado), año, mes
 */
router.get('/exportar-csv', async (req, res) => {
  try {
    const tipo = req.query.tipo || 'participacion';
    const año = req.query.año || new Date().getFullYear();
    const mes = req.query.mes || null;

    await pool.execute("SET time_zone = '-06:00'");

    let csvContent = '';
    let filename = '';

    switch (tipo) {
      case 'participacion':
        // Exportar participación mensual
        const [participacion] = await pool.query(`
          SELECT 
            mes,
            COUNT(DISTINCT usuario_id) as participaciones_unicas,
            COUNT(*) as total_participaciones
          FROM (
            SELECT MONTH(r.date) as mes, a.usuario_id
            FROM asistencia a
            JOIN reuniones r ON a.reunion_id = r.id
            WHERE YEAR(r.date) = ? AND a.estado_asistencia IN ('asistencia_completa', 'retardo')
            UNION ALL
            SELECT MONTH(ev.publication_date) as mes, re.user_id as usuario_id
            FROM respuestas_encuesta re
            JOIN encuestas_votaciones ev ON re.encuesta_id = ev.id
            WHERE YEAR(ev.publication_date) = ?
          ) AS participaciones
          GROUP BY mes
          ORDER BY mes
        `, [año, año]);

        const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                              'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        csvContent = 'Mes,Usuarios Únicos,Total Participaciones\n';
        for (let i = 1; i <= 12; i++) {
          const data = participacion.find(p => p.mes === i);
          csvContent += `${mesesNombres[i-1]},${data ? data.participaciones_unicas : 0},${data ? data.total_participaciones : 0}\n`;
        }
        filename = `participacion_mensual_${año}.csv`;
        break;

      case 'actividades':
        // Exportar actividades recientes
        const condicionMes = mes ? `AND MONTH(fecha_actividad) = ${parseInt(mes)}` : '';
        
        const [actividades] = await pool.query(`
          SELECT * FROM (
            SELECT 
              CONCAT('REU-', r.id) COLLATE utf8mb4_unicode_ci as id,
              'Reunión' COLLATE utf8mb4_unicode_ci as tipo,
              'Comité Ejecutivo' COLLATE utf8mb4_unicode_ci as responsable,
              CAST(r.title AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as actividad,
              CASE
                WHEN NOW() < DATE_SUB(CONCAT(r.date, ' ', r.time), INTERVAL 10 MINUTE) THEN 'Programada'
                WHEN NOW() > DATE_ADD(CONCAT(r.date, ' ', r.time), INTERVAL 60 MINUTE) THEN 'Terminada'
                ELSE 'En Curso'
              END COLLATE utf8mb4_unicode_ci as estado,
              r.date as fecha_actividad,
              DATE_FORMAT(r.date, '%d/%m/%Y') as fecha_formato
            FROM reuniones r
            WHERE YEAR(r.date) = ?
            UNION ALL
            SELECT 
              CONCAT('ENC-', ev.id) COLLATE utf8mb4_unicode_ci as id,
              CONCAT(UPPER(SUBSTRING(ev.type,1,1)), LOWER(SUBSTRING(ev.type,2))) COLLATE utf8mb4_unicode_ci as tipo,
              'Secretaría General' COLLATE utf8mb4_unicode_ci as responsable,
              CAST(ev.title AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as actividad,
              CASE
                WHEN CONCAT(ev.publication_date, ' ', ev.publication_time) > NOW() THEN 'Programado'
                WHEN CONCAT(ev.close_date, ' ', ev.close_time) < NOW() THEN 'Cerrado'
                ELSE 'Activo'
              END COLLATE utf8mb4_unicode_ci as estado,
              ev.publication_date as fecha_actividad,
              DATE_FORMAT(ev.publication_date, '%d/%m/%Y') as fecha_formato
            FROM encuestas_votaciones ev
            WHERE YEAR(ev.publication_date) = ?
            UNION ALL
            SELECT 
              CONCAT('RIF-', r.id) COLLATE utf8mb4_unicode_ci as id,
              'Rifa' COLLATE utf8mb4_unicode_ci as tipo,
              'Comité Social' COLLATE utf8mb4_unicode_ci as responsable,
              CAST(r.titulo AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci as actividad,
              CASE
                WHEN r.fecha_publicacion > NOW() THEN 'Programada'
                WHEN r.fecha_cierre < NOW() THEN 'Cerrada'
                ELSE 'En Proceso'
              END COLLATE utf8mb4_unicode_ci as estado,
              r.fecha as fecha_actividad,
              DATE_FORMAT(r.fecha, '%d/%m/%Y') as fecha_formato
            FROM rifas r
            WHERE YEAR(r.fecha) = ?
          ) AS todas_actividades
          WHERE 1=1 ${condicionMes}
          ORDER BY fecha_actividad DESC
        `, [año, año, año]);

        csvContent = 'ID,Tipo,Responsable,Actividad,Estado,Fecha\n';
        actividades.forEach(act => {
          // Escapar comillas dobles y comas en el contenido
          const actividad = `"${act.actividad.replace(/"/g, '""')}"`;
          csvContent += `${act.id},${act.tipo},${act.responsable},${actividad},${act.estado},${act.fecha_formato}\n`;
        });
        filename = mes ? `actividades_${año}_mes_${mes}.csv` : `actividades_${año}.csv`;
        break;

      case 'estado':
        // Exportar estado de actividades
        const [[reuniones]] = await pool.query(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN NOW() > DATE_ADD(CONCAT(date, ' ', time), INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) as completadas
          FROM reuniones WHERE YEAR(date) = ?
        `, [año]);

        const [[encuestas]] = await pool.query(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN CONCAT(close_date, ' ', close_time) < NOW() THEN 1 ELSE 0 END) as completadas
          FROM encuestas_votaciones WHERE type = 'Encuesta' AND YEAR(publication_date) = ?
        `, [año]);

        const [[votaciones]] = await pool.query(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN CONCAT(publication_date, ' ', publication_time) <= NOW() 
              AND CONCAT(close_date, ' ', close_time) > NOW() THEN 1 ELSE 0 END) as activas
          FROM encuestas_votaciones WHERE type = 'Votación' AND YEAR(publication_date) = ?
        `, [año]);

        const [[rifas]] = await pool.query(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN fecha_cierre < NOW() THEN 1 ELSE 0 END) as completadas
          FROM rifas WHERE YEAR(fecha) = ?
        `, [año]);

        const [[preguntas]] = await pool.query(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN estado = 'respondido' THEN 1 ELSE 0 END) as respondidas
          FROM mensajes_contacto WHERE YEAR(creado_en) = ?
        `, [año]);

        csvContent = 'Actividad,Completadas,Total,Porcentaje\n';
        csvContent += `Reuniones Ordinarias,${reuniones.completadas || 0},${reuniones.total || 0},${reuniones.total > 0 ? ((reuniones.completadas / reuniones.total) * 100).toFixed(1) : 0}%\n`;
        csvContent += `Encuestas Sindicales,${encuestas.completadas || 0},${encuestas.total || 0},${encuestas.total > 0 ? ((encuestas.completadas / encuestas.total) * 100).toFixed(1) : 0}%\n`;
        csvContent += `Votaciones Activas,${votaciones.activas || 0},${votaciones.total || 0},${votaciones.total > 0 ? ((votaciones.activas / votaciones.total) * 100).toFixed(1) : 0}%\n`;
        csvContent += `Rifas Benéficas,${rifas.completadas || 0},${rifas.total || 0},${rifas.total > 0 ? ((rifas.completadas / rifas.total) * 100).toFixed(1) : 0}%\n`;
        csvContent += `Preguntas Respondidas,${preguntas.respondidas || 0},${preguntas.total || 0},${preguntas.total > 0 ? ((preguntas.respondidas / preguntas.total) * 100).toFixed(1) : 0}%\n`;
        filename = `estado_actividades_${año}.csv`;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Tipo de reporte no válido. Usa: participacion, actividades o estado'
        });
    }

    // Configurar headers para descarga de archivo
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    // Agregar BOM para UTF-8 (para que Excel abra correctamente los acentos)
    res.send('\ufeff' + csvContent);

  } catch (error) {
    console.error('Error en /dashboard/exportar-csv:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al exportar CSV'
    });
  }
});

module.exports = router;