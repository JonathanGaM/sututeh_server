-- =====================================================
-- SCRUM-45: Sistema de gamificación - Tablas de puntos
-- Autor: Jonathan García Martínez
-- Fecha: 2025-01-18
-- Versión: v0.1.0
-- =====================================================

USE `dbsututeh`;

-- =====================================================
-- 1. Eliminar tablas existentes (si existen)
-- =====================================================
DROP TABLE IF EXISTS `puntos_historial`;
DROP TABLE IF EXISTS `puntos_saldo`;

-- =====================================================
-- 2. Crear tabla puntos_historial
-- =====================================================
CREATE TABLE `puntos_historial` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `referencia_id` int(11) NOT NULL COMMENT 'ID de la reunión o encuesta',
  `puntos` int(11) NOT NULL COMMENT '30 por asistencia, 20 por encuesta',
  `fecha` datetime DEFAULT current_timestamp(),
  `descripcion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_historial_usuario` (`usuario_id`),
  KEY `idx_referencia_id` (`referencia_id`),
  KEY `idx_fecha` (`fecha`),
  CONSTRAINT `fk_historial_usuario` FOREIGN KEY (`usuario_id`) 
    REFERENCES `perfil_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Registro histórico de puntos por participación';

-- =====================================================
-- 3. Crear tabla puntos_saldo
-- =====================================================
CREATE TABLE `puntos_saldo` (
  `usuario_id` int(11) NOT NULL,
  `total_puntos` int(11) DEFAULT 0 COMMENT 'Suma total de puntos del año actual',
  `actualizado_en` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `fk_saldo_usuario` FOREIGN KEY (`usuario_id`) 
    REFERENCES `perfil_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Saldo actual de puntos por usuario';

-- =====================================================
-- 4. Crear Stored Procedure sp_actualizar_puntos_usuario
-- =====================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_actualizar_puntos_usuario`$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_puntos_usuario`(
  IN p_usuario_id INT
)
BEGIN
  DECLARE v_anio INT DEFAULT YEAR(NOW());
  
  -- 1️⃣ Eliminar puntos previos del usuario del año actual
  DELETE FROM puntos_historial 
  WHERE usuario_id = p_usuario_id 
    AND YEAR(fecha) = v_anio;
  
  -- 2️⃣ Recalcular por asistencias (30 puntos)
  INSERT INTO puntos_historial (usuario_id, referencia_id, puntos, fecha, descripcion)
  SELECT 
    a.usuario_id, 
    a.reunion_id, 
    30, 
    a.registered_at, 
    'Asistencia a reunión'
  FROM asistencia a
  WHERE a.usuario_id = p_usuario_id
    AND a.puntaje >= 2
    AND YEAR(a.registered_at) = v_anio;
  
  -- 3️⃣ Recalcular por encuestas o votaciones (20 puntos)
  INSERT INTO puntos_historial (usuario_id, referencia_id, puntos, fecha, descripcion)
  SELECT 
    r.user_id, 
    r.encuesta_id, 
    20, 
    r.responded_at, 
    'Participación en encuesta o votación'
  FROM respuestas_encuesta r
  WHERE r.user_id = p_usuario_id
    AND YEAR(r.responded_at) = v_anio;
  
  -- 4️⃣ Actualizar el saldo total
  INSERT INTO puntos_saldo (usuario_id, total_puntos, actualizado_en)
  SELECT 
    p_usuario_id, 
    COALESCE(SUM(puntos), 0), 
    NOW()
  FROM puntos_historial
  WHERE usuario_id = p_usuario_id 
    AND YEAR(fecha) = v_anio
  ON DUPLICATE KEY UPDATE 
    total_puntos = VALUES(total_puntos),
    actualizado_en = NOW();
END$$

DELIMITER ;

-- =====================================================
-- 5. Inicializar saldo para usuarios existentes
-- =====================================================
INSERT INTO puntos_saldo (usuario_id, total_puntos, actualizado_en)
SELECT id, 0, NOW()
FROM perfil_usuarios
WHERE id NOT IN (SELECT usuario_id FROM puntos_saldo);

-- =====================================================
-- 6. Verificación
-- =====================================================
SELECT 'Tablas de puntos creadas correctamente' AS status;
SELECT COUNT(*) as total_usuarios FROM puntos_saldo;

-- =====================================================
-- Fin del script SCRUM-45
-- =====================================================