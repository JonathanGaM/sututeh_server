// src/consultas/encuestasVotaciones.js

const express = require('express');
const router = express.Router();
const pool   = require('../bd'); // Asumimos que tu bd.js ya expone un pool que soporta await pool.query()
const refreshSession = require('../config/refreshSession');

   
/**
 * 0) Crear encuesta/votación con preguntas y opciones (todo en uno)
 *
 *   
 *  Nota: 
 *  - Si es una “Votación”, el array `questions` puede tener preguntas del tipo 
 *    “¿Quién debería ser delegado?” con sus “options” (“Juan”, “María”, …).
 *  - El campo `questions` DEBE existir (aunque sea un array vacío) y cada pregunta 
 *    DEBE tener al menos 1 opción en su array `options`.
 */
router.post('/completo', async (req, res) => {
  try {
    const {
      type,
      title,
      description = null,
      publication_date,
      publication_time,
      close_date,
      close_time,
      questions
    } = req.body;

    // 1) Validación mínima de datos obligatorios
    if (
      !type ||
      !title ||
      !publication_date ||
      !publication_time ||
      !close_date ||
      !close_time ||
      !Array.isArray(questions)
    ) {
      return res.status(400).json({
        error:
          'Faltan campos obligatorios o “questions” no es un array. ' +
          'Asegúrate de enviar type, title, publication_date, publication_time, close_date, close_time y questions[].'
      });
    }

    // Cada pregunta debe tener “text” y un array “options”
    for (let i = 0; i < questions.length; i++) {
      const pq = questions[i];
      if (typeof pq.text !== 'string' || pq.text.trim() === '') {
        return res
          .status(400)
          .json({ error: `Pregunta #${i + 1} no tiene “text” válido.` });
      }
      if (
        !Array.isArray(pq.options) ||
        pq.options.length === 0 ||
        pq.options.some(
          (opt) => typeof opt !== 'string' || opt.trim() === ''
        )
      ) {
        return res.status(400).json({
          error: `Pregunta #${i + 1} debe tener un array “options” con al menos 1 texto no vacío.`
        });
      }
    }

    // 2) Insertar la encuesta/votación en la tabla principal
    const [resultEnc] = await pool.query(
      `
      INSERT INTO encuestas_votaciones
        (type, title, description, publication_date, publication_time, close_date, close_time)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        type,
        title,
        description,
        publication_date,
        publication_time,
        close_date,
        close_time
      ]
    );
    const encuestaId = resultEnc.insertId;

    // 3) Para cada pregunta: insertarla y luego sus opciones
    for (let i = 0; i < questions.length; i++) {
      const { text: preguntaText, options } = questions[i];

      // 3.1 Insertar la pregunta
      const [resultPreg] = await pool.query(
        `
        INSERT INTO preguntas_encuesta (encuesta_id, text)
        VALUES (?, ?)
        `,
        [encuestaId, preguntaText.trim()]
      );
      const preguntaId = resultPreg.insertId;

      // 3.2 Insertar todas las opciones de esta pregunta
      //     (usaremos un solo query con múltiples rows para eficiencia)
      const placeholders = options.map(() => '(?, ?)').join(', ');
      const values = [];
      options.forEach((optText) => {
        values.push(preguntaId, optText.trim());
      });

      await pool.query(
        `
        INSERT INTO opciones_encuesta (pregunta_id, text)
        VALUES ${placeholders}
        `,
        values
      );
    }

    // 4) Leer y devolver la encuesta completa recién creada (igual que en el GET)
    const [rows] = await pool.query(
      `
      SELECT
        e.id                    AS encuesta_id,
        e.type                  AS type,
        e.title                 AS title,
        e.description           AS description,
        e.publication_date      AS publicationDate,
        e.publication_time      AS publicationTime,
        e.close_date            AS closeDate,
        e.close_time            AS closeTime,
        CASE
          WHEN CONCAT(e.publication_date, ' ', e.publication_time) > NOW() THEN 'Programado'
          WHEN CONCAT(e.close_date,       ' ', e.close_time)       < NOW() THEN 'Cerrado'
          ELSE                                                              'Activo'
        END AS estado,
        e.created_at            AS encuestaCreatedAt,
        e.updated_at            AS encuestaUpdatedAt,

        p.id                    AS pregunta_id,
        p.text                  AS pregunta_text,
        p.created_at            AS preguntaCreatedAt,
        p.updated_at            AS preguntaUpdatedAt,

        o.id                    AS opcion_id,
        o.text                  AS opcion_text,
        o.created_at            AS opcionCreatedAt,
        o.updated_at            AS opcionUpdatedAt

      FROM encuestas_votaciones e
      LEFT JOIN preguntas_encuesta p
        ON p.encuesta_id = e.id
      LEFT JOIN opciones_encuesta o
        ON o.pregunta_id = p.id
      WHERE e.id = ?
      ORDER BY e.id, p.id, o.id
      `,
      [encuestaId]
    );

    // Reconstruir la estructura anidada
    const encuestaMap = {};
    rows.forEach((row) => {
      const eId = row.encuesta_id;
      if (!encuestaMap[eId]) {
        encuestaMap[eId] = {
          id:              eId,
          type:            row.type,
          title:           row.title,
          description:     row.description,
          publicationDate: row.publicationDate,
          publicationTime: row.publicationTime,
          closeDate:       row.closeDate,
          closeTime:       row.closeTime,
          estado:          row.estado,
          createdAt:       row.encuestaCreatedAt,
          updatedAt:       row.encuestaUpdatedAt,
          questions:       []
        };
        encuestaMap[eId]._pregMap = {};
      }

      if (row.pregunta_id) {
        const pregId = row.pregunta_id;
        const encObj = encuestaMap[eId];
        if (!encObj._pregMap[pregId]) {
          encObj._pregMap[pregId] = {
            id:        pregId,
            text:      row.pregunta_text,
            createdAt: row.preguntaCreatedAt,
            updatedAt: row.preguntaUpdatedAt,
            options:   []
          };
          encObj.questions.push(encObj._pregMap[pregId]);
        }

        if (row.opcion_id) {
          encObj._pregMap[pregId].options.push({
            id:        row.opcion_id,
            text:      row.opcion_text,
            createdAt: row.opcionCreatedAt,
            updatedAt: row.opcionUpdatedAt
          });
        }
      }
    });

    const resultado = Object.values(encuestaMap)[0];
    delete resultado._pregMap;

    return res.status(201).json(resultado);
  } catch (err) {
    console.error('Error en POST /encuestas-votaciones/completo:', err);
    return res.status(500).json({
      error: 'Error interno al crear encuesta/votación con preguntas y opciones.'
    });
  }
});


/**
 * 4) Obtener todas las encuestas/votaciones junto con sus preguntas y opciones
 *    GET /api/encuestas-votaciones
 *    Este endpoint hará un LEFT JOIN entre las tres tablas y luego
 *    armará en memoria la estructura anidada:
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        e.id                    AS encuesta_id,
        e.type                  AS type,
        e.title                 AS title,
        e.description           AS description,
        e.publication_date      AS publicationDate,
        e.publication_time      AS publicationTime,
        e.close_date            AS closeDate,
        e.close_time            AS closeTime,
        CASE
          WHEN CONCAT(e.publication_date, ' ', e.publication_time) > NOW() THEN 'Programado'
          WHEN CONCAT(e.close_date,       ' ', e.close_time)       < NOW() THEN 'Cerrado'
          ELSE                                                              'Activo'
        END AS estado,
        e.created_at            AS encuestaCreatedAt,
        e.updated_at            AS encuestaUpdatedAt,

        p.id                    AS pregunta_id,
        p.text                  AS pregunta_text,
        p.created_at            AS preguntaCreatedAt,
        p.updated_at            AS preguntaUpdatedAt,

        o.id                    AS opcion_id,
        o.text                  AS opcion_text,
        o.created_at            AS opcionCreatedAt,
        o.updated_at            AS opcionUpdatedAt

      FROM encuestas_votaciones e
      LEFT JOIN preguntas_encuesta p
        ON p.encuesta_id = e.id
      LEFT JOIN opciones_encuesta o
        ON o.pregunta_id = p.id
      ORDER BY e.id, p.id, o.id
      `
    );

    // Armamos la estructura anidada
    const encuestasMap = {};

    rows.forEach(row => {
      const eId = row.encuesta_id;
      if (!encuestasMap[eId]) {
        encuestasMap[eId] = {
          id:              eId,
          type:            row.type,
          title:           row.title,
          description:     row.description,
          publicationDate: row.publicationDate,
          publicationTime: row.publicationTime,
          closeDate:       row.closeDate,
          closeTime:       row.closeTime,
          estado:          row.estado,
          createdAt:       row.encuestaCreatedAt,
          updatedAt:       row.encuestaUpdatedAt,
          questions:       []
        };
        encuestasMap[eId]._preguntasMap = {};
      }

      if (row.pregunta_id) {
        const preguntaId = row.pregunta_id;
        const encuestaObj = encuestasMap[eId];

        if (!encuestaObj._preguntasMap[preguntaId]) {
          const nuevaPregunta = {
            id:        preguntaId,
            text:      row.pregunta_text,
            createdAt: row.preguntaCreatedAt,
            updatedAt: row.preguntaUpdatedAt,
            options:   []
          };
          encuestaObj.questions.push(nuevaPregunta);
          encuestaObj._preguntasMap[preguntaId] = nuevaPregunta;
        }

        if (row.opcion_id) {
          const preguntaObj = encuestaObj._preguntasMap[preguntaId];
          preguntaObj.options.push({
            id:        row.opcion_id,
            text:      row.opcion_text,
            createdAt: row.opcionCreatedAt,
            updatedAt: row.opcionUpdatedAt
          });
        }
      }
    });

    const resultado = Object.values(encuestasMap).map(enc => {
      delete enc._preguntasMap;
      return enc;
    });

    res.json(resultado);
  } catch (err) {
    console.error('Error al listar encuestas/votaciones:', err);
    res.status(500).json({ error: 'Error interno al obtener encuestas/votaciones.' });
  }
});

