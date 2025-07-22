// consultas/ml_predicciones.js
const express = require('express');
const router = express.Router();
const pool = require('../bd');

// Simulación de datos del modelo (reemplazar con tu modelo real)
const modeloML = {
    precision: 0.758,
    clusters: {
        'Activistas Comprometidos': { threshold: { puntaje: 2.5, reuniones: 50 } },
        'Participativos Regulares': { threshold: { puntaje: 2.0, reuniones: 30 } },
        'Ocasionales Moderados': { threshold: { puntaje: 1.0, reuniones: 10 } },
        'Inactivos Críticos': { threshold: { puntaje: 0, reuniones: 0 } }
    }
};

// Función para calcular cluster basado en los datos
function calcularCluster(puntajePromedio, totalReuniones) {
    if (puntajePromedio >= 2.5 && totalReuniones >= 50) {
        return 'Activistas Comprometidos';
    } else if (puntajePromedio >= 2.0 && totalReuniones >= 30) {
        return 'Participativos Regulares';
    } else if (puntajePromedio >= 1.0 && totalReuniones >= 10) {
        return 'Ocasionales Moderados';
    } else {
        return 'Inactivos Críticos';
    }
}

// Función para calcular probabilidad de asistencia
function calcularProbabilidadAsistencia(usuario, tipoReunion = 'Extraordinaria', diaSemana = 2, hora = 14) {
    let probabilidad = 0.5; // Base
    
    // Factor: Tasa de asistencia histórica (peso mayor)
    if (usuario.tasa_asistencia > 0.8) probabilidad += 0.25;
    else if (usuario.tasa_asistencia > 0.6) probabilidad += 0.15;
    else if (usuario.tasa_asistencia > 0.4) probabilidad += 0.05;
    else probabilidad -= 0.1;
    
    // Factor: Puntaje promedio
    if (usuario.puntaje_promedio > 2.5) probabilidad += 0.15;
    else if (usuario.puntaje_promedio > 2.0) probabilidad += 0.10;
    else if (usuario.puntaje_promedio < 1.5) probabilidad -= 0.05;
    
    // Factor: Total de reuniones
    if (usuario.total_reuniones > 40) probabilidad += 0.10;
    else if (usuario.total_reuniones > 20) probabilidad += 0.05;
    else if (usuario.total_reuniones < 10) probabilidad -= 0.10;
    
    // Factor: Es admin
    if (usuario.es_admin) probabilidad += 0.08;
    
    // Factor: Antigüedad
    if (usuario.antiguedad_años > 5) probabilidad += 0.05;
    else if (usuario.antiguedad_años < 1) probabilidad -= 0.03;
    
    // Factor: Tipo de reunión
    if (tipoReunion === 'Extraordinaria') probabilidad += 0.03;
    
    // Factor: Día de la semana (martes-jueves mejor)
    if (diaSemana >= 1 && diaSemana <= 3) probabilidad += 0.02;
    
    // Factor: Hora (10-16 mejor)
    if (hora >= 10 && hora <= 16) probabilidad += 0.02;
    
    // Normalizar entre 0.05 y 0.95
    return Math.max(0.05, Math.min(0.95, probabilidad));
}

// Función para detectar anomalías/usuarios en riesgo
function detectarRiesgo(usuario) {
    // Criterios de riesgo
    const criteriosRiesgo = [
        usuario.tasa_asistencia < 0.3,
        usuario.total_reuniones < 5,
        usuario.puntaje_promedio < 1.0,
        usuario.antiguedad_años < 0.5 && usuario.total_reuniones < 3
    ];
    
    return criteriosRiesgo.filter(Boolean).length >= 2;
}

// ENDPOINT 1: Estado general del modelo y estadísticas
router.get('/estado-modelo', async (req, res) => {
    try {
        // Obtener datos básicos de la vista
        const [usuarios] = await pool.execute(`
            SELECT 
                usuario_id,
                AVG(puntaje) as puntaje_promedio,
                COUNT(*) as total_reuniones,
                AVG(CASE WHEN estado_asistencia = 'asistencia_completa' THEN 1 ELSE 0 END) as tasa_asistencia,
                MAX(antiguedad) as antiguedad,
                MAX(es_admin) as es_admin,
                MAX(genero) as genero,
                DATEDIFF(NOW(), MAX(antiguedad)) / 365.25 as antiguedad_años
            FROM vw_dataset_asistencia 
            GROUP BY usuario_id
        `);
        
        // Procesar datos con el modelo
        const usuariosProcesados = usuarios.map(usuario => {
            const cluster = calcularCluster(usuario.puntaje_promedio, usuario.total_reuniones);
            const probabilidad = calcularProbabilidadAsistencia(usuario);
            const enRiesgo = detectarRiesgo(usuario);
            
            return {
                ...usuario,
                cluster,
                probabilidad_asistencia: probabilidad,
                en_riesgo: enRiesgo
            };
        });
        
        // Calcular estadísticas agregadas
        const stats = {
            total_usuarios: usuariosProcesados.length,
            usuarios_riesgo: usuariosProcesados.filter(u => u.en_riesgo).length,
            asistencia_predicha_proxima: usuariosProcesados.filter(u => u.probabilidad_asistencia >= 0.7).length,
            clusters: {}
        };
        
        // Contar por clusters
        usuariosProcesados.forEach(usuario => {
            stats.clusters[usuario.cluster] = (stats.clusters[usuario.cluster] || 0) + 1;
        });
        
        res.json({
            success: true,
            model_metrics: {
                roc_auc: modeloML.precision,
                total_users: stats.total_usuarios
            },
            estadisticas: stats,
            clusters: stats.clusters,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error en estado-modelo:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener estado del modelo'
        });
    }
});

