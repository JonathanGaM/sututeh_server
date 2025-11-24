const express = require("express");
const pool = require("../bd");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// ============================================================
// 📱 LOGIN MÓVIL (EMAIL + PASSWORD)
// ============================================================
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Correo inválido"),
    body("password").notEmpty().withMessage("Contraseña requerida"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: "Datos inválidos" });
    }

    const { email, password } = req.body;

    try {
      // 1) Buscar usuario
      const [[user]] = await pool.query(
        `SELECT id, contrasena, estatus
         FROM autenticacion_usuarios
         WHERE correo_electronico = ?`,
        [email.toLowerCase()]
      );

      if (!user || user.estatus !== "Activo") {
        return res.status(400).json({
          success: false,
          error: "Correo o contraseña incorrectos",
        });
      }

      // 2) Comparar contraseña
      const match = await bcrypt.compare(password, user.contrasena);
      if (!match) {
        return res.status(400).json({
          success: false,
          error: "Correo o contraseña incorrectos",
        });
      }

      // 3) Obtener rol
      const [[perfil]] = await pool.query(
        `SELECT p.rol_sindicato_id AS roleId, r.nombre AS roleName
         FROM perfil_usuarios p
         JOIN roles_sindicato r ON p.rol_sindicato_id = r.id
         WHERE p.id = ?`,
        [user.id]
      );

      if (!perfil) {
        return res.status(400).json({
          success: false,
          error: "Usuario sin rol asignado",
        });
      }

      // 4) Generar token
      const payload = {
        sub: user.id,
        role: perfil.roleName,
        email: email.toLowerCase(),
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

      // 5) Respuesta compatible con Flutter
      return res.json({
        success: true,
        message: "Login exitoso",
        token: token,
        user: {
          id: user.id,
          email: email.toLowerCase(),
          roleId: perfil.roleId,
          roleName: perfil.roleName,
        },
      });

    } catch (err) {
      console.error("Error login móvil:", err);
      res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
  }
);

// ============================================================
// 📱 LOGOUT
// ============================================================
router.post("/logout", async (req, res) => {
  try {
    const { usuario_id, token } = req.body;

    // Si se proporciona token específico, desactivarlo
    if (usuario_id && token) {
      await pool.query(
        "UPDATE fcm_tokens SET activo = FALSE WHERE usuario_id = ? AND fcm_token = ?",
        [usuario_id, token]
      );
      console.log(`✅ Token FCM desactivado para usuario ${usuario_id}`);
    } else if (usuario_id) {
      // Si solo se proporciona usuario, desactivar todos sus tokens
      await pool.query(
        "UPDATE fcm_tokens SET activo = FALSE WHERE usuario_id = ?",
        [usuario_id]
      );
      console.log(`✅ Todos los tokens desactivados para usuario ${usuario_id}`);
    }

    return res.json({ success: true, message: "Logout exitoso" });
  } catch (err) {
    console.error("Error en logout:", err);
    return res.json({ success: true, message: "Logout exitoso" });
  }
});

