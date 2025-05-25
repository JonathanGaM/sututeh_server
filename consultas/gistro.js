//consultas/registro.js
const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { body, validationResult } = require("express-validator");
const pool = require("../bd");
const crypto = require("crypto");

// Función para verificar si la contraseña está comprometida usando la API de Have I Been Pwned
async function isPasswordPwned(password) {
  // Calcula el hash SHA-1 y conviértelo a mayúsculas
  const sha1Hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1Hash.substring(0, 5);
  const suffix = sha1Hash.substring(5);
  try {
    const response = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "TuNombreDeApp" } // Cambia "TuNombreDeApp" por el nombre de tu aplicación
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

// Endpoint para validar si la contraseña está comprometida
router.post("/checkPasswordCompromised", [body("password").notEmpty()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { password } = req.body;
    const compromised = await isPasswordPwned(password);
    if (compromised) {
      return res.status(400).json({ error: "La contraseña ha sido comprometida. Por favor, elige otra." });
    }
    res.json({ message: "Contraseña segura." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Nuevo endpoint para cancelar el registro incompleto
router.post(
  "/cancelarRegistro",
  [body("email").trim().escape(), body("fechaNacimiento").trim().escape()],
  async (req, res) => {
    try {
      const { email, fechaNacimiento } = req.body;
      await pool.query(
        "DELETE FROM usuarios WHERE correo_electronico = ? AND fecha_nacimiento = ? AND registro_completado = 0",
        [email, fechaNacimiento]
      );
      res.json({ message: "Registro cancelado exitosamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Configuración de Nodemailer
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "20221074@uthh.edu.mx",
    pass: "wgmq kkxx qdxc fdck",
  },
  tls: {
    rejectUnauthorized: false,
  },
});

/* ===========================================
   Rutas para Consultar Datos de Catálogos
   =========================================== */
router.get("/puestos", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nombre FROM puestos_universidad");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/programas", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nombre FROM programas_educativos");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/universidades", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nombre FROM universidades");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/niveles", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nombre FROM niveles_educativos");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/roles", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nombre FROM roles_sindicato");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ===========================================
   Rutas para Registro y Verificación
   =========================================== */

// Endpoint para consultar si el usuario ya está registrado
router.post(
  "/consultarUsuario",
  [body("email").trim().escape(), body("fechaNacimiento").trim().escape()],
  async (req, res) => {
    try {
      const { email, fechaNacimiento } = req.body;
      const [rows] = await pool.query(
        "SELECT * FROM usuarios WHERE correo_electronico = ? AND fecha_nacimiento = ?",
        [email, fechaNacimiento]
      );
      if (rows.length > 0) {
        // Si el registro está completo, se rechaza el registro
        if (rows[0].registro_completado == 1) {
          return res.status(400).json({ error: "El usuario ya está registrado." });
        } else {
          // Si el registro es incompleto, se elimina inmediatamente
          await pool.query(
            "DELETE FROM usuarios WHERE correo_electronico = ? AND fecha_nacimiento = ? AND registro_completado = 0",
            [email, fechaNacimiento]
          );
        }
      }
      res.json({ message: "Usuario no registrado, puede continuar." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Validar que el usuario existe en miembros_sindicato
router.post(
  "/verificarCorreo",
  [body("email").trim().escape(), body("fechaNacimiento").trim().escape()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { email, fechaNacimiento } = req.body;
      const [rows] = await pool.query(
        "SELECT * FROM miembros_sindicato WHERE correo_electronico = ? AND fecha_nacimiento = ?",
        [email, fechaNacimiento]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "El correo o la fecha de nacimiento no coinciden en el sindicato." });
      }
      res.json({ message: "Correo y fecha válidos en el sindicato." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Enviar código de verificación (OTP)
router.post(
  "/enviarCodigo",
  [body("email").trim().escape(), body("fechaNacimiento").trim().escape()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { email, fechaNacimiento } = req.body;
      // Si el usuario no existe, se inserta con registro_completado = 0
      const [existingUser] = await pool.query(
        "SELECT id FROM usuarios WHERE correo_electronico = ? AND fecha_nacimiento = ?",
        [email, fechaNacimiento]
      );
      if (existingUser.length === 0) {
        await pool.query(
          "INSERT INTO usuarios (correo_electronico, fecha_nacimiento, registro_completado) VALUES (?, ?, 0)",
          [email, fechaNacimiento]
        );
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
         WHERE correo_electronico = ? AND fecha_nacimiento = ?`,
        [hashedToken, email, fechaNacimiento]
      );
      // Enviar el OTP por correo
      await transporter.sendMail({
        from: `"Registro Sindicato" <${process.env.DB_USER}>`,
        to: email,
        subject: "Código de Verificación",
        text: `Tu código de verificación es: ${code}`,
      });
      res.json({ message: "Código de verificación enviado exitosamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Verificar el OTP ingresado
router.post(
  "/verificarCodigo",
  [body("email").trim().escape(), body("codigo").trim().escape()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { email, codigo } = req.body;
      const [rows] = await pool.query(
        "SELECT codigo_verificacion, fecha_codigo_verificacion FROM usuarios WHERE correo_electronico = ?",
        [email]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado." });
      const hashedToken = rows[0].codigo_verificacion;
      if (!hashedToken) return res.status(400).json({ error: "No se ha generado un código." });
      const generatedAt = new Date(rows[0].fecha_codigo_verificacion);
      const now = new Date();
      const diffSeconds = (now - generatedAt) / 1000;
      if (diffSeconds > 300) return res.status(400).json({ error: "Código de verificación inválido o expirado." });
      const localToken = jwt.sign({ code: codigo }, process.env.JWT_SECRET, { noTimestamp: true });
      const isMatch = await bcrypt.compare(localToken, hashedToken);
      if (!isMatch) return res.status(400).json({ error: "Código de verificación inválido o expirado." });
      await pool.query("UPDATE usuarios SET verificado = 1 WHERE correo_electronico = ?", [email]);
      res.json({ message: "Código verificado correctamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Actualizar datos del usuario (registro final)
// Se marca registro_completado = 1
router.post(
  "/actualizarUsuario",
  [
    body("email").trim().escape(),
    body("password").notEmpty(),
    body("firstName").notEmpty(),
    body("lastName").notEmpty(),
    body("maternalLastName").notEmpty(),
    body("gender").notEmpty(),
    body("curp").isLength({ min: 18, max: 18 }),
    body("phone").isLength({ min: 10, max: 10 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const {
        email,
        password,
        firstName,
        lastName,
        maternalLastName,
        gender,
        curp,
        phone,
        universityOrigin,
        universityPosition,
        educationalProgram,
        workerNumber,
        educationalLevel,
      } = req.body;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await pool.query(
        `UPDATE usuarios SET 
          contrasena = ?,
          nombre = ?,
          apellido_paterno = ?,
          apellido_materno = ?,
          genero = ?,
          curp = ?,
          telefono = ?,
          universidad_id = (SELECT id FROM universidades WHERE nombre = ?),
          puesto_id = (SELECT id FROM puestos_universidad WHERE nombre = ?),
          programa_educativo_id = (CASE 
              WHEN ? IN ('Docente', 'Director de carrera') 
              THEN (SELECT id FROM programas_educativos WHERE nombre = ?)
              ELSE NULL END),
          numero_trabajador = ?,
          nivel_educativo_id = (SELECT id FROM niveles_educativos WHERE nombre = ?),
          registro_completado = 1
         WHERE correo_electronico = ?`,
        [
          hashedPassword,
          firstName,
          lastName,
          maternalLastName,
          gender,
          curp,
          phone,
          universityOrigin,
          universityPosition,
          universityPosition,
          educationalProgram,
          workerNumber,
          educationalLevel,
          email,
        ]
      );
      res.json({ message: "Usuario actualizado correctamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Validar reCAPTCHA
router.post("/validarCaptcha", async (req, res) => {
  try {
    const { tokenCaptcha } = req.body;
    if (!tokenCaptcha) return res.status(400).json({ error: "Falta el token de reCAPTCHA." });
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${tokenCaptcha}`;
    const response = await axios.post(verifyURL);
    if (!response.data.success) return res.status(400).json({ error: "reCAPTCHA inválido." });
    res.json({ message: "Captcha válido." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
