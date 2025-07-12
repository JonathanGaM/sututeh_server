// server/consultas/verificarUsuario.js
const express = require("express");
const pool = require("../bd");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// Endpoint para verificar fecha de nacimiento
router.post('/verificar-fecha-nacimiento', async (req, res) => {
    try {
        const { fechaNacimiento } = req.body;
        
        console.log(`🔍 Verificando fecha de nacimiento: ${fechaNacimiento}`);
        
        // Validar que se proporcione la fecha de nacimiento
        if (!fechaNacimiento) {
            return res.status(400).json({
                autorizado: false,
                mensaje: 'Fecha de nacimiento requerida'
            });
        }
        
        // Buscar usuarios por fecha de nacimiento
        const query = `
            SELECT COUNT(*) as total_usuarios
            FROM perfil_usuarios pu
            INNER JOIN autenticacion_usuarios au ON pu.id = au.id
            WHERE pu.fecha_nacimiento = ? 
            AND au.verificado = 1 
            AND au.registro_completado = 1
            AND au.estatus = 'Activo'
        `;
        
        const [rows] = await pool.execute(query, [fechaNacimiento]);
        
        if (rows[0].total_usuarios === 0) {
            console.log(`❌ Fecha de nacimiento no encontrada: ${fechaNacimiento}`);
            return res.status(401).json({
                autorizado: false,
                mensaje: 'Fecha de nacimiento no encontrada en nuestros registros'
            });
        }
        
        console.log(`✅ Fecha de nacimiento válida: ${fechaNacimiento} (${rows[0].total_usuarios} usuario(s) encontrado(s))`);
        
        res.json({
            autorizado: true,
            mensaje: 'Fecha de nacimiento verificada correctamente. Procede con el número sindicalizado.'
        });
        
    } catch (error) {
        console.error('❌ Error en verificación de fecha de nacimiento:', error);
        res.status(500).json({
            autorizado: false,
            mensaje: 'Error interno del servidor'
        });
    }
});

// Endpoint para verificar usuario por número sindicalizado Y fecha de nacimiento
router.post('/verificar-usuario-completo', async (req, res) => {
    try {
        const { numeroSindicalizado, fechaNacimiento } = req.body;
        
        console.log(`🔍 Verificando usuario completo - Número: ${numeroSindicalizado}, Fecha: ${fechaNacimiento}`);
        
        // Validar que se proporcionen ambos datos
        if (!numeroSindicalizado || !fechaNacimiento) {
            return res.status(400).json({
                autorizado: false,
                mensaje: 'Número sindicalizado y fecha de nacimiento requeridos'
            });
        }
        
        // Convertir a número entero
        const numeroInt = parseInt(numeroSindicalizado);
        
        if (isNaN(numeroInt)) {
            return res.status(400).json({
                autorizado: false,
                mensaje: 'Número sindicalizado inválido'
            });
        }
        
        // Buscar el usuario por número sindicalizado Y fecha de nacimiento
        const query = `
            SELECT 
                pu.id,
                pu.numero_sindicalizado,
                pu.nombre,
                pu.apellido_paterno,
                pu.apellido_materno,
                pu.fecha_nacimiento,
                au.correo_electronico,
                au.estatus,
                rs.nombre as rol_sindicato
            FROM perfil_usuarios pu
            INNER JOIN autenticacion_usuarios au ON pu.id = au.id
            INNER JOIN roles_sindicato rs ON pu.rol_sindicato_id = rs.id
            WHERE pu.numero_sindicalizado = ? 
            AND pu.fecha_nacimiento = ?
            AND au.verificado = 1 
            AND au.registro_completado = 1
            AND au.estatus = 'Activo'
        `;
        
        const [rows] = await pool.execute(query, [numeroInt, fechaNacimiento]);
        
        if (rows.length === 0) {
            console.log(`❌ Usuario no encontrado o datos incorrectos - Número: ${numeroInt}, Fecha: ${fechaNacimiento}`);
            return res.status(401).json({
                autorizado: false,
                mensaje: 'Número sindicalizado o fecha de nacimiento incorrectos'
            });
        }
        
        const usuario = rows[0];
        
        // Usuario encontrado y verificado
        console.log(`✅ Usuario autorizado: ${usuario.nombre} ${usuario.apellido_paterno} (${usuario.numero_sindicalizado})`);
        
        // Crear nombre corto para Alexa
        const nombreCorto = usuario.nombre;
        const nombreCompleto = `${usuario.nombre} ${usuario.apellido_paterno} ${usuario.apellido_materno || ''}`.trim();
        
        res.json({
            autorizado: true,
            numeroSindicalizado: usuario.numero_sindicalizado,
            nombreCorto: nombreCorto,
            nombreCompleto: nombreCompleto,
            nombreUsuario: nombreCompleto,
            correo: usuario.correo_electronico,
            rol: usuario.rol_sindicato,
            fechaNacimiento: usuario.fecha_nacimiento,
            mensaje: 'Usuario autorizado correctamente'
        });
        
    } catch (error) {
        console.error('❌ Error en verificación de usuario completo:', error);
        res.status(500).json({
            autorizado: false,
            mensaje: 'Error interno del servidor'
        });
    }
});

