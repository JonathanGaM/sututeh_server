// server/consultas/ranking.js
const express = require("express");
const pool = require("../bd");

const router = express.Router();

// 🏆 GET /api/ranking/top10 - Obtener top 10 agremiados
router.get("/top10", async (req, res) => {
  try {
    const [ranking] = await pool.query(`
      SELECT 
        ps.usuario_id,
        CONCAT(p.nombre, ' ', p.apellido_paterno, ' ', p.apellido_materno) AS nombre_completo,
        ps.total_puntos AS puntos_totales,
        CASE 
          WHEN ps.total_puntos >= 3001 THEN 'Diamante'
          WHEN ps.total_puntos >= 1501 THEN 'Oro'
          WHEN ps.total_puntos >= 501 THEN 'Plata'
          ELSE 'Bronce'
        END AS nivel
      FROM puntos_saldo ps
      JOIN perfil_usuarios p ON ps.usuario_id = p.id
      JOIN autenticacion_usuarios au ON p.id = au.id
      WHERE au.estatus = 'Activo'
      ORDER BY ps.total_puntos DESC, p.antiguedad ASC
      LIMIT 10
    `);

    res.json(ranking);
  } catch (error) {
    console.error("Error al obtener top 10:", error);
    res.status(500).json({ error: "Error al obtener ranking" });
  }
});

// 📍 GET /api/ranking/posicion/:userId - Obtener posición de un usuario
router.get("/posicion/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const [[userRanking]] = await pool.query(`
      SELECT 
        ps.usuario_id,
        ps.total_puntos AS puntos_totales,
        CASE 
          WHEN ps.total_puntos >= 3001 THEN 'Diamante'
          WHEN ps.total_puntos >= 1501 THEN 'Oro'
          WHEN ps.total_puntos >= 501 THEN 'Plata'
          ELSE 'Bronce'
        END AS nivel,
        (
          SELECT COUNT(*) + 1 
          FROM puntos_saldo ps2 
          JOIN autenticacion_usuarios au2 ON ps2.usuario_id = au2.id
          WHERE ps2.total_puntos > ps.total_puntos 
          AND au2.estatus = 'Activo'
        ) AS posicion,
        (
          SELECT COUNT(*) 
          FROM puntos_saldo ps3
          JOIN autenticacion_usuarios au3 ON ps3.usuario_id = au3.id
          WHERE au3.estatus = 'Activo'
        ) AS totalAgremiados,
        CASE 
          WHEN ps.total_puntos >= 3001 THEN NULL
          WHEN ps.total_puntos >= 1501 THEN 3001
          WHEN ps.total_puntos >= 501 THEN 1501
          ELSE 501
        END AS puntos_siguiente_nivel
      FROM puntos_saldo ps
      JOIN autenticacion_usuarios au ON ps.usuario_id = au.id
      WHERE ps.usuario_id = ? AND au.estatus = 'Activo'
    `, [userId]);

    if (!userRanking) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json(userRanking);
  } catch (error) {
    console.error("Error al obtener posición del usuario:", error);
    res.status(500).json({ error: "Error al obtener posición" });
  }
});

// 📊 GET /api/ranking/general - Obtener ranking completo (paginado)
router.get("/general", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    const [ranking] = await pool.query(`
      SELECT 
        ps.usuario_id,
        CONCAT(p.nombre, ' ', p.apellido_paterno, ' ', p.apellido_materno) AS nombre_completo,
        ps.total_puntos AS puntos_totales,
        CASE 
          WHEN ps.total_puntos >= 3001 THEN 'Diamante'
          WHEN ps.total_puntos >= 1501 THEN 'Oro'
          WHEN ps.total_puntos >= 501 THEN 'Plata'
          ELSE 'Bronce'
        END AS nivel,
        @rownum := @rownum + 1 AS posicion
      FROM puntos_saldo ps
      JOIN perfil_usuarios p ON ps.usuario_id = p.id
      JOIN autenticacion_usuarios au ON p.id = au.id,
      (SELECT @rownum := 0) r
      WHERE au.estatus = 'Activo'
      ORDER BY ps.total_puntos DESC, p.antiguedad ASC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    // Total de agremiados
    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total 
      FROM puntos_saldo ps
      JOIN autenticacion_usuarios au ON ps.usuario_id = au.id
      WHERE au.estatus = 'Activo'
    `);

    res.json({
      ranking,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error al obtener ranking general:", error);
    res.status(500).json({ error: "Error al obtener ranking" });
  }
});

module.exports = router;