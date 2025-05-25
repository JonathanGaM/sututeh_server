//consultas/recuperarContraseña.js
require("dotenv").config();
const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { body, validationResult } = require("express-validator");
const pool = require("../bd");
const crypto = require("crypto");

/* ============================================
   1. Función para verificar si la contraseña 
      está comprometida (API Have I Been Pwned)
   ============================================ */
async function isPasswordPwned(password) {
  // Calcula el hash SHA-1 y conviértelo a mayúsculas
  const sha1Hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1Hash.substring(0, 5);
  const suffix = sha1Hash.substring(5);

  try {
    const response = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "TuNombreDeApp" }, // Cambia "TuNombreDeApp" por el nombre de tu aplicación
    });
    const lines = response.data.split("\n");
    for (const line of lines) {
      const [hashSuffix, count] = line.split(":");
      if (hashSuffix.trim() === suffix) {
        return parseInt(count.trim()) > 0;
      }
    }
    return false;
  } catch (error) {
    console.error("Error al verificar contraseña en HIBP:", error);
    return false;
  }
}

/* ============================================
   2. Configuración de Nodemailer
   ============================================ */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "20221074@uthh.edu.mx", // Ajusta tu correo
    pass: "wgmq kkxx qdxc fdck",   // Ajusta tu contraseña o "App Password"
  },
  tls: {
    rejectUnauthorized: false,
  },
});

/* ============================================
   3. Endpoint: Verificar correo y reCAPTCHA 
      (Paso 1)
   ============================================ */
router.post(
  "/verificarCorreoCaptcha",
  [
    body("email").trim().escape(),
    body("tokenCaptcha").notEmpty(), // El token de reCAPTCHA que llega del frontend
  ],
  async (req, res) => {
    try {
      // Validación de campos
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, tokenCaptcha } = req.body;

      // Validar reCAPTCHA con Google
      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      if (!secretKey) {
        return res.status(500).json({ error: "Falta RECAPTCHA_SECRET_KEY en .env" });
      }
      const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${tokenCaptcha}`;
      const captchaResponse = await axios.post(verifyURL);
      if (!captchaResponse.data.success) {
        return res.status(400).json({ error: "reCAPTCHA inválido." });
      }

      // Verificar que el correo exista en la tabla usuarios
      const [rows] = await pool.query(
        "SELECT id FROM usuarios WHERE correo_electronico = ?",
        [email]
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "El correo no está registrado en el sistema." });
      }

      // Si todo es correcto, enviamos un mensaje de éxito
      res.json({ message: "Correo encontrado y reCAPTCHA válido. Continúa al siguiente paso." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);

/* ============================================
   4. Endpoint: Enviar código de 6 dígitos 
      (Paso 2)
   ============================================ */
router.post(
  "/enviarCodigo",
  [body("email").trim().escape()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email } = req.body;

      // Verifica que el usuario exista
      const [existingUser] = await pool.query(
        "SELECT id FROM usuarios WHERE correo_electronico = ?",
        [email]
      );
      if (existingUser.length === 0) {
        return res
          .status(404)
          .json({ error: "No se encontró el usuario con ese correo." });
      }

      // Generar OTP de 6 dígitos
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Crear token JWT sin timestamp y hashearlo
      const token = jwt.sign({ code }, process.env.JWT_SECRET, { noTimestamp: true });
      const salt = await bcrypt.genSalt(10);
      const hashedToken = await bcrypt.hash(token, salt);

      // Actualizar el usuario con el OTP y la fecha actual
      await pool.query(
        `UPDATE usuarios 
         SET codigo_verificacion = ?, fecha_codigo_verificacion = NOW() 
         WHERE correo_electronico = ?`,
        [hashedToken, email]
      );

      // Enviar el OTP por correo
      await transporter.sendMail({
        from: `"Recuperar Contraseña" <${process.env.DB_USER}>`,
        to: email,
        subject: "Código de Recuperación",
        text: `Tu código de recuperación es: ${code}`,
      });

      res.json({ message: "Código de recuperación enviado exitosamente." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);

/* ============================================
   5. Endpoint: Verificar código 
      (Paso 3)
   ============================================ */
router.post(
  "/verificarCodigo",
  [
    body("email").trim().escape(),
    body("codigo").trim().escape(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, codigo } = req.body;

      // Buscar el hashedToken y fecha en la BD
      const [rows] = await pool.query(
        "SELECT codigo_verificacion, fecha_codigo_verificacion FROM usuarios WHERE correo_electronico = ?",
        [email]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado." });
      }

      const hashedToken = rows[0].codigo_verificacion;
      if (!hashedToken) {
        return res.status(400).json({ error: "No se ha generado un código de recuperación." });
      }

      // Verificar tiempo de expiración (ej. 5 minutos = 300 seg)
      const generatedAt = new Date(rows[0].fecha_codigo_verificacion);
      const now = new Date();
      const diffSeconds = (now - generatedAt) / 1000;
      if (diffSeconds > 300) {
        return res
          .status(400)
          .json({ error: "Código de recuperación inválido o expirado." });
      }

      // Compara el código ingresado con el almacenado (JWT + bcrypt)
      const localToken = jwt.sign({ code: codigo }, process.env.JWT_SECRET, {
        noTimestamp: true,
      });
      const isMatch = await bcrypt.compare(localToken, hashedToken);

      if (!isMatch) {
        return res
          .status(400)
          .json({ error: "Código de recuperación inválido o expirado." });
      }

      // Si todo va bien, se confirma que el código es válido
      res.json({ message: "Código de recuperación verificado correctamente." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);

/* ============================================
   6. Endpoint: Actualizar la contraseña 
      (Paso 4)
   ============================================ */
router.post(
  "/actualizarContrasena",
  [
    body("email").trim().escape(),
    body("password").notEmpty(),
    body("confirmPassword").notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password, confirmPassword } = req.body;

      // Verificar que coincidan las contraseñas
      if (password !== confirmPassword) {
        return res.status(400).json({ error: "Las contraseñas no coinciden." });
      }

      // 🔹 Validar si la contraseña está comprometida (isPasswordPwned)
      const compromised = await isPasswordPwned(password);
      if (compromised) {
        return res
          .status(400)
          .json({ error: "La contraseña ha sido comprometida. Por favor, elige otra." });
      }

      // Encripta la nueva contraseña
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Actualiza la contraseña en la BD y limpia el código de verificación
      await pool.query(
        `UPDATE usuarios 
         SET contrasena = ?, 
             codigo_verificacion = NULL, 
             fecha_codigo_verificacion = NULL
         WHERE correo_electronico = ?`,
        [hashedPassword, email]
      );

      res.json({ message: "Contraseña actualizada correctamente." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
