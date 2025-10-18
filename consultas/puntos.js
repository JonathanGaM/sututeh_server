const express = require("express");
const router = express.Router();
const pool = require("../bd");

// ✅ Obtener los puntos e historial del usuario logueado
router.get("/usuario/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Total de puntos del usuario
    const [saldo] = await pool.query(
      "SELECT total_puntos, actualizado_en FROM puntos_saldo WHERE usuario_id = ?",
      [id]
    );

    // Historial de puntos (ordenado del más reciente al más antiguo)
    const [historial] = await pool.query(
      "SELECT descripcion AS actividad, DATE_FORMAT(fecha, '%d/%m/%Y') AS fecha, CONCAT('+', puntos) AS puntos FROM puntos_historial WHERE usuario_id = ? ORDER BY fecha DESC",
      [id]
    );

    // Si no tiene puntos aún
    const totalPuntos = saldo.length > 0 ? saldo[0].total_puntos : 0;

    res.json({
      success: true,
      totalPuntos,
      actualizado_en: saldo.length > 0 ? saldo[0].actualizado_en : null,
      historial,
    });
  } catch (error) {
    console.error("Error al obtener puntos del usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener puntos del usuario",
    });
  }
});

module.exports = router;