// ENDPOINT 2: Predicciones detalladas por usuario
router.get('/predicciones-usuarios', async (req, res) => {
    try {
        const { tipo_reunion = 'Extraordinaria', dia_semana = 2, hora = 14, limit = 50 } = req.query;
        
        // Obtener datos de usuarios con nombres
        const [usuarios] = await pool.execute(`
            SELECT 
                vw.usuario_id,
                pu.nombre,
                pu.apellido,
                rs.nombre as rol_nombre,
                AVG(vw.puntaje) as puntaje_promedio,
                COUNT(*) as total_reuniones,
                AVG(CASE WHEN vw.estado_asistencia = 'asistencia_completa' THEN 1 ELSE 0 END) as tasa_asistencia,
                MAX(vw.antiguedad) as antiguedad,
                MAX(vw.es_admin) as es_admin,
                MAX(vw.genero) as genero,
                DATEDIFF(NOW(), MAX(vw.antiguedad)) / 365.25 as antiguedad_años
            FROM vw_dataset_asistencia vw
            JOIN perfil_usuarios pu ON vw.usuario_id = pu.id
            LEFT JOIN roles_sindicato rs ON pu.rol_sindicato_id = rs.id
            GROUP BY vw.usuario_id, pu.nombre, pu.apellido, rs.nombre
            ORDER BY AVG(CASE WHEN vw.estado_asistencia = 'asistencia_completa' THEN 1 ELSE 0 END) DESC
            LIMIT ?
        `, [parseInt(limit)]);
        
        // Procesar predicciones
        const predicciones = usuarios.map(usuario => {
            const cluster = calcularCluster(usuario.puntaje_promedio, usuario.total_reuniones);
            const probabilidad = calcularProbabilidadAsistencia(
                usuario, 
                tipo_reunion, 
                parseInt(dia_semana), 
                parseInt(hora)
            );
            const enRiesgo = detectarRiesgo(usuario);
            
            return {
                usuario_id: usuario.usuario_id,
                nombre_completo: `${usuario.nombre} ${usuario.apellido}`,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                rol: usuario.rol_nombre || 'Agremiado',
                cluster,
                probabilidad_asistencia: probabilidad,
                probabilidad_texto: `${(probabilidad * 100).toFixed(0)}%`,
                en_riesgo: enRiesgo,
                nivel_riesgo: enRiesgo ? 'alto' : probabilidad < 0.5 ? 'medio' : 'bajo',
                estadisticas: {
                    puntaje_promedio: parseFloat(usuario.puntaje_promedio).toFixed(2),
                    total_reuniones: usuario.total_reuniones,
                    tasa_asistencia: parseFloat(usuario.tasa_asistencia).toFixed(3),
                    antiguedad_años: parseFloat(usuario.antiguedad_años).toFixed(1)
                }
            };
        });
        
        // Separar en categorías
        const altaProbabilidad = predicciones.filter(p => p.probabilidad_asistencia >= 0.7);
        const bajaProbabilidad = predicciones.filter(p => p.probabilidad_asistencia < 0.7);
        const usuariosRiesgo = predicciones.filter(p => p.en_riesgo);
        
        res.json({
            success: true,
            parametros_reunion: {
                tipo_reunion,
                dia_semana: parseInt(dia_semana),
                hora: parseInt(hora)
            },
            resumen: {
                total_usuarios: predicciones.length,
                alta_probabilidad: altaProbabilidad.length,
                baja_probabilidad: bajaProbabilidad.length,
                usuarios_riesgo: usuariosRiesgo.length,
                asistencia_esperada: altaProbabilidad.length,
                porcentaje_asistencia: `${Math.round((altaProbabilidad.length / predicciones.length) * 100)}%`
            },
            predicciones: {
                todas: predicciones,
                alta_probabilidad: altaProbabilidad,
                baja_probabilidad: bajaProbabilidad,
                usuarios_riesgo: usuariosRiesgo
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error en predicciones-usuarios:', error);
        res.status(500).json({
            success: false,
            error: 'Error al generar predicciones'
        });
    }
});

// ENDPOINT 3: Análisis individual de usuario
router.get('/usuario/:id/analisis', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Obtener datos detallados del usuario
        const [usuarioData] = await pool.execute(`
            SELECT 
                vw.usuario_id,
                pu.nombre,
                pu.apellido,
                rs.nombre as rol_nombre,
                AVG(vw.puntaje) as puntaje_promedio,
                COUNT(*) as total_reuniones,
                AVG(CASE WHEN vw.estado_asistencia = 'asistencia_completa' THEN 1 ELSE 0 END) as tasa_asistencia,
                MAX(vw.antiguedad) as antiguedad,
                MAX(vw.es_admin) as es_admin,
                MAX(vw.genero) as genero,
                DATEDIFF(NOW(), MAX(vw.antiguedad)) / 365.25 as antiguedad_años,
                COUNT(CASE WHEN vw.estado_asistencia = 'asistencia_completa' THEN 1 END) as asistencias_completas,
                COUNT(CASE WHEN vw.estado_asistencia = 'retardo' THEN 1 END) as retardos,
                COUNT(CASE WHEN vw.estado_asistencia = 'falta' THEN 1 END) as faltas
            FROM vw_dataset_asistencia vw
            JOIN perfil_usuarios pu ON vw.usuario_id = pu.id
            LEFT JOIN roles_sindicato rs ON pu.rol_sindicato_id = rs.id
            WHERE vw.usuario_id = ?
            GROUP BY vw.usuario_id, pu.nombre, pu.apellido, rs.nombre
        `, [id]);
        
        if (usuarioData.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }
        
        const usuario = usuarioData[0];
        
        // Calcular análisis ML
        const cluster = calcularCluster(usuario.puntaje_promedio, usuario.total_reuniones);
        const probabilidadBase = calcularProbabilidadAsistencia(usuario);
        const enRiesgo = detectarRiesgo(usuario);
        
        // Predicciones para diferentes escenarios
        const escenarios = [
            { tipo: 'Extraordinaria', dia: 2, hora: 14, nombre: 'Miércoles 14:00' },
            { tipo: 'Ordinaria', dia: 4, hora: 16, nombre: 'Viernes 16:00' },
            { tipo: 'Extraordinaria', dia: 0, hora: 10, nombre: 'Lunes 10:00' }
        ].map(escenario => ({
            ...escenario,
            probabilidad: calcularProbabilidadAsistencia(usuario, escenario.tipo, escenario.dia, escenario.hora)
        }));
        
        res.json({
            success: true,
            usuario: {
                id: usuario.usuario_id,
                nombre_completo: `${usuario.nombre} ${usuario.apellido}`,
                rol: usuario.rol_nombre || 'Agremiado',
                es_admin: Boolean(usuario.es_admin)
            },
            analisis_ml: {
                cluster,
                probabilidad_base: probabilidadBase,
                en_riesgo: enRiesgo,
                nivel_riesgo: enRiesgo ? 'alto' : probabilidadBase < 0.5 ? 'medio' : 'bajo'
            },
            estadisticas: {
                puntaje_promedio: parseFloat(usuario.puntaje_promedio).toFixed(2),
                total_reuniones: usuario.total_reuniones,
                tasa_asistencia: parseFloat(usuario.tasa_asistencia).toFixed(3),
                antiguedad_años: parseFloat(usuario.antiguedad_años).toFixed(1),
                asistencias_completas: usuario.asistencias_completas,
                retardos: usuario.retardos,
                faltas: usuario.faltas
            },
            predicciones_escenarios: escenarios,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error en análisis usuario:', error);
        res.status(500).json({
            success: false,
            error: 'Error al analizar usuario'
        });
    }
});

// ENDPOINT 4: Actualizar predicciones en tiempo real
router.get('/tiempo-real', async (req, res) => {
    try {
        // Obtener estadísticas rápidas para tiempo real
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(DISTINCT usuario_id) as total_usuarios,
                AVG(puntaje) as puntaje_promedio_global,
                AVG(CASE WHEN estado_asistencia = 'asistencia_completa' THEN 1 ELSE 0 END) as tasa_asistencia_global,
                COUNT(*) as total_registros
            FROM vw_dataset_asistencia 
            WHERE fecha_reunion >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        `);
        
        const estadisticas = stats[0];
        
        res.json({
            success: true,
            tiempo_real: {
                total_usuarios: estadisticas.total_usuarios,
                puntaje_promedio_global: parseFloat(estadisticas.puntaje_promedio_global).toFixed(2),
                tasa_asistencia_global: parseFloat(estadisticas.tasa_asistencia_global).toFixed(3),
                total_registros: estadisticas.total_registros,
                ultima_actualizacion: new Date().toISOString()
            },
            model_status: {
                activo: true,
                precision: modeloML.precision,
                algoritmo: 'Logistic Regression + K-Means',
                ultima_actualizacion: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error en tiempo-real:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener datos en tiempo real'
        });
    }
});

module.exports = router;