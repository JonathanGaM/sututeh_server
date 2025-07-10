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
      
      // Limpiar, normalizar y quitar acentos del nombre de entrada
      const nombreLimpio = normalizarTexto(nombreCompleto.trim());
      
      // Separar el nombre en palabras para búsqueda más flexible
      const palabrasNombre = nombreLimpio.split(/\s+/).filter(p => p.length > 1);
      
      // Requiere al menos 2 palabras (más flexible para nombres compuestos)
      if (palabrasNombre.length < 2) {
        return res.json({
          autorizado: false,
          mensaje: "Por favor proporciona al menos tu nombre y un apellido"
        });
      }

      console.log(`📝 Nombre normalizado: "${nombreLimpio}" (palabras: ${palabrasNombre.length})`);
      console.log(`📝 Palabras detectadas: [${palabrasNombre.join(', ')}]`);

      // Búsqueda más flexible usando coincidencias parciales de palabras
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
            -- Búsqueda completa sin acentos
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
              LOWER(CONCAT(pu.nombre, ' ', pu.apellido_paterno, ' ', pu.apellido_materno)),
              'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'),
              'ñ', 'n'), 'ü', 'u'), 'à', 'a'), 'è', 'e'), 'ì', 'i') LIKE ?
            -- Búsqueda por cualquier palabra en el nombre
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
              LOWER(pu.nombre), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'),
              'ñ', 'n'), 'ü', 'u'), 'à', 'a'), 'è', 'e'), 'ì', 'i') LIKE ?
            -- Búsqueda por cualquier palabra en apellido paterno
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
              LOWER(pu.apellido_paterno), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'),
              'ñ', 'n'), 'ü', 'u'), 'à', 'a'), 'è', 'e'), 'ì', 'i') LIKE ?
            -- Búsqueda por cualquier palabra en apellido materno
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
              LOWER(pu.apellido_materno), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'),
              'ñ', 'n'), 'ü', 'u'), 'à', 'a'), 'è', 'e'), 'ì', 'i') LIKE ?
          )
        ORDER BY 
          -- Priorizar coincidencias más completas
          CASE 
            WHEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
              LOWER(CONCAT(pu.nombre, ' ', pu.apellido_paterno, ' ', pu.apellido_materno)),
              'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'),
              'ñ', 'n'), 'ü', 'u'), 'à', 'a'), 'è', 'e'), 'ì', 'i') LIKE ? THEN 1
            ELSE 2
          END
        LIMIT 20
      `;

      // Crear patrones de búsqueda flexibles
      const nombreCompletoPattern = `%${nombreLimpio}%`;
      
      // Crear patrones para todas las palabras del input
      const patronesPalabras = palabrasNombre.map(palabra => `%${palabra}%`);
      
      console.log(`🔍 Patrones de búsqueda:`);
      console.log(`   Completo: ${nombreCompletoPattern}`);
      console.log(`   Palabras individuales: [${patronesPalabras.join(', ')}]`);

      // Ejecutar consulta con todos los patrones
      const parametros = [
        nombreCompletoPattern,    // Búsqueda completa
        ...patronesPalabras,      // Una búsqueda por cada palabra
        nombreCompletoPattern     // Para el ORDER BY
      ];

      const [usuarios] = await pool.query(query, parametros);

      console.log(`📊 Usuarios encontrados: ${usuarios.length}`);

      if (usuarios.length === 0) {
        console.log(`❌ Usuario no encontrado: ${nombreCompleto}`);
        return res.json({
          autorizado: false,
          mensaje: "Usuario no encontrado en el sistema"
        });
      }

      // Buscar la mejor coincidencia con algoritmo mejorado para nombres compuestos
      let mejorCoincidencia = null;
      let mejorPuntuacion = 0;

      usuarios.forEach(usuario => {
        const nombreCompleto_DB = `${usuario.nombre} ${usuario.apellido_paterno} ${usuario.apellido_materno}`;
        const nombreCompleto_DB_Normalizado = normalizarTexto(nombreCompleto_DB);
        const puntuacion = calcularSimilitudFlexible(nombreLimpio, nombreCompleto_DB_Normalizado, usuario, palabrasNombre);
        
        console.log(`🔍 Comparando: "${nombreLimpio}" vs "${nombreCompleto_DB_Normalizado}" - Puntuación: ${puntuacion.toFixed(3)}`);
        
        if (puntuacion > mejorPuntuacion) {
          mejorPuntuacion = puntuacion;
          mejorCoincidencia = usuario;
        }
      });

      // Umbral de similitud más flexible para nombres compuestos
      const umbralSimilitud = 0.65; // 65% de similitud mínima (más flexible)

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
        
        // Mensaje más detallado para debug
        const mejorCandidato = mejorCoincidencia ? 
          `${mejorCoincidencia.nombre} ${mejorCoincidencia.apellido_paterno} ${mejorCoincidencia.apellido_materno}` : 
          'ninguno';
        
        console.log(`🔍 Mejor candidato encontrado: "${mejorCandidato}" con puntuación: ${mejorPuntuacion.toFixed(3)}`);
        
        return res.json({
          autorizado: false,
          mensaje: "No se pudo verificar tu identidad. Intenta diciendo tu nombre de manera clara y completa."
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

// ===== FUNCIONES AUXILIARES =====

/**
 * Normaliza texto removiendo acentos, tildes y convirtiendo a minúsculas
 * @param {string} texto - Texto a normalizar
 * @returns {string} - Texto normalizado sin acentos
 */
function normalizarTexto(texto) {
  if (!texto) return '';
  
  return texto
    .toLowerCase()
    .normalize('NFD') // Descompone caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remueve marcas diacríticas (acentos)
    .replace(/ñ/g, 'n') // Reemplaza ñ específicamente
    .replace(/[^a-z0-9\s]/g, '') // Remueve caracteres especiales excepto letras, números y espacios
    .replace(/\s+/g, ' ') // Normaliza espacios múltiples
    .trim();
}

/**
 * Función mejorada para calcular similitud con nombres compuestos flexibles
 */
function calcularSimilitudFlexible(nombreInput, nombreDB, usuario, palabrasInput) {
  // Normalizar nombres de usuario de la BD
  const nombreNormalizado = normalizarTexto(usuario.nombre);
  const apellidoPaternoNormalizado = normalizarTexto(usuario.apellido_paterno);
  const apellidoMaternoNormalizado = normalizarTexto(usuario.apellido_materno);
  
  // Todas las palabras del usuario en la BD (pueden ser nombres compuestos)
  const todasPalabrasDB = [
    ...nombreNormalizado.split(/\s+/),
    ...apellidoPaternoNormalizado.split(/\s+/),
    ...apellidoMaternoNormalizado.split(/\s+/)
  ].filter(p => p.length > 1);
  
  let puntuacionTotal = 0;
  let coincidenciasEncontradas = 0;
  
  console.log(`   🔤 Palabras input: [${palabrasInput.join(', ')}]`);
  console.log(`   🔤 Palabras DB completas: [${todasPalabrasDB.join(', ')}]`);
  console.log(`   📋 Campos BD: Nombre:"${nombreNormalizado}" | ApePaterno:"${apellidoPaternoNormalizado}" | ApeMaterno:"${apellidoMaternoNormalizado}"`);
  
  // Buscar cada palabra del input en todas las palabras de la BD
  palabrasInput.forEach((palabraInput, inputIndex) => {
    let mejorCoincidenciaParaPalabra = 0;
    let coincidenciaEncontrada = false;
    
    // Buscar en todas las palabras de la BD
    todasPalabrasDB.forEach((palabraDB, dbIndex) => {
      let puntajePalabra = 0;
      
      // Coincidencia exacta (mejor puntaje)
      if (palabraInput === palabraDB) {
        puntajePalabra = 1.0;
        console.log(`   ✅ Coincidencia exacta: "${palabraInput}" = "${palabraDB}"`);
      }
      // Coincidencia parcial (una contiene a la otra)
      else if (palabraInput.includes(palabraDB) || palabraDB.includes(palabraInput)) {
        puntajePalabra = 0.8;
        console.log(`   🟡 Coincidencia parcial: "${palabraInput}" ≈ "${palabraDB}"`);
      }
      // Similitud por caracteres
      else {
        const similitud = calcularSimilitudLevenshtein(palabraInput, palabraDB);
        if (similitud > 0.75) {
          puntajePalabra = similitud * 0.7;
          console.log(`   🔵 Similitud alta: "${palabraInput}" vs "${palabraDB}" = ${similitud.toFixed(3)}`);
        }
      }
      
      if (puntajePalabra > mejorCoincidenciaParaPalabra) {
        mejorCoincidenciaParaPalabra = puntajePalabra;
        if (puntajePalabra > 0.5) {
          coincidenciaEncontrada = true;
        }
      }
    });
    
    puntuacionTotal += mejorCoincidenciaParaPalabra;
    if (coincidenciaEncontrada) {
      coincidenciasEncontradas++;
    }
  });
  
  // Bonus por coincidencias de orden en campos específicos
  let bonusOrden = 0;
  
  // Verificar si las primeras palabras coinciden con el nombre
  const palabrasNombreDB = nombreNormalizado.split(/\s+/);
  const primeraPalabra = palabrasInput[0];
  
  if (palabrasNombreDB.some(p => p === primeraPalabra || p.includes(primeraPalabra) || primeraPalabra.includes(p))) {
    bonusOrden += 0.3;
    console.log(`   🎯 Bonus: Primera palabra coincide con nombre`);
  }
  
  // Verificar apellidos
  if (palabrasInput.length > 1) {
    const ultimasPalabras = palabrasInput.slice(-2); // Últimas 2 palabras (posibles apellidos)
    
    ultimasPalabras.forEach(palabra => {
      if (apellidoPaternoNormalizado.includes(palabra) || apellidoMaternoNormalizado.includes(palabra)) {
        bonusOrden += 0.2;
        console.log(`   🎯 Bonus: Palabra "${palabra}" coincide con apellido`);
      }
    });
  }
  
  // Calcular puntuación final normalizada
  const porcentajeCoincidencias = coincidenciasEncontradas / palabrasInput.length;
  const puntuacionPromedio = puntuacionTotal / palabrasInput.length;
  const puntuacionFinal = Math.min((puntuacionPromedio * 0.7) + (porcentajeCoincidencias * 0.2) + (bonusOrden * 0.1), 1.0);
  
  console.log(`   📊 Coincidencias: ${coincidenciasEncontradas}/${palabrasInput.length} (${(porcentajeCoincidencias*100).toFixed(1)}%)`);
  console.log(`   📊 Puntuación promedio: ${puntuacionPromedio.toFixed(3)}`);
  console.log(`   📊 Bonus orden: ${bonusOrden.toFixed(3)}`);
  console.log(`   📊 Puntuación final: ${puntuacionFinal.toFixed(3)}`);
  
  return puntuacionFinal;
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