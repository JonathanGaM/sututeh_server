const express = require("express");
const router = express.Router();
const pool = require("../bd");
const verifyMobileToken = require("../middlewares/verifyMobileToken");

// ✅ POST /api/reuniones/:id/asistencia
router.post("/reuniones/:id/asistencia", verifyMobileToken, async (req, res) => {
  try {
    const reunionId = req.params.id;
    const usuarioId = req.user.sub;

    // 🔍 Verificar si la reunión existe
    const [reunion] = await pool.query("SELECT * FROM reuniones WHERE id = ?", [reunionId]);
    if (reunion.length === 0) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }

    // 🔒 Evitar duplicados
    const [existe] = await pool.query(
      "SELECT * FROM asistencias WHERE usuario_id = ? AND reunion_id = ?",
      [usuarioId, reunionId]
    );
    if (existe.length > 0) {
      return res.status(400).json({ error: "Ya registraste tu asistencia a esta reunión" });
    }

    // 📝 Registrar asistencia
    await pool.query(
      "INSERT INTO asistencias (usuario_id, reunion_id, fecha_asistencia) VALUES (?, ?, NOW())",
      [usuarioId, reunionId]
    );

    res.json({ estado: "Asistencia registrada correctamente", puntaje: 10 });
  } catch (err) {
    console.error("Error registrando asistencia:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
