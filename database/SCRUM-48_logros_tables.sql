-- =============================================
-- SCRUM-48: Tablas de logros_catalogo y logros_usuario
-- Versión: v0.3.0
-- Fecha: 2025-01-24
-- Autor: Jonathan García Martínez
-- =============================================

USE `dbsututeh`;

-- =============================================
-- Tabla: logros_catalogo
-- Descripción: Catálogo de logros disponibles
-- =============================================
CREATE TABLE IF NOT EXISTS `logros_catalogo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL COMMENT 'Nombre del logro',
  `descripcion` text DEFAULT NULL COMMENT 'Descripción del logro',
  `icono` varchar(50) DEFAULT NULL COMMENT 'Emoji del logro',
  `tipo` enum('asistencia','votacion','encuesta','puntos') NOT NULL COMMENT 'Categoría del logro',
  `meta` int(11) NOT NULL COMMENT 'Valor necesario para completar',
  `estado` enum('activo','inactivo') DEFAULT 'activo',
  `fecha_creacion` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tipo_estado` (`tipo`,`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Catálogo de logros disponibles';

-- =============================================
-- Tabla: logros_usuario
-- Descripción: Logros obtenidos y en progreso de cada usuario
-- =============================================
CREATE TABLE IF NOT EXISTS `logros_usuario` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `logro_id` int(11) NOT NULL,
  `progreso` int(11) DEFAULT 0 COMMENT 'Valor actual (ej: 3 de 6 meses)',
  `completado` tinyint(1) DEFAULT 0 COMMENT '0=En progreso, 1=Completado',
  `fecha_obtencion` datetime DEFAULT NULL COMMENT 'Cuándo completó el logro',
  `fecha_inicio` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuario_logro` (`usuario_id`,`logro_id`),
  KEY `fk_logro_usuario` (`usuario_id`),
  KEY `fk_logro_catalogo` (`logro_id`),
  KEY `idx_completado` (`completado`),
  CONSTRAINT `fk_logro_catalogo` FOREIGN KEY (`logro_id`) REFERENCES `logros_catalogo` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_logro_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `perfil_usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Logros obtenidos y en progreso de cada usuario';

-- =============================================
-- Stored Procedure: sp_evaluar_logros_usuario
-- Descripción: Evalúa y actualiza los logros de un usuario
-- Parámetros: p_usuario_id (INT) - ID del usuario
-- =============================================
DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_evaluar_logros_usuario`$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_evaluar_logros_usuario`(IN p_usuario_id INT)
BEGIN
  DECLARE v_meses_sin_faltas INT DEFAULT 0;
  DECLARE v_total_votos INT DEFAULT 0;
  DECLARE v_total_encuestas INT DEFAULT 0;
  DECLARE v_total_puntos INT DEFAULT 0;

  -- ========== CALCULAR MÉTRICAS ==========
  
  -- 1. Contar meses sin faltas (últimos 6 meses)
  SELECT COUNT(DISTINCT DATE_FORMAT(registered_at, '%Y-%m'))
  INTO v_meses_sin_faltas
  FROM asistencia
  WHERE usuario_id = p_usuario_id
    AND estado_asistencia IN ('asistencia_completa', 'retardo')
    AND registered_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH);

  -- 2. Contar votaciones (del historial de puntos)
  SELECT COUNT(*)
  INTO v_total_votos
  FROM puntos_historial
  WHERE usuario_id = p_usuario_id
    AND descripcion LIKE '%votación%';

  -- 3. Contar encuestas
  SELECT COUNT(*)
  INTO v_total_encuestas
  FROM puntos_historial
  WHERE usuario_id = p_usuario_id
    AND descripcion LIKE '%encuesta%';

  -- 4. Total de puntos
  SELECT COALESCE(total_puntos, 0)
  INTO v_total_puntos
  FROM puntos_saldo
  WHERE usuario_id = p_usuario_id;

  -- ========== ACTUALIZAR LOGROS ==========
  
  -- Logro 1: Asistente Comprometido (3 meses)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 1, v_meses_sin_faltas, IF(v_meses_sin_faltas >= 3, 1, 0), IF(v_meses_sin_faltas >= 3, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_meses_sin_faltas,
    completado = IF(v_meses_sin_faltas >= 3, 1, completado),
    fecha_obtencion = IF(v_meses_sin_faltas >= 3 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 2: Asistencia Perfecta (6 meses)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 2, v_meses_sin_faltas, IF(v_meses_sin_faltas >= 6, 1, 0), IF(v_meses_sin_faltas >= 6, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_meses_sin_faltas,
    completado = IF(v_meses_sin_faltas >= 6, 1, completado),
    fecha_obtencion = IF(v_meses_sin_faltas >= 6 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 3: Votante Principiante (5 votos)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 3, v_total_votos, IF(v_total_votos >= 5, 1, 0), IF(v_total_votos >= 5, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_votos,
    completado = IF(v_total_votos >= 5, 1, completado),
    fecha_obtencion = IF(v_total_votos >= 5 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 4: Votante Activo (15 votos)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 4, v_total_votos, IF(v_total_votos >= 15, 1, 0), IF(v_total_votos >= 15, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_votos,
    completado = IF(v_total_votos >= 15, 1, completado),
    fecha_obtencion = IF(v_total_votos >= 15 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 5: Opinador (10 encuestas)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 5, v_total_encuestas, IF(v_total_encuestas >= 10, 1, 0), IF(v_total_encuestas >= 10, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_encuestas,
    completado = IF(v_total_encuestas >= 10, 1, completado),
    fecha_obtencion = IF(v_total_encuestas >= 10 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 6: Voz del Sindicato (30 encuestas)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 6, v_total_encuestas, IF(v_total_encuestas >= 30, 1, 0), IF(v_total_encuestas >= 30, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_encuestas,
    completado = IF(v_total_encuestas >= 30, 1, completado),
    fecha_obtencion = IF(v_total_encuestas >= 30 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 7: Coleccionista Bronce (250 puntos)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 7, v_total_puntos, IF(v_total_puntos >= 250, 1, 0), IF(v_total_puntos >= 250, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_puntos,
    completado = IF(v_total_puntos >= 250, 1, completado),
    fecha_obtencion = IF(v_total_puntos >= 250 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 8: Coleccionista Plata (500 puntos)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 8, v_total_puntos, IF(v_total_puntos >= 500, 1, 0), IF(v_total_puntos >= 500, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_puntos,
    completado = IF(v_total_puntos >= 500, 1, completado),
    fecha_obtencion = IF(v_total_puntos >= 500 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 9: Coleccionista Oro (1000 puntos)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 9, v_total_puntos, IF(v_total_puntos >= 1000, 1, 0), IF(v_total_puntos >= 1000, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_puntos,
    completado = IF(v_total_puntos >= 1000, 1, completado),
    fecha_obtencion = IF(v_total_puntos >= 1000 AND completado = 0, NOW(), fecha_obtencion);

  -- Logro 10: Leyenda del Sindicato (2000 puntos)
  INSERT INTO logros_usuario (usuario_id, logro_id, progreso, completado, fecha_obtencion)
  VALUES (p_usuario_id, 10, v_total_puntos, IF(v_total_puntos >= 2000, 1, 0), IF(v_total_puntos >= 2000, NOW(), NULL))
  ON DUPLICATE KEY UPDATE
    progreso = v_total_puntos,
    completado = IF(v_total_puntos >= 2000, 1, completado),
    fecha_obtencion = IF(v_total_puntos >= 2000 AND completado = 0, NOW(), fecha_obtencion);

END$$

DELIMITER ;

-- =============================================
-- Datos iniciales: Catálogo de logros
-- =============================================
INSERT INTO `logros_catalogo` (`id`, `nombre`, `descripcion`, `icono`, `tipo`, `meta`, `estado`) VALUES
(1, 'Asistente Comprometido', '3 meses consecutivos sin faltas', '🎯', 'asistencia', 3, 'activo'),
(2, 'Asistencia Perfecta', '6 meses consecutivos sin faltas', '⭐', 'asistencia', 6, 'activo'),
(3, 'Votante Principiante', 'Participar en 5 votaciones', '🗳️', 'votacion', 5, 'activo'),
(4, 'Votante Activo', 'Participar en 15 votaciones', '🏆', 'votacion', 15, 'activo'),
(5, 'Opinador', 'Completar 10 encuestas', '💭', 'encuesta', 10, 'activo'),
(6, 'Voz del Sindicato', 'Completar 30 encuestas', '📢', 'encuesta', 30, 'activo'),
(7, 'Coleccionista Bronce', 'Acumular 250 puntos', '🥉', 'puntos', 250, 'activo'),
(8, 'Coleccionista Plata', 'Acumular 500 puntos', '🥈', 'puntos', 500, 'activo'),
(9, 'Coleccionista Oro', 'Acumular 1000 puntos', '🥇', 'puntos', 1000, 'activo'),
(10, 'Leyenda del Sindicato', 'Acumular 2000 puntos', '👑', 'puntos', 2000, 'activo');