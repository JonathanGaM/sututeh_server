const express = require("express");
const router = express.Router();
const pool = require("../bd");
const firebaseService = require("../consultas/firebase_service");

// ==========================
// 📅 GET /api/notificaciones
// ==========================
router.get("/", async (req, res) => {
  try {
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
      const [hora, minutos, segundos] = reunion.time.split(":").map(Number);
      const fechaReunion = new Date(reunion.date);
      fechaReunion.setHours(hora, minutos, segundos, 0);

      const diffMs = fechaReunion.getTime() - ahora.getTime();
      const diffHoras = diffMs / (1000 * 60 * 60);
      const diasDesdeCreacion =
        (ahora.getTime() - new Date(reunion.created_at).getTime()) /
        (1000 * 60 * 60 * 24);

      if (diffHoras < 0) continue;

      const fechaTexto = fechaReunion.toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      // 1️⃣ Nueva reunión creada (últimos 7 días)
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

      // 2️⃣ Recordatorio - 24 horas antes
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

      // 3️⃣ Recordatorio - 4 horas antes
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

// ==========================
// 🔥 NUEVOS ENDPOINTS PARA PUSH NOTIFICATIONS
// ==========================

// 🧪 Enviar notificación de prueba
router.post("/test", async (req, res) => {
  try {
    const { usuario_id } = req.body;

    if (!usuario_id) {
      return res.status(400).json({ error: "usuario_id es requerido" });
    }

    const resultado = await firebaseService.enviarNotificacionUsuario(
      usuario_id,
      "🧪 Notificación de Prueba",
      "Si ves esto, las notificaciones push funcionan correctamente ✅",
      { tipo: "test", timestamp: new Date().toISOString() }
    );

    res.json(resultado);
  } catch (error) {
    console.error("Error en test:", error);
    res.status(500).json({ error: error.message });
  }
});

// 📅 Enviar notificación de nueva reunión
router.post("/enviar-nueva-reunion", async (req, res) => {
  try {
    const { reunion_id, usuarios_ids } = req.body;

    if (!reunion_id || !usuarios_ids || usuarios_ids.length === 0) {
      return res.status(400).json({ 
        error: "reunion_id y usuarios_ids son requeridos" 
      });
    }

    // Obtener datos de la reunión
    const [reuniones] = await pool.query(
      "SELECT * FROM reuniones WHERE id = ?",
      [reunion_id]
    );

    if (reuniones.length === 0) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }

    const reunion = reuniones[0];
    const resultado = await firebaseService.notificarNuevaReunion(
      reunion,
      usuarios_ids
    );

    res.json(resultado);
  } catch (error) {
    console.error("Error enviando notificación:", error);
    res.status(500).json({ error: error.message });
  }
});

// ⏰ Enviar recordatorio 24h
router.post("/enviar-recordatorio-24h", async (req, res) => {
  try {
    const { reunion_id, usuarios_ids } = req.body;

    const [reuniones] = await pool.query(
      "SELECT * FROM reuniones WHERE id = ?",
      [reunion_id]
    );

    if (reuniones.length === 0) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }

    const reunion = reuniones[0];
    const resultado = await firebaseService.notificarRecordatorio24h(
      reunion,
      usuarios_ids
    );

    res.json(resultado);
  } catch (error) {
    console.error("Error enviando recordatorio:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🔔 Enviar recordatorio 4h
router.post("/enviar-recordatorio-4h", async (req, res) => {
  try {
    const { reunion_id, usuarios_ids } = req.body;

    const [reuniones] = await pool.query(
      "SELECT * FROM reuniones WHERE id = ?",
      [reunion_id]
    );

    if (reuniones.length === 0) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }

    const reunion = reuniones[0];
    const resultado = await firebaseService.notificarRecordatorio4h(
      reunion,
      usuarios_ids
    );

    res.json(resultado);
  } catch (error) {
    console.error("Error enviando recordatorio:", error);
    res.status(500).json({ error: error.message });
  }
});

// 📤 Notificación personalizada
router.post("/personalizada", async (req, res) => {
  try {
    const { usuarios_ids, titulo, mensaje, datos } = req.body;

    if (!usuarios_ids || !titulo || !mensaje) {
      return res.status(400).json({ 
        error: "usuarios_ids, titulo y mensaje son requeridos" 
      });
    }

    const resultado = await firebaseService.enviarNotificacionMasiva(
      usuarios_ids,
      titulo,
      mensaje,
      datos || {}
    );

    res.json(resultado);
  } catch (error) {
    console.error("Error enviando notificación personalizada:", error);
    res.status(500).json({ error: error.message });
  }
});

// 📊 Obtener todos los usuarios con tokens activos
router.get("/usuarios-con-tokens", async (req, res) => {
  try {
    const [usuarios] = await pool.query(`
      SELECT DISTINCT u.id, u.email, u.nombre_completo, ft.fcm_token
      FROM usuarios u
      INNER JOIN fcm_tokens ft ON u.id = ft.usuario_id
      WHERE ft.activo = TRUE
    `);

    res.json({
      total: usuarios.length,
      usuarios,
    });
  } catch (error) {
    console.error("Error obteniendo usuarios con tokens:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;