// Endpoint original para compatibilidad (deprecado)
router.post('/verificar-usuario-numero', async (req, res) => {
    try {
        const { numeroSindicalizado } = req.body;
        
        console.log(`🔍 Verificando acceso para número sindicalizado: ${numeroSindicalizado}`);
        
        // Validar que se proporcione el número sindicalizado
        if (!numeroSindicalizado) {
            return res.status(400).json({
                autorizado: false,
                mensaje: 'Número sindicalizado requerido'
            });
        }
        
        // Convertir a número entero
        const numeroInt = parseInt(numeroSindicalizado);
        
        if (isNaN(numeroInt)) {
            return res.status(400).json({
                autorizado: false,
                mensaje: 'Número sindicalizado inválido'
            });
        }
        
        // Buscar el usuario por número sindicalizado
        const query = `
            SELECT 
                pu.id,
                pu.numero_sindicalizado,
                pu.nombre,
                pu.apellido_paterno,
                pu.apellido_materno,
                au.correo_electronico,
                au.estatus,
                rs.nombre as rol_sindicato
            FROM perfil_usuarios pu
            INNER JOIN autenticacion_usuarios au ON pu.id = au.id
            INNER JOIN roles_sindicato rs ON pu.rol_sindicato_id = rs.id
            WHERE pu.numero_sindicalizado = ? 
            AND au.verificado = 1 
            AND au.registro_completado = 1
            AND au.estatus = 'Activo'
        `;
        
        const [rows] = await pool.execute(query, [numeroInt]);
        
        if (rows.length === 0) {
            console.log(`❌ Número sindicalizado no encontrado: ${numeroInt}`);
            return res.status(401).json({
                autorizado: false,
                mensaje: 'Número sindicalizado no encontrado o usuario inactivo'
            });
        }
        
        const usuario = rows[0];
        
        // Usuario encontrado y verificado
        console.log(`✅ Usuario autorizado: ${usuario.nombre} ${usuario.apellido_paterno} (${usuario.numero_sindicalizado})`);
        
        // Crear nombre corto para Alexa
        const nombreCorto = usuario.nombre;
        const nombreCompleto = `${usuario.nombre} ${usuario.apellido_paterno} ${usuario.apellido_materno || ''}`.trim();
        
        res.json({
            autorizado: true,
            numeroSindicalizado: usuario.numero_sindicalizado,
            nombreCorto: nombreCorto,
            nombreCompleto: nombreCompleto,
            nombreUsuario: nombreCompleto,
            correo: usuario.correo_electronico,
            rol: usuario.rol_sindicato,
            mensaje: 'Usuario autorizado correctamente'
        });
        
    } catch (error) {
        console.error('❌ Error en verificación por número sindicalizado:', error);
        res.status(500).json({
            autorizado: false,
            mensaje: 'Error interno del servidor'
        });
    }
});

// Endpoint de prueba para verificar la funcionalidad
router.get('/test-numeros-sindicalizados', async (req, res) => {
    try {
        const query = `
            SELECT 
                pu.numero_sindicalizado,
                pu.nombre,
                pu.apellido_paterno,
                pu.fecha_nacimiento,
                au.estatus
            FROM perfil_usuarios pu
            INNER JOIN autenticacion_usuarios au ON pu.id = au.id
            WHERE au.verificado = 1 
            AND au.registro_completado = 1
            AND au.estatus = 'Activo'
            ORDER BY pu.numero_sindicalizado
            LIMIT 10
        `;
        
        const [rows] = await pool.execute(query);
        
        res.json({
            mensaje: 'Usuarios de prueba disponibles para verificación',
            usuarios: rows.map(user => ({
                numero: user.numero_sindicalizado,
                nombre: `${user.nombre} ${user.apellido_paterno}`,
                fechaNacimiento: user.fecha_nacimiento,
                estatus: user.estatus
            }))
        });
        
    } catch (error) {
        console.error('Error al obtener números de prueba:', error);
        res.status(500).json({
            error: 'Error interno del servidor'
        });
    }
});