// ============================================================
// 📌 GUARDAR/ACTUALIZAR TOKEN FCM
// ============================================================
router.post("/guardar-token", async (req, res) => {
  const { usuario_id, token, dispositivo = "Android" } = req.body;

  if (!usuario_id || !token) {
    return res.status(400).json({
      success: false,
      error: "usuario_id y token son requeridos",
    });
  }

  try {
    // Insertar o actualizar token usando ON DUPLICATE KEY
    await pool.query(
      `INSERT INTO fcm_tokens (usuario_id, fcm_token, dispositivo, activo)
       VALUES (?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         fcm_token = VALUES(fcm_token),
         dispositivo = VALUES(dispositivo),
         fecha_actualizacion = CURRENT_TIMESTAMP,
         activo = TRUE`,
      [usuario_id, token, dispositivo]
    );

    console.log(`✅ Token FCM guardado para usuario ${usuario_id}`);

    return res.json({
      success: true,
      message: "Token FCM guardado correctamente",
    });
  } catch (err) {
    console.error("❌ Error guardando token FCM:", err);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

// ============================================================
// 🔄 ACTUALIZAR TOKEN FCM (Cuando se refresca)
// ============================================================
router.post("/actualizar-token", async (req, res) => {
  const { usuario_id, token_anterior, token_nuevo } = req.body;

  if (!usuario_id || !token_nuevo) {
    return res.status(400).json({
      success: false,
      error: "usuario_id y token_nuevo son requeridos",
    });
  }

  try {
    // Si hay token anterior, actualizarlo
    if (token_anterior) {
      await pool.query(
        `UPDATE fcm_tokens 
         SET fcm_token = ?, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE usuario_id = ? AND fcm_token = ?`,
        [token_nuevo, usuario_id, token_anterior]
      );
    } else {
      // Si no hay token anterior, insertar nuevo
      await pool.query(
        `INSERT INTO fcm_tokens (usuario_id, fcm_token, activo)
         VALUES (?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
           fcm_token = VALUES(fcm_token),
           fecha_actualizacion = CURRENT_TIMESTAMP`,
        [usuario_id, token_nuevo]
      );
    }

    console.log(`✅ Token FCM actualizado para usuario ${usuario_id}`);

    return res.json({
      success: true,
      message: "Token FCM actualizado correctamente",
    });
  } catch (err) {
    console.error("❌ Error actualizando token FCM:", err);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

// ============================================================
// 🗑️ ELIMINAR TOKEN FCM (Desinstalación)
// ============================================================
router.post("/eliminar-token", async (req, res) => {
  const { usuario_id, token } = req.body;

  if (!usuario_id) {
    return res.status(400).json({
      success: false,
      error: "usuario_id es requerido",
    });
  }

  try {
    if (token) {
      // Eliminar token específico
      await pool.query(
        "UPDATE fcm_tokens SET activo = FALSE WHERE usuario_id = ? AND fcm_token = ?",
        [usuario_id, token]
      );
    } else {
      // Eliminar todos los tokens del usuario
      await pool.query(
        "UPDATE fcm_tokens SET activo = FALSE WHERE usuario_id = ?",
        [usuario_id]
      );
    }

    console.log(`✅ Token(s) eliminado(s) para usuario ${usuario_id}`);

    return res.json({
      success: true,
      message: "Token eliminado correctamente",
    });
  } catch (err) {
    console.error("❌ Error eliminando token:", err);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

// ============================================================
// 📋 OBTENER TOKENS DE UN USUARIO
// ============================================================
router.get("/tokens/:usuario_id", async (req, res) => {
  try {
    const { usuario_id } = req.params;

    const [tokens] = await pool.query(
      `SELECT fcm_token, dispositivo, fecha_registro, fecha_actualizacion
       FROM fcm_tokens
       WHERE usuario_id = ? AND activo = TRUE`,
      [usuario_id]
    );

    return res.json({
      success: true,
      total: tokens.length,
      tokens,
    });
  } catch (err) {
    console.error("Error obteniendo tokens:", err);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

// ============================================================
// 📱 LOGIN GOOGLE → verificar si existe en BD
// ============================================================
router.post("/verify-google-email", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Email requerido" });
  }

  try {
    const [[user]] = await pool.query(
      `SELECT id, correo_electronico, estatus
       FROM autenticacion_usuarios
       WHERE correo_electronico = ?`,
      [email.toLowerCase()]
    );

    if (!user || user.estatus !== "Activo") {
      return res.status(404).json({
        success: false,
        exists: false,
        error: "Este correo no está registrado como agremiado",
      });
    }

    const [[perfil]] = await pool.query(
      `SELECT p.rol_sindicato_id AS roleId, r.nombre AS roleName
       FROM perfil_usuarios p
       JOIN roles_sindicato r ON p.rol_sindicato_id = r.id
       WHERE p.id = ?`,
      [user.id]
    );

    // Crear token JWT
    const payload = {
      sub: user.id,
      role: perfil.roleName,
      email: email.toLowerCase(),
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    return res.json({
      success: true,
      exists: true,
      message: "Correo verificado exitosamente",
      token,
      user: {
        id: user.id,
        email: email.toLowerCase(),
        roleId: perfil.roleId,
        roleName: perfil.roleName,
      },
    });

  } catch (err) {
    console.error("Error verify-google-email:", err);
    res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
});

// ============================================================
// 📌 OBTENER DATOS DEL USUARIO (TOKEN)
// ============================================================
router.get("/user-info", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ success: false, error: "Token no proporcionado" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: "Token inválido o expirado" });
    }

    const userId = decoded.sub;

    const [[user]] = await pool.query(`
      SELECT
        p.id,
        CONCAT(p.nombre, ' ', p.apellido_paterno, ' ', p.apellido_materno) AS nombre_completo,
        p.nombre,
        p.apellido_paterno,
        p.apellido_materno,
        p.url_foto,
        a.correo_electronico AS correo,
        p.telefono,
        p.curp,
        p.numero_trabajador,
        p.numero_sindicalizado,
        n.nombre AS nivel_educativo,
        pr.nombre AS programa_educativo,
        IFNULL(ps.nombre, 'Agremiado') AS puesto
      FROM perfil_usuarios p
      JOIN autenticacion_usuarios a ON p.id = a.id
      LEFT JOIN puestos_sindicato ps ON ps.usuario_id = p.id
      LEFT JOIN programas_educativos pr ON p.programa_id = pr.id
      LEFT JOIN niveles_educativos n ON p.nivel_id = n.id
      WHERE p.id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    return res.json({
      success: true,
      message: "Datos obtenidos correctamente",
      user,
    });

  } catch (err) {
    console.error("Error user-info:", err);
    res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
});

module.exports = router;