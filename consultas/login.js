// server/consultas/login.js
const express = require("express");
const pool   = require("../bd");
const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
const axios  = require("axios");
const { body, validationResult } = require("express-validator");

const router = express.Router();

router.post(
  "/",
  [
    body("email").isEmail().withMessage("Correo inválido"),
    body("password").notEmpty().withMessage("Contraseña requerida"),
    body("tokenCaptcha").notEmpty().withMessage("Falta token de reCAPTCHA"),
  ],
  async (req, res) => {
    // 0) validar esquema (incluye tokenCaptcha)
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password, tokenCaptcha } = req.body;

    // 1) validar reCAPTCHA con Google
    try {
      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      const googleRes = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify`,
        null,
        {
          params: {
            secret: secretKey,
            response: tokenCaptcha,
          },
        }
      );
      if (!googleRes.data.success) {
        return res.status(400).json({ error: "reCAPTCHA inválido." });
      }
    } catch (err) {
      console.error("Error validando reCAPTCHA:", err);
      return res.status(500).json({ error: "No se pudo validar reCAPTCHA." });
    }

    try {
      // 2) Buscar usuario
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

      // 4) Obtener rol
     
      const [[perfil]] = await pool.query(
        `SELECT p.rol_sindicato_id AS roleId, r.nombre AS roleName
         FROM perfil_usuarios p
         JOIN roles_sindicato r ON p.rol_sindicato_id = r.id
         WHERE p.id = ?`,
        [user.id]
      );

      // 5) Firmar JWT
      const payload = { sub: user.id, role: perfil.roleName };
      
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "5m",
      });
      

      // 6) Enviar cookie HttpOnly y JSON de éxito
      res
      .cookie("authToken", token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 5 * 60 * 1000, // 30 minutos
      })
      .json({ message: "Login exitoso", roleId: perfil.roleId });
        
    } catch (err) {
      console.error("Error en /api/login:", err);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

router.post("/logout", (req, res) => {
  res
    .clearCookie("authToken", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    })
    .json({ message: "Logout exitoso" });
});
module.exports = router;
