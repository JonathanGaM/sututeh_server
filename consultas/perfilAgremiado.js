// src/consultas/perfilAgremiado.js
const express = require("express");
const router = express.Router();
const pool = require("../bd");

router.get("/", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Falta el parámetro email" });
    }
    const [rows] = await pool.query(
      `SELECT 
          u.id,
          u.numero_sindicalizado,
          u.correo_electronico,
          u.nombre,
          u.apellido_paterno,
          u.apellido_materno,
          u.genero,
          u.curp,
          u.telefono,
          u.fecha_nacimiento,
          pu.nombre AS puesto,
          pe.nombre AS programa_educativo,
          un.nombre AS universidad,
          u.numero_trabajador,
          ne.nombre AS nivel_educativo,
          u.rol,
          rs.nombre AS rol_sindicato,
          u.status,
          u.registro_completado,
          u.activacion_2fa,
          u.codigo_recuperacion_2fa,
          u.url_foto
       FROM usuarios u
       LEFT JOIN puestos_universidad pu ON u.puesto_id = pu.id
       LEFT JOIN programas_educativos pe ON u.programa_educativo_id = pe.id
       LEFT JOIN universidades un ON u.universidad_id = un.id
       LEFT JOIN niveles_educativos ne ON u.nivel_educativo_id = ne.id
       LEFT JOIN roles_sindicato rs ON u.rol_sindicato = rs.id
       WHERE u.correo_electronico = ?`,
      [email]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
