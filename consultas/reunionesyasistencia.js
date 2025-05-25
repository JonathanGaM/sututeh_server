// consultas/reunionesyasistencia.js
const express = require('express');
const router  = express.Router();
const pool    = require('../bd');  // tu pool.promise()

// POST /api/reuniones
router.post('/', async (req, res) => {
  try {
    const { title, date, time, type, location, description } = req.body;
    // 1) Inserta
    const [result] = await pool.query(
      `INSERT INTO reuniones 
         (title, date, time, type, location, description)
       VALUES (?,?,?,?,?,?)`,
      [title, date, time, type, location, description]
    );
    const newId = result.insertId;
    // 2) Lee de vuelta el registro completo
    const [rows] = await pool.query(
      `SELECT id, title, date, time, type, location, description
         FROM reuniones
        WHERE id = ?`,
      [ newId ]
    );
    // 3) Devuélvelo al cliente
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No pude crear la reunión' });
  }
});
/**
 * GET /api/reuniones
 * Devuelve todas las reuniones, con un campo status calculado
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         CASE
           WHEN CONCAT(date, ' ', time) > NOW() THEN 'Programada'
           WHEN NOW() BETWEEN CONCAT(date, ' ', time)
                         AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 1 HOUR)
             THEN 'En Curso'
           ELSE 'Terminada'
         END AS status
       FROM reuniones
       ORDER BY date DESC, time DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener reuniones:', error);
    res.status(500).json({ error: 'Error interno al obtener reuniones.' });
  }
});

/**
 * GET /api/reuniones/:id
 * Devuelve una reunión específica con su status
 */
router.get('/:id', async (req, res) => {
  const meetingId = req.params.id;
  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         CASE
           WHEN CONCAT(date, ' ', time) > NOW() THEN 'Programada'
           WHEN NOW() BETWEEN CONCAT(date, ' ', time)
                         AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 1 HOUR)
             THEN 'En Curso'
           ELSE 'Terminada'
         END AS status
       FROM reuniones
       WHERE id = ?`,
      [meetingId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener reunión:', error);
    res.status(500).json({ error: 'Error interno al obtener la reunión.' });
  }
});
/**
 * PUT /api/reuniones/:id
 * Actualiza los datos de una reunión y devuelve la reunión actualizada con su status
 */
router.put('/:id', async (req, res) => {
  const meetingId = req.params.id;
  const { title, date, time, type, location, description } = req.body;

  try {
    // 1) Actualiza el registro
    await pool.query(
      `UPDATE reuniones
         SET title       = ?,
             date        = ?,
             time        = ?,
             type        = ?,
             location    = ?,
             description = ?
       WHERE id = ?`,
      [title, date, time, type, location, description, meetingId]
    );

    // 2) Vuelve a leer el registro completo, incluyendo el status calculado
    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         date,
         time,
         type,
         location,
         description,
         CASE
           WHEN CONCAT(date, ' ', time) > NOW() THEN 'Programada'
           WHEN NOW() BETWEEN CONCAT(date, ' ', time)
                         AND DATE_ADD(CONCAT(date, ' ', time), INTERVAL 1 HOUR)
             THEN 'En Curso'
           ELSE 'Terminada'
         END AS status
       FROM reuniones
       WHERE id = ?`,
      [meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }

    // 3) Devuélvelo al cliente
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al actualizar reunión:', err);
    res.status(500).json({ error: 'Error interno al actualizar la reunión.' });
  }
});



module.exports = router;
