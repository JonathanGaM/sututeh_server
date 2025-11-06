// server/consultas/autenticacionmvl.js
const express = require("express");
const pool = require("../bd");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// 📱 Login móvil - Sin reCAPTCHA, solo email y password
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Correo inválido"),
    body("password").notEmpty().withMessage("Contraseña requerida"),
  ],
  async (req, res) => {
    // 1) Validar esquema
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // 2) Buscar usuario en la base de datos
      const [[user]] = await pool.query(
        `SELECT id, contrasena, estatus 
         FROM autenticacion_usuarios 
         WHERE correo_electronico = ?`,
        [email.toLowerCase()]
      );

      if (!user || user.estatus !== "Activo") {
        return res.status(400).json({ error: "Correo o contraseña incorrectos" });
      }

      // 3) Comparar contraseña
      const match = await bcrypt.compare(password, user.contrasena);
      if (!match) {
        return res.status(400).json({ error: "Correo o contraseña incorrectos" });
      }

      // 4) Obtener rol del usuario
      const [[perfil]] = await pool.query(
        `SELECT p.rol_sindicato_id AS roleId, r.nombre AS roleName
         FROM perfil_usuarios p
         JOIN roles_sindicato r ON p.rol_sindicato_id = r.id
         WHERE p.id = ?`,
        [user.id]
      );

      if (!perfil) {
        return res.status(400).json({ error: "Usuario sin rol asignado" });
      }

      // 5) Firmar JWT
      const payload = { 
        sub: user.id, 
        role: perfil.roleName,
        email: email.toLowerCase()
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "24h", // Token más largo para móvil
      });

      // 6) Responder con token y datos del usuario
      res.json({
        message: "Login exitoso",
        token: token,
        user: {
          id: user.id,
          email: email.toLowerCase(),
          roleId: perfil.roleId,
          roleName: perfil.roleName
        }
      });

    } catch (err) {
      console.error("Error en /api/auth/mobile/login:", err);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// 📱 Logout móvil
router.post("/logout", (req, res) => {
  // En móvil solo confirmamos el logout
  // El cliente debe eliminar el token localmente
  res.json({ message: "Logout exitoso" });
});

// 📱 Verificar token (opcional - para validar sesión)
router.post("/verify", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ 
      valid: true, 
      user: {
        id: decoded.sub,
        role: decoded.role,
        email: decoded.email
      }
    });
  } catch (err) {
    res.status(401).json({ valid: false, error: "Token inválido o expirado" });
  }
});

// 🔍 Verificar si correo de Google existe en BD
router.post("/verify-google-email", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email requerido" });
  }

  try {
    // Buscar usuario en la base de datos
    const [[user]] = await pool.query(
      `SELECT id, correo_electronico, estatus 
       FROM autenticacion_usuarios 
       WHERE correo_electronico = ?`,
      [email.toLowerCase()]
    );

    if (!user || user.estatus !== "Activo") {
      return res.status(404).json({ 
        exists: false, 
        error: "Este correo no está registrado como agremiado" 
      });
    }

    // Obtener rol del usuario
    const [[perfil]] = await pool.query(
      `SELECT p.rol_sindicato_id AS roleId, r.nombre AS roleName
       FROM perfil_usuarios p
       JOIN roles_sindicato r ON p.rol_sindicato_id = r.id
       WHERE p.id = ?`,
      [user.id]
    );

    if (!perfil) {
      return res.status(400).json({ 
        exists: false,
        error: "Usuario sin rol asignado" 
      });
    }

    // Generar token JWT para el usuario
    const payload = { 
      sub: user.id, 
      role: perfil.roleName,
      email: email.toLowerCase()
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      exists: true,
      message: "Correo verificado exitosamente",
      token: token,
      user: {
        id: user.id,
        email: email.toLowerCase(),
        roleId: perfil.roleId,
        roleName: perfil.roleName
      }
    });

  } catch (err) {
    console.error("Error en /api/auth/mobile/verify-google-email:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;