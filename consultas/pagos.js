
const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference } = require('mercadopago');
const refreshSession = require('../config/refreshSession');
const db = require('../bd');

const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.sub) {
    return res.status(401).json({ error: 'Usuario no autenticado.' });
  }
  next();
};

// Configura Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// POST /api/pagos - AHORA CON PROTECCIÓN
router.post('/', refreshSession, requireAuth, async (req, res) => {
  try {
    const usuario_id = req.user.sub; // Obtener ID del usuario autenticado
    const { boletos, total, rifa_id } = req.body;

    console.log('Usuario autenticado:', usuario_id);
    console.log('Datos recibidos:', { boletos, total, rifa_id });

    if (!boletos || boletos.length === 0 || !total || !rifa_id) {
      return res.status(400).json({ error: 'Datos incompletos para generar el pago.' });
    }

    const preference = {
      items: [
        {
          title: `Compra de ${boletos.length} boletos`,
          quantity: 1,
          unit_price: total,
          currency_id: 'MXN'
        }
      ],
      back_urls: {
        success: 'https://sututeh.com/rifas',
        failure: 'https://sututeh.com/rifas',
        pending: 'https://sututeh.com/rifas'
      },
      auto_return: 'approved',
      metadata: {
        usuario_id: usuario_id,
        rifa_id: rifa_id,
        boletos: boletos
      }
    };

    const preferenceInstance = new Preference(client);
    const result = await preferenceInstance.create({ body: preference });

    res.status(200).json({ init_point: result.init_point });
  } catch (err) {
    console.error('Error al generar preferencia:', err);
    res.status(500).json({ error: 'Error al generar el link de pago.' });
  }
});

// Guardar pagos en la base de datos
router.post('/guardar', refreshSession, requireAuth, async (req, res) => {
  try {
    const usuario_id = req.user.sub;
    const { rifa_id, boletos, total, estado } = req.body;

    if (!rifa_id || !boletos || !Array.isArray(boletos) || !total || !estado) {
      return res.status(400).json({ error: 'Datos incompletos para guardar la compra' });
    }

    const estadosValidos = ['pendiente', 'aprobado', 'rechazado'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    await db.query(`
      INSERT INTO compras (usuario_id, rifa_id, boletos, total, estado)
      VALUES (?, ?, ?, ?, ?)
    `, [usuario_id, rifa_id, JSON.stringify(boletos), total, estado]);

    res.status(200).json({ message: 'Compra registrada con éxito' });
  } catch (err) {
    console.error('Error al guardar la compra:', err);
    res.status(500).json({ error: 'Error al guardar la compra' });
  }
});

// Webhook de Mercado Pago
router.post('/webhook', async (req, res) => {
  try {
    const { id, topic } = req.body;

    if (topic === 'payment') {
      const payment = await client.payment.get({ id });
      const { status, metadata } = payment;

      const { usuario_id, rifa_id, boletos } = metadata;

      await db.query(`
        UPDATE compras
        SET estado = ?
        WHERE usuario_id = ? AND rifa_id = ? AND boletos = ?
      `, [
        status === 'approved' ? 'aprobado' :
        status === 'rejected' ? 'rechazado' : 'pendiente',
        usuario_id,
        rifa_id,
        JSON.stringify(boletos)
      ]);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error en el webhook:', err);
    res.status(500).send('Error');
  }
});

module.exports = router;