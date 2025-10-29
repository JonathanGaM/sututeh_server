// =====================================================
// SCRUM-46: Endpoints para sistema de logros
// Descripción: API para consultar logros del usuario
// Autor: Jonathan García Martínez / Jesus Israel Escudero Reyes
// Versión: v2.0.1 - Corregido orden de ejecución
// =====================================================
const express = require("express");
const router = express.Router();
const pool = require("../bd");

router.get("/usuario/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ 1. PRIMERO configurar UTF-8
    await pool.query("SET NAMES utf8mb4");

    // ✅ 2. DESPUÉS evaluar logros
    await pool.query("CALL sp_evaluar_logros_usuario(?)", [id]);

    // ✅ 3. Consultar logros con progreso
    const [logros] = await pool.query(
      `SELECT 
        lc.id,
        lc.nombre,
        lc.descripcion,
        lc.icono,
        lc.tipo,
        lc.meta,
        COALESCE(lu.progreso, 0) AS progreso,
        COALESCE(lu.completado, 0) AS completado,
        DATE_FORMAT(lu.fecha_obtencion, '%d/%m/%Y %H:%i') AS fecha_obtencion,
        ROUND((COALESCE(lu.progreso, 0) / lc.meta) * 100, 2) AS porcentaje
      FROM logros_catalogo lc
      LEFT JOIN logros_usuario lu ON lc.id = lu.logro_id AND lu.usuario_id = ?
      WHERE lc.estado = 'activo'
      ORDER BY lu.completado DESC, porcentaje DESC`,
      [id]
    );

    // ✅ 4. Separar obtenidos y en progreso
    const obtenidos = logros.filter(l => l.completado === 1);
    const enProgreso = logros.filter(l => l.completado === 0);

    res.json({
      success: true,
      total_logros: logros.length,
      total_obtenidos: obtenidos.length,
      obtenidos,
      enProgreso
    });
  } catch (error) {
    console.error("❌ Error al obtener logros:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener logros del usuario",
      error: error.message // ← Para debug
    });
  }
});

module.exports = router;