// GET /api/encuestas-votaciones/activas-usuario
// Devuelve solo encuestas/votaciones en estado “Activo” que este user no haya respondido
router.get('/activas-usuario', refreshSession, async (req, res) => {
  const usuarioId = req.user.sub;
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        e.id                   AS id,
        e.type                 AS type,
        e.title                AS title,
        e.description          AS description,
        e.publication_date     AS publicationDate,
        e.publication_time     AS publicationTime,
        e.close_date           AS closeDate,
        e.close_time           AS closeTime
      FROM encuestas_votaciones e
      LEFT JOIN respuestas_encuesta r
        ON r.encuesta_id = e.id
        AND r.user_id = ?
      WHERE
        -- filtro estado “Activo”:
        CONCAT(e.publication_date, ' ', e.publication_time) <= NOW()
        AND CONCAT(e.close_date, ' ', e.close_time) > NOW()
        -- plus, no debe haber ninguna respuesta de este usuario
        AND r.id IS NULL
      ORDER BY e.close_date ASC, e.close_time ASC
      `,
      [usuarioId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al listar encuestas activas sin responder:', err);
    res.status(500).json({ error: 'Error interno al obtener encuestas activas del usuario.' });
  }
});
// -----------------------------
// POST /api/respuestas
// Guarda las respuestas de un usuario a una encuesta/votación
// -----------------------------
router.post('/respuestas', refreshSession, async (req, res) => {
  const usuarioId = req.user.sub;
  const { encuesta_id, respuestas } = req.body;
  if (!encuesta_id || !Array.isArray(respuestas) || respuestas.length === 0) {
    return res.status(400).json({ error: 'Debe enviar encuesta_id y un arreglo de respuestas.' });
  }
  try {
    // Iniciamos transacción para asegurar consistencia
    await pool.query('START TRANSACTION');

    for (let { pregunta_id, opcion_id } of respuestas) {
      // Insertamos o actualizamos la respuesta del usuario
      await pool.query(
        `
        INSERT INTO respuestas_encuesta 
          (encuesta_id, pregunta_id, opcion_id, user_id)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE responded_at = NOW()
        `,
        [encuesta_id, pregunta_id, opcion_id, usuarioId]
      );
    }

    await pool.query('COMMIT');
    res.json({ message: 'Respuestas guardadas correctamente.' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error al guardar respuestas:', err);
    res.status(500).json({ error: 'No se pudieron registrar las respuestas.' });
  }
});

// GET /api/encuestas-votaciones/usuario/estado
// Devuelve todas las encuestas iniciadas (activa o terminada) con estado “Contestada” / “No contestada”
router.get(
  '/usuario/estado',
  refreshSession,
  async (req, res) => {
    const usuarioId = req.user.sub;
    try {
      const [rows] = await pool.query(
        `
        SELECT DISTINCT
          e.id                   AS id,
          e.type                 AS type,
          e.title                AS title,
          e.description          AS description,
          e.close_date           AS closeDate,
          CASE
            WHEN r.id IS NULL THEN 'No contestada'
            ELSE 'Contestada'
          END                    AS estado
        FROM encuestas_votaciones e
        LEFT JOIN respuestas_encuesta r
          ON r.encuesta_id = e.id
         AND r.user_id      = ?
        WHERE
          -- Que ya estén publicadas (activas o terminadas)
          CONCAT(e.publication_date, ' ', e.publication_time) <= NOW()
        ORDER BY e.close_date DESC, e.close_time DESC
        `,
        [usuarioId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error al listar estado de encuestas para el usuario:', err);
      res.status(500).json({ error: 'Error interno al obtener encuestas con estado.' });
    }
  }
);

// GET /api/encuestas-votaciones/:id/participantes
//  Devuelve datos de la encuesta y lista de usuarios que sí respondieron
router.get('/:id/participantes', async (req, res) => {
  const encuestaId = Number(req.params.id);
  if (!Number.isInteger(encuestaId)) {
    return res.status(400).json({ error: 'ID de encuesta inválido.' });
  }

  try {
    // 1) Datos de la encuesta
    const [enc] = await pool.query(
      `SELECT 
         id, type, title, description,
         publication_date     AS publicationDate,
         publication_time     AS publicationTime,
         close_date           AS closeDate,
         close_time           AS closeTime
       FROM encuestas_votaciones
       WHERE id = ?`,
      [encuestaId]
    );
    if (!enc.length) {
      return res.status(404).json({ error: 'Encuesta/Votación no encontrada.' });
    }

    // 2) Participantes
    const [part] = await pool.query(
      `SELECT
         u.id                     AS userId,
         u.nombre,
         u.apellido_paterno       AS apellidoPaterno,
         u.apellido_materno       AS apellidoMaterno,
         au.correo_electronico    AS email,
         r.pregunta_id            AS preguntaId,
         r.opcion_id              AS opcionId,
         r.responded_at           AS respondedAt
       FROM respuestas_encuesta r
       JOIN perfil_usuarios u    ON u.id       = r.user_id
       JOIN autenticacion_usuarios au ON au.id  = u.id
       WHERE r.encuesta_id = ?
         AND au.estatus = 'Activo'
       ORDER BY u.apellido_paterno, u.nombre, r.responded_at`,
      [encuestaId]
    );

    return res.json({
      encuesta: enc[0],
      participantes: part
    });
  } catch (err) {
    console.error('Error GET /participantes:', err);
    return res.status(500).json({ error: 'Error interno al obtener participantes.' });
  }
});

// GET /api/encuestas-votaciones/:id/no-participantes
//  Devuelve datos de la encuesta y lista de usuarios que NO respondieron
router.get('/:id/no-participantes', async (req, res) => {
  const encuestaId = Number(req.params.id);
  if (!Number.isInteger(encuestaId)) {
    return res.status(400).json({ error: 'ID de encuesta inválido.' });
  }

  try {
    // 1) Datos de la encuesta
    const [enc] = await pool.query(
      `SELECT 
         id, type, title, description,
         publication_date     AS publicationDate,
         publication_time     AS publicationTime,
         close_date           AS closeDate,
         close_time           AS closeTime
       FROM encuestas_votaciones
       WHERE id = ?`,
      [encuestaId]
    );
    if (!enc.length) {
      return res.status(404).json({ error: 'Encuesta/Votación no encontrada.' });
    }

    // 2) No-participantes
    const [noPart] = await pool.query(
      `SELECT
         u.id                  AS userId,
         u.nombre,
         u.apellido_paterno    AS apellidoPaterno,
         u.apellido_materno    AS apellidoMaterno,
         au.correo_electronico AS email
       FROM perfil_usuarios u
       JOIN autenticacion_usuarios au ON au.id = u.id
       WHERE au.estatus = 'Activo'
         AND u.id NOT IN (
           SELECT user_id
           FROM respuestas_encuesta
           WHERE encuesta_id = ?
         )
       ORDER BY u.apellido_paterno, u.nombre`,
      [encuestaId]
    );

    return res.json({
      encuesta: enc[0],
      noParticipantes: noPart
    });
  } catch (err) {
    console.error('Error GET /no-participantes:', err);
    return res.status(500).json({ error: 'Error interno al obtener no-participantes.' });
  }
});
/**
 * GET /api/encuestas-votaciones/:id/estadisticas
 *  – total de usuarios que respondieron la encuesta
 *  – para cada pregunta, cuántos votos recibió cada opción
 *  – además devuelve type, publication_date y publication_time
 */
router.get('/:id/estadisticas', async (req, res) => {
  const encuestaId = Number(req.params.id);
  if (!Number.isInteger(encuestaId)) {
    return res.status(400).json({ error: 'ID de encuesta inválido.' });
  }

  try {
    // 1) Validamos que exista y traemos los campos necesarios
    const [[enc]] = await pool.query(
      `
      SELECT
        id,
        type,
        title,
        publication_date     AS publicationDate,
        publication_time     AS publicationTime
      FROM encuestas_votaciones
      WHERE id = ?
      `,
      [encuestaId]
    );
    if (!enc) return res.status(404).json({ error: 'Encuesta no encontrada.' });

    // 2) Total de participantes distintos
    const [[{ totalRespondieron }]] = await pool.query(
      `
      SELECT COUNT(DISTINCT user_id) AS totalRespondieron
      FROM respuestas_encuesta
      WHERE encuesta_id = ?
      `,
      [encuestaId]
    );

    // 3) Estadísticas por pregunta y opción
    const [rows] = await pool.query(
      `
      SELECT
        p.id               AS preguntaId,
        p.text             AS preguntaText,
        o.id               AS opcionId,
        o.text             AS opcionText,
        COUNT(r.id)        AS votos
      FROM preguntas_encuesta p
      JOIN opciones_encuesta o
        ON o.pregunta_id = p.id
      LEFT JOIN respuestas_encuesta r
        ON r.pregunta_id = p.id
       AND r.opcion_id  = o.id
       AND r.encuesta_id = ?
      WHERE p.encuesta_id = ?
      GROUP BY p.id, o.id
      ORDER BY p.id, o.id
      `,
      [encuestaId, encuestaId]
    );

    // 4) Re-armado en estructura anidada
    const statsMap = {};
    rows.forEach(r => {
      if (!statsMap[r.preguntaId]) {
        statsMap[r.preguntaId] = {
          preguntaId:   r.preguntaId,
          preguntaText: r.preguntaText,
          opciones:     []
        };
      }
      statsMap[r.preguntaId].opciones.push({
        opcionId:   r.opcionId,
        opcionText: r.opcionText,
        votos:      r.votos
      });
    });

    // 5) Devolvemos todo junto
    return res.json({
      encuesta: {
        id:               enc.id,
        title:            enc.title,
        type:             enc.type,           // <-- aquí
        publicationDate:  enc.publicationDate, // <-- y aquí
        publicationTime:  enc.publicationTime  // <-- y aquí
      },
      totalRespondieron,
      preguntas: Object.values(statsMap)
    });
  } catch (err) {
    console.error('Error GET /estadisticas:', err);
    res.status(500).json({ error: 'Error interno obteniendo estadísticas.' });
  }
});
// EDITAR encuesta/votación (sin auth para admin)
router.put('/:id', async (req, res) => {
  let conn;
  try {
    const encuestaId = Number(req.params.id);
    if (!encuestaId) 
      return res.status(400).json({ error: 'ID inválido.' });

    const {
      type,
      title,
      description = null,
      publication_date,
      publication_time,
      close_date,
      close_time,
      questions
    } = req.body;

    if (
      !type || !title ||
      !publication_date || !publication_time ||
      !close_date   || !close_time ||
      !Array.isArray(questions)
    ) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1) Actualizar datos principales
    await conn.query(
      `UPDATE encuestas_votaciones
         SET type=?, title=?, description=?, publication_date=?, publication_time=?,
             close_date=?, close_time=?, updated_at=NOW()
       WHERE id=?`,
      [type, title, description, publication_date, publication_time, close_date, close_time, encuestaId]
    );

    // 2) Borrar preguntas y opciones antiguas
    await conn.query(
      `DELETE o FROM opciones_encuesta o
         JOIN preguntas_encuesta p ON p.id=o.pregunta_id
       WHERE p.encuesta_id=?`,
      [encuestaId]
    );
    await conn.query(
      `DELETE FROM preguntas_encuesta WHERE encuesta_id=?`,
      [encuestaId]
    );

    // 3) Insertar preguntas y opciones nuevas
    for (let { text, options } of questions) {
      const [r] = await conn.query(
        `INSERT INTO preguntas_encuesta (encuesta_id, text) VALUES (?, ?)`,
        [encuestaId, text.trim()]
      );
      const preguntaId = r.insertId;

      if (Array.isArray(options) && options.length) {
        const ph = options.map(() => '(?, ?)').join(', ');
        const vals = [];
        options.forEach(opt => vals.push(preguntaId, opt.trim()));
        await conn.query(
          `INSERT INTO opciones_encuesta (pregunta_id, text) VALUES ${ph}`,
          vals
        );
      }
    }

    await conn.commit();
    conn.release();

    res.json({ message: 'Encuesta actualizada correctamente', id: encuestaId });
  } catch (err) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno al editar encuesta.' });
  }
});
// DELETE /api/encuestas-votaciones/:id
// Elimina encuesta/votación y todo su contenido relacionado
router.delete('/:id', async (req, res) => {
  const encuestaId = Number(req.params.id);
  if (!Number.isInteger(encuestaId)) {
    return res.status(400).json({ error: 'ID de encuesta inválido.' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1) Borrar respuestas de usuarios
    await conn.query(
      `DELETE FROM respuestas_encuesta WHERE encuesta_id = ?`,
      [encuestaId]
    );
    // 2) Borrar opciones de cada pregunta
    await conn.query(
      `DELETE o FROM opciones_encuesta o
         JOIN preguntas_encuesta p ON p.id = o.pregunta_id
       WHERE p.encuesta_id = ?`,
      [encuestaId]
    );
    // 3) Borrar preguntas
    await conn.query(
      `DELETE FROM preguntas_encuesta WHERE encuesta_id = ?`,
      [encuestaId]
    );
    // 4) Borrar la encuesta/votación
    const [result] = await conn.query(
      `DELETE FROM encuestas_votaciones WHERE id = ?`,
      [encuestaId]
    );

    await conn.commit();
    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada.' });
    }
    res.json({ message: 'Encuesta/votación eliminada correctamente.' });
  } catch (err) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    console.error('Error al eliminar encuesta:', err);
    res.status(500).json({ error: 'Error interno al eliminar encuesta.' });
  }
});


module.exports = router;
