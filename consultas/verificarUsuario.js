// server/consultas/verificarUsuario.js
const express = require("express");
const pool = require("../bd");
const { body, validationResult } = require("express-validator");

const router = express.Router();

router.post(
  "/",
  [
    body("nombreCompleto")
      .notEmpty()
      .withMessage("Nombre completo requerido")
      .isLength({ min: 3 })
      .withMessage("El nombre debe tener al menos 3 caracteres"),
  ],
  async (req, res) => {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        autorizado: false, 
        error: "Datos inválidos",
        errors: errors.array() 
      });
    }

    const { nombreCompleto } = req.body;

    try {
      console.log(`🔍 Verificando usuario: ${nombreCompleto}`);
      
      // Limpiar y normalizar el nombre
      const nombreLimpio = nombreCompleto.trim().toLowerCase();
      
      // Separar el nombre en palabras para búsqueda más flexible
      const palabrasNombre = nombreLimpio.split(/\s+/);
      
      // Requiere al menos 3 palabras para nombre + apellido paterno + apellido materno
      if (palabrasNombre.length < 3) {
        return res.json({
          autorizado: false,
          mensaje: "Por favor proporciona tu nombre completo: nombre, apellido paterno y apellido materno"
        });
      }

      // Buscar usuario en la base de datos con comparación más estricta de los 3 nombres
      const query = `
        SELECT 
          au.id,
          au.correo_electronico,
          pu.nombre,
          pu.apellido_paterno,
          pu.apellido_materno,
          au.estatus
        FROM autenticacion_usuarios au
        JOIN perfil_usuarios pu ON au.id = pu.id
        WHERE au.estatus = 'Activo'
          AND (
            -- Comparación completa (nombre + apellido paterno + apellido materno)
            CONCAT(LOWER(pu.nombre), ' ', LOWER(pu.apellido_paterno), ' ', LOWER(pu.apellido_materno)) LIKE ?
            -- Comparación por partes individuales
            OR (LOWER(pu.nombre) LIKE ? 
                AND LOWER(pu.apellido_paterno) LIKE ? 
                AND LOWER(pu.apellido_materno) LIKE ?)
            -- Comparación flexible con al menos 2 de los 3 nombres
            OR (LOWER(pu.nombre) LIKE ? AND LOWER(pu.apellido_paterno) LIKE ?)
            OR (LOWER(pu.nombre) LIKE ? AND LOWER(pu.apellido_materno) LIKE ?)
            OR (LOWER(pu.apellido_paterno) LIKE ? AND LOWER(pu.apellido_materno) LIKE ?)
          )
        LIMIT 10
      `;

      // Crear patrones de búsqueda más específicos
      const nombreCompletoPattern = `%${nombreLimpio}%`;
      const nombrePattern = `%${palabrasNombre[0]}%`;
      const apellidoPaternoPattern = `%${palabrasNombre[1]}%`;
      const apellidoMaternoPattern = palabrasNombre[2] ? `%${palabrasNombre[2]}%` : `%${palabrasNombre[1]}%`;

      const [usuarios] = await pool.query(query, [
        nombreCompletoPattern,        // Búsqueda completa
        nombrePattern,                // Nombre individual
        apellidoPaternoPattern,       // Apellido paterno individual  
        apellidoMaternoPattern,       // Apellido materno individual
        nombrePattern,                // Nombre + apellido paterno
        apellidoPaternoPattern,
        nombrePattern,                // Nombre + apellido materno
        apellidoMaternoPattern,
        apellidoPaternoPattern,       // Apellido paterno + apellido materno
        apellidoMaternoPattern
      ]);

      console.log(`📊 Usuarios encontrados: ${usuarios.length}`);

      if (usuarios.length === 0) {
        console.log(`❌ Usuario no encontrado: ${nombreCompleto}`);
        return res.json({
          autorizado: false,
          mensaje: "Usuario no encontrado en el sistema"
        });
      }

      // Buscar la mejor coincidencia con algoritmo mejorado
      let mejorCoincidencia = null;
      let mejorPuntuacion = 0;

      usuarios.forEach(usuario => {
        const nombreCompleto_DB = `${usuario.nombre} ${usuario.apellido_paterno} ${usuario.apellido_materno}`.toLowerCase();
        const puntuacion = calcularSimilitudCompleta(nombreLimpio, nombreCompleto_DB, usuario);
        
        console.log(`🔍 Comparando: "${nombreLimpio}" vs "${nombreCompleto_DB}" - Puntuación: ${puntuacion.toFixed(3)}`);
        
        if (puntuacion > mejorPuntuacion) {
          mejorPuntuacion = puntuacion;
          mejorCoincidencia = usuario;
        }
      });

      // Umbral de similitud más estricto para 3 nombres
      const umbralSimilitud = 0.75; // 75% de similitud mínima para 3 nombres

      if (mejorCoincidencia && mejorPuntuacion >= umbralSimilitud) {
        console.log(`✅ Usuario autorizado: ${mejorCoincidencia.nombre} ${mejorCoincidencia.apellido_paterno} ${mejorCoincidencia.apellido_materno}`);
        
        return res.json({
          autorizado: true,
          nombreUsuario: `${mejorCoincidencia.nombre} ${mejorCoincidencia.apellido_paterno} ${mejorCoincidencia.apellido_materno}`,
          nombreCorto: `${mejorCoincidencia.nombre} ${mejorCoincidencia.apellido_paterno}`,
          mensaje: "Usuario autorizado correctamente"
        });
      } else {
        console.log(`❌ Similitud insuficiente: ${mejorPuntuacion.toFixed(3)} < ${umbralSimilitud}`);
        return res.json({
          autorizado: false,
          mensaje: "No se pudo verificar tu identidad. Asegúrate de proporcionar tu nombre completo: nombre, apellido paterno y apellido materno"
        });
      }

    } catch (err) {
      console.error("Error en verificación de usuario:", err);
      res.status(500).json({
        autorizado: false,
        error: "Error interno del servidor"
      });
    }
  }
);