// ===== NUEVOS ENDPOINTS PARA ALEXA - NOTICIAS Y REUNIONES =====

// Endpoint para obtener noticias de la semana actual
router.get('/noticias-semana-actual', async (req, res) => {
    try {
        console.log('🗞️ Consultando noticias de la semana actual...');
        
        // Configurar zona horaria de México
        await pool.execute("SET time_zone = '-06:00'");
        
        // Obtener noticias de la semana actual (basado en número de semana del año)
        const query = `
            SELECT 
                n.id, n.titulo, n.descripcion, n.contenido,
                n.fecha_publicacion, n.fecha_creacion, n.fecha_actualizacion,
                'Publicado' AS estado,
                COALESCE(
                    CONCAT('[', GROUP_CONCAT(
                        CONCAT('"', nm.url_imagen, '"') SEPARATOR ','
                    ), ']'),
                    '[]'
                ) AS imagenes,
                MAX(nm.url_video) AS url_video
            FROM noticias n
            LEFT JOIN noticias_multimedia nm ON nm.noticia_id = n.id
            WHERE WEEK(n.fecha_publicacion, 1) = WEEK(CURDATE(), 1)
              AND YEAR(n.fecha_publicacion) = YEAR(CURDATE())
              AND DATE(n.fecha_publicacion) <= CURDATE()
            GROUP BY n.id
            ORDER BY n.fecha_publicacion DESC
        `;
        
        const [noticias] = await pool.execute(query);
        
        console.log(`✅ Encontradas ${noticias.length} noticias de la semana actual`);
        
        // Parsear las imágenes de JSON string a array
        const noticiasFormateadas = noticias.map(noticia => ({
            ...noticia,
            imagenes: JSON.parse(noticia.imagenes)
        }));
        
        res.json({
            mensaje: `Noticias de la semana actual (semana ${new Date().getWeek()})`,
            semana_actual: new Date().getWeek(),
            año: new Date().getFullYear(),
            total_noticias: noticiasFormateadas.length,
            noticias: noticiasFormateadas
        });
        
    } catch (error) {
        console.error('❌ Error al obtener noticias de la semana actual:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            mensaje: 'No se pudieron obtener las noticias de la semana actual'
        });
    }
});

// Endpoint para obtener reuniones futuras del mes actual
router.get('/reuniones-futuras-mes', async (req, res) => {
    try {
        console.log('🗓️ Consultando reuniones futuras del mes actual...');
        
        // Configurar zona horaria de México
        await pool.execute("SET time_zone = '-06:00'");
        
        // Función para calcular el estado de la reunión
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
        
        // Obtener reuniones futuras del mes actual (desde hoy en adelante)
        const query = `
            SELECT
                id,
                title,
                date,
                time,
                type,
                location,
                description,
                ${getEstadoReunion()} AS status,
                created_at,
                updated_at
            FROM reuniones
            WHERE MONTH(date) = MONTH(CURDATE())
              AND YEAR(date) = YEAR(CURDATE())
              AND date >= CURDATE()
            ORDER BY date ASC, time ASC
        `;
        
        const [reuniones] = await pool.execute(query);
        
        console.log(`✅ Encontradas ${reuniones.length} reuniones futuras del mes actual`);
        
        res.json({
            mensaje: `Reuniones futuras del mes actual (${new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })})`,
            mes_actual: new Date().toLocaleDateString('es-MX', { month: 'long' }),
            año: new Date().getFullYear(),
            fecha_consulta: new Date().toLocaleDateString('es-MX'),
            total_reuniones: reuniones.length,
            reuniones: reuniones
        });
        
    } catch (error) {
        console.error('❌ Error al obtener reuniones futuras del mes:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            mensaje: 'No se pudieron obtener las reuniones futuras del mes actual'
        });
    }
});

// Función auxiliar para obtener el número de semana del año
Date.prototype.getWeek = function() {
    const date = new Date(this.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

module.exports = router;