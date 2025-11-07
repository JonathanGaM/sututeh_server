const express = require("express");
const router = express.Router();
const pool = require("../bd");

// ==========================
// 📅 GET /api/notificaciones
// ==========================
router.get("/", async (req, res) => {
  try {
    // Forzar zona horaria del servidor
    await pool.execute("SET time_zone = '-06:00'");
    const ahora = new Date();

    const [reuniones] = await pool.query(`
      SELECT id, title, date, time, type, location, description, created_at
      FROM reuniones
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      ORDER BY date ASC, time ASC
    `);

    const notificaciones = [];

    for (const reunion of reuniones) {
      // Combinar fecha y hora correctamente con zona local
      const [hora, minutos, segundos] = reunion.time.split(":").map(Number);
      const fechaReunion = new Date(reunion.date);
      fechaReunion.setHours(hora, minutos, segundos, 0);

      const diffMs = fechaReunion.getTime() - ahora.getTime();
      const diffHoras = diffMs / (1000 * 60 * 60);
      const diffDias = diffHoras / 24;
      const diasDesdeCreacion =
        (ahora.getTime() - new Date(reunion.created_at).getTime()) /
        (1000 * 60 * 60 * 24);

      // Si la reunión ya pasó, no generar notificación
      if (diffHoras < 0) continue;

      // Fecha formateada legible
      const fechaTexto = fechaReunion.toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      // ===== 1️⃣ Nueva reunión creada (últimos 7 días)
      if (diasDesdeCreacion <= 7) {
        notificaciones.push({
          id: `nueva_${reunion.id}`,
          tipo_notificacion: "nueva_reunion",
          titulo: "Nueva reunión registrada",
          mensaje: `Se ha creado la reunión "${reunion.title}" para el ${fechaTexto} a las ${reunion.time}.`,
          reunion_id: reunion.id,
          reunion_titulo: reunion.title,
          reunion_fecha: reunion.date,
          reunion_hora: reunion.time,
          reunion_tipo: reunion.type,
          reunion_ubicacion: reunion.location,
          fecha_envio: reunion.created_at,
          es_nueva: true,
        });
      }

      // ===== 2️⃣ Recordatorio - 24 horas antes
      if (diffHoras <= 24 && diffHoras > 4) {
        notificaciones.push({
          id: `24h_${reunion.id}`,
          tipo_notificacion: "recordatorio_24h",
          titulo: "Recordatorio - Mañana",
          mensaje: `Mañana (${fechaTexto}) a las ${reunion.time} será la reunión "${reunion.title}" en ${reunion.location || "lugar pendiente"}.`,
          reunion_id: reunion.id,
          reunion_titulo: reunion.title,
          reunion_fecha: reunion.date,
          reunion_hora: reunion.time,
          reunion_tipo: reunion.type,
          reunion_ubicacion: reunion.location,
          fecha_envio: ahora.toISOString(),
          es_nueva: true,
        });
      }

      // ===== 3️⃣ Recordatorio - 4 horas antes
      if (diffHoras <= 4 && diffHoras >= 0) {
        notificaciones.push({
          id: `4h_${reunion.id}`,
          tipo_notificacion: "recordatorio_4h",
          titulo: "Recordatorio - Hoy",
          mensaje: `¡Hoy es la reunión "${reunion.title}"! Será a las ${reunion.time} en ${reunion.location || "el lugar asignado"}.`,
          reunion_id: reunion.id,
          reunion_titulo: reunion.title,
          reunion_fecha: reunion.date,
          reunion_hora: reunion.time,
          reunion_tipo: reunion.type,
          reunion_ubicacion: reunion.location,
          fecha_envio: ahora.toISOString(),
          es_nueva: true,
        });
      }
    }

    notificaciones.sort(
      (a, b) =>
        new Date(b.fecha_envio).getTime() - new Date(a.fecha_envio).getTime()
    );

    res.json({
      total: notificaciones.length,
      notificaciones,
    });
  } catch (error) {
    console.error("❌ Error al generar notificaciones:", error);
    res.status(500).json({ error: "Error al generar notificaciones" });
  }
});

// ==========================
// 🔸 GET /api/notificaciones/contador
// ==========================
router.get("/contador", async (req, res) => {
  try {
    await pool.execute("SET time_zone = '-06:00'");
    const [rows] = await pool.query(`
      SELECT COUNT(*) as total
      FROM reuniones
      WHERE CONCAT(date, ' ', time) >= NOW()
        AND date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
    `);
    const total = rows[0]?.total || 0;
    res.json({
      total_no_leidas: total,
      mensaje:
        total > 0
          ? `Tienes ${total} reuniones próximas esta semana`
          : "No hay reuniones próximas",
    });
  } catch (error) {
    console.error("Error al obtener contador:", error);
    res.status(500).json({ error: "Error al obtener contador" });
  }
});

module.exports = router;