// Función mejorada para calcular similitud de los 3 nombres
function calcularSimilitudCompleta(nombreInput, nombreDB, usuario) {
  const palabrasInput = nombreInput.split(/\s+/).filter(p => p.length > 1);
  const palabrasDB = [usuario.nombre.toLowerCase(), usuario.apellido_paterno.toLowerCase(), usuario.apellido_materno.toLowerCase()];
  
  let puntuacionTotal = 0;
  let coincidenciasExactas = 0;
  let coincidenciasParciales = 0;
  
  // Verificar coincidencias exactas por posición
  palabrasInput.forEach((palabraInput, index) => {
    if (index < palabrasDB.length) {
      const palabraDB = palabrasDB[index];
      
      // Coincidencia exacta
      if (palabraInput === palabraDB) {
        coincidenciasExactas++;
        puntuacionTotal += 1.0;
      }
      // Coincidencia parcial (una contiene a la otra)
      else if (palabraInput.includes(palabraDB) || palabraDB.includes(palabraInput)) {
        coincidenciasParciales++;
        puntuacionTotal += 0.7;
      }
      // Similitud por distancia de caracteres
      else {
        const similitud = calcularSimilitudLevenshtein(palabraInput, palabraDB);
        if (similitud > 0.8) {
          puntuacionTotal += similitud * 0.6;
        }
      }
    }
  });
  
  // Verificar también coincidencias en cualquier orden (para casos donde el orden cambie)
  palabrasInput.forEach(palabraInput => {
    palabrasDB.forEach(palabraDB => {
      if (palabraInput === palabraDB) {
        // Ya contado arriba, no duplicar
        return;
      }
      if (palabraInput.includes(palabraDB) || palabraDB.includes(palabraInput)) {
        puntuacionTotal += 0.3; // Bonus menor por coincidencia fuera de orden
      }
    });
  });
  
  // Normalizar puntuación
  const maxPuntuacion = Math.max(palabrasInput.length, 3); // Máximo entre palabras input y los 3 nombres esperados
  const puntuacionNormalizada = Math.min(puntuacionTotal / maxPuntuacion, 1.0);
  
  console.log(`   📊 Coincidencias exactas: ${coincidenciasExactas}, Parciales: ${coincidenciasParciales}, Puntuación: ${puntuacionNormalizada.toFixed(3)}`);
  
  return puntuacionNormalizada;
}

// Función de distancia de Levenshtein para similitud de caracteres
function calcularSimilitudLevenshtein(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  return maxLen > 0 ? 1 - (matrix[len2][len1] / maxLen) : 1;
}

module.exports = router;