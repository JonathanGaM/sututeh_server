// server/consultas/verificarUsuario.js
const express = require("express");
const pool = require("../bd");
const { body, validationResult } = require("express-validator");

const router = express.Router();

router.post(
  "/",
  [
    body("correoElectronico")
      .notEmpty()
      .withMessage("Correo electrónico requerido")
      .isEmail()
      .withMessage("Debe ser un correo electrónico válido")
      .normalizeEmail(),
  ],
  async (req, res) => {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        autorizado: false, 
        error: "Datos inválidos",
        errors: errors.array() 
      });
    }

    const { correoElectronico } = req.body;

    try {
      console.log(`🔍 Verificando usuario por email: ${correoElectronico}`);
      
      // Limpiar y normalizar el email
      const emailLimpio = correoElectronico.trim().toLowerCase();
      
      // Buscar usuario en la base de datos por correo electrónico
      const query = `
        SELECT 
          au.id,
          au.correo_electronico,
          pu.nombre,
          pu.apellido_paterno,
          pu.apellido_materno,
          au.estatus
        FROM autenticacion_usuarios au
        JOIN perfil_usuarios pu ON au.id = pu.id
        WHERE au.estatus = 'Activo'
          AND LOWER(au.correo_electronico) = ?
        LIMIT 1
      `;

      console.log(`🔍 Buscando email: ${emailLimpio}`);

      const [usuarios] = await pool.query(query, [emailLimpio]);

      console.log(`📊 Usuarios encontrados: ${usuarios.length}`);

      if (usuarios.length === 0) {
        console.log(`❌ Usuario no encontrado: ${correoElectronico}`);
        return res.json({
          autorizado: false,
          mensaje: "Correo electrónico no encontrado en el sistema del Sindicato SUTUTEH"
        });
      }

      const usuario = usuarios[0];

      // Verificar que el usuario esté activo
      if (usuario.estatus !== 'Activo') {
        console.log(`❌ Usuario inactivo: ${correoElectronico}`);
        return res.json({
          autorizado: false,
          mensaje: "Tu cuenta no está activa. Contacta con la administración del sindicato."
        });
      }

      // Usuario autorizado
      console.log(`✅ Usuario autorizado: ${usuario.nombre} ${usuario.apellido_paterno} ${usuario.apellido_materno}`);
      
      return res.json({
        autorizado: true,
        nombreUsuario: `${usuario.nombre} ${usuario.apellido_paterno} ${usuario.apellido_materno}`,
        nombreCorto: `${usuario.nombre} ${usuario.apellido_paterno}`,
        correoElectronico: usuario.correo_electronico,
        mensaje: "Usuario autorizado correctamente"
      });

    } catch (err) {
      console.error("Error en verificación de usuario:", err);
      res.status(500).json({
        autorizado: false,
        error: "Error interno del servidor"
      });
    }
  }
);

module.exports = router;