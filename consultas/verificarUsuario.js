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

module.exports = router;