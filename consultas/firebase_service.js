// ========================================
// 📦 services/firebase_service.js
// ========================================

const admin = require('firebase-admin');
const path = require('path');
const pool = require('../bd');

// 🔥 Inicializar Firebase Admin SDK
const serviceAccountPath = path.join(__dirname, '../config/firebase-admin-key.json');

if (!admin.apps.length) {
  try {
    const serviceAccount = require(serviceAccountPath);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    console.log('✅ Firebase Admin SDK inicializado correctamente');
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin SDK:', error.message);
    console.error('Verifica que el archivo firebase-admin-key.json existe en server/config/');
  }
}

// ========================================
// 📤 ENVIAR NOTIFICACIÓN A UN USUARIO
// ========================================
async function enviarNotificacionUsuario(usuarioId, titulo, mensaje, datos = {}) {
  try {
    // Obtener token FCM del usuario
    const [rows] = await pool.query(
      'SELECT fcm_token FROM fcm_tokens WHERE usuario_id = ? AND activo = TRUE ORDER BY fecha_actualizacion DESC LIMIT 1',
      [usuarioId]
    );

    if (rows.length === 0) {
      console.log(`⚠️ Usuario ${usuarioId} no tiene token FCM`);
      return { success: false, error: 'No token found' };
    }

    const token = rows[0].fcm_token;

    // Preparar mensaje
    const message = {
      notification: {
        title: titulo,
        body: mensaje,
      },
      data: {
        ...Object.keys(datos).reduce((acc, key) => {
          acc[key] = String(datos[key]);
          return acc;
        }, {}),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        content_available: "true"
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'canal_sututeh',
          sound: 'default',
          color: '#4CAF50',
          icon: '@mipmap/ic_launcher',
        },
      },
      token: token,
    };

    // Enviar notificación
    const response = await admin.messaging().send(message);
    
    console.log(`✅ Notificación enviada a usuario ${usuarioId}:`, response);
    
    return { success: true, messageId: response };
    
  } catch (error) {
    console.error('❌ Error enviando notificación:', error.message);
    
    // Eliminar token inválido
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      await pool.query(
        'UPDATE fcm_tokens SET activo = FALSE WHERE usuario_id = ?',
        [usuarioId]
      );
      console.log(`🗑️ Token inválido eliminado para usuario ${usuarioId}`);
    }
    
    return { success: false, error: error.message };
  }
}

// ========================================
// 📤 ENVIAR NOTIFICACIÓN MASIVA
// ========================================
async function enviarNotificacionMasiva(usuariosIds, titulo, mensaje, datos = {}) {
  try {
    // Obtener tokens de todos los usuarios
    const placeholders = usuariosIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT DISTINCT fcm_token FROM fcm_tokens 
       WHERE usuario_id IN (${placeholders}) AND activo = TRUE AND fcm_token IS NOT NULL`,
      usuariosIds
    );

    if (rows.length === 0) {
      console.log('⚠️ No hay tokens válidos para enviar');
      return { success: false, error: 'No tokens found' };
    }

    const tokens = rows.map(row => row.fcm_token);

    // Preparar mensaje
    const message = {
      notification: {
        title: titulo,
        body: mensaje,
      },
      data: {
        ...Object.keys(datos).reduce((acc, key) => {
          acc[key] = String(datos[key]);
          return acc;
        }, {}),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'canal_sututeh',
          sound: 'default',
          color: '#4CAF50',
        },
      },
      tokens: tokens,
    };

    // Enviar a múltiples dispositivos
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`✅ Notificaciones enviadas: ${response.successCount} exitosas, ${response.failureCount} fallidas`);
    
    // Limpiar tokens inválidos
    if (response.failureCount > 0) {
      await limpiarTokensInvalidos(response.responses, tokens);
    }
    
    return { 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
    
  } catch (error) {
    console.error('❌ Error enviando notificaciones masivas:', error.message);
    return { success: false, error: error.message };
  }
}

// ========================================
// 🗑️ LIMPIAR TOKENS INVÁLIDOS
// ========================================
async function limpiarTokensInvalidos(responses, tokens) {
  const tokensInvalidos = [];
  
  responses.forEach((resp, idx) => {
    if (!resp.success) {
      const error = resp.error.code;
      if (error === 'messaging/invalid-registration-token' ||
          error === 'messaging/registration-token-not-registered') {
        tokensInvalidos.push(tokens[idx]);
      }
    }
  });

  if (tokensInvalidos.length > 0) {
    const placeholders = tokensInvalidos.map(() => '?').join(',');
    await pool.query(
      `UPDATE fcm_tokens SET activo = FALSE WHERE fcm_token IN (${placeholders})`,
      tokensInvalidos
    );
    console.log(`🗑️ Eliminados ${tokensInvalidos.length} tokens inválidos`);
  }
}

// ========================================
// 📤 NOTIFICACIONES ESPECÍFICAS POR TIPO
// ========================================

async function notificarNuevaReunion(reunion, usuariosIds) {
  const titulo = '📅 Nueva Reunión Programada';
  const mensaje = `${reunion.title} - ${reunion.date} a las ${reunion.time}`;
  
  const datos = {
    tipo: 'nueva_reunion',
    reunion_id: String(reunion.id),
    reunion_titulo: reunion.title,
    reunion_fecha: reunion.date,
    reunion_hora: reunion.time,
    reunion_ubicacion: reunion.location || '',
    reunion_tipo: reunion.type || '',
  };

  return await enviarNotificacionMasiva(usuariosIds, titulo, mensaje, datos);
}

async function notificarRecordatorio24h(reunion, usuariosIds) {
  const titulo = '⏰ Recordatorio: Reunión mañana';
  const mensaje = `Mañana: ${reunion.title} a las ${reunion.time}`;
  
  const datos = {
    tipo: 'recordatorio_24h',
    reunion_id: String(reunion.id),
    reunion_titulo: reunion.title,
    reunion_fecha: reunion.date,
    reunion_hora: reunion.time,
  };

  return await enviarNotificacionMasiva(usuariosIds, titulo, mensaje, datos);
}

async function notificarRecordatorio4h(reunion, usuariosIds) {
  const titulo = '🔔 ¡Reunión hoy!';
  const mensaje = `Hoy a las ${reunion.time}: ${reunion.title}`;
  
  const datos = {
    tipo: 'recordatorio_4h',
    reunion_id: String(reunion.id),
    reunion_titulo: reunion.title,
    reunion_hora: reunion.time,
  };

  return await enviarNotificacionMasiva(usuariosIds, titulo, mensaje, datos);
}

async function notificarCancelacion(reunion, usuariosIds) {
  const titulo = '❌ Reunión Cancelada';
  const mensaje = `La reunión "${reunion.title}" ha sido cancelada`;
  
  const datos = {
    tipo: 'cancelacion',
    reunion_id: String(reunion.id),
    reunion_titulo: reunion.title,
  };

  return await enviarNotificacionMasiva(usuariosIds, titulo, mensaje, datos);
}

// ========================================
// 📤 EXPORTAR FUNCIONES
// ========================================
module.exports = {
  enviarNotificacionUsuario,
  enviarNotificacionMasiva,
  notificarNuevaReunion,
  notificarRecordatorio24h,
  notificarRecordatorio4h,
  notificarCancelacion,
};