// consultas/asistencia_mobile.js
const express = require("express");
const router = express.Router();
const pool = require("../bd");
const verifyMobileToken = require("../middlewares/verifyMobileToken");

// 📌 POST /api/mobile/asistencia/:reunionId
router.post("/asistencia/:reunionId", verifyMobileToken, async (req, res) => {
  try {
    const reunionId = req.params.reunionId;
    const usuarioId = req.user.sub; // viene del JWT móvil

    // 1️⃣ Verificar reunión
    const [reunion] = await pool.query(
      "SELECT * FROM reuniones WHERE id = ?",
      [reunionId]
    );

    if (reunion.length === 0) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }

    // 2️⃣ Evitar duplicados
    const [existe] = await pool.query(
      "SELECT * FROM asistencia WHERE usuario_id = ? AND reunion_id = ?",
      [usuarioId, reunionId]
    );

    if (existe.length > 0) {
      return res.status(400).json({ error: "Ya registraste tu asistencia" });
    }

    // 3️⃣ Insertar asistencia
    await pool.query(
      "INSERT INTO asistencia (usuario_id, reunion_id, registered_at, estado_asistencia, puntaje) VALUES (?, ?, NOW(), 'asistencia_completa', 3)",
      [usuarioId, reunionId]
    );

    return res.json({
      estado: "asistencia_completa",
      puntaje: 3,
    });

  } catch (error) {
    console.error("❌ Error asistencia móvil:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
