// server/consultas/gestion_usuarios.js

const express = require('express');
const router = express.Router();
const pool = require('../bd');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

// Configuración de multer para subir archivos Excel
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/excel');
    // Crear directorio si no existe
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generar nombre único con timestamp
    const uniqueName = `usuarios_${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  // Validar que sea un archivo Excel
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel' // .xls
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB máximo
  }
});



/**
 * GET /api/usuarios/preregistrados
 * Obtiene lista de usuarios preregistrados (sin completar registro)
 */
router.get('/preregistrados', async (req, res) => {
  try {
    const [usuarios] = await pool.query(`
      SELECT 
        a.id,
        a.correo_electronico,
        p.fecha_nacimiento,
        p.numero_sindicalizado,
        a.fecha_creacion,
        a.estatus
      FROM autenticacion_usuarios a
      JOIN perfil_usuarios p ON a.id = p.id
      WHERE a.registro_completado = 0
      ORDER BY a.fecha_creacion DESC
    `);

    res.json({
      success: true,
      usuarios: usuarios.map(usuario => ({
        id: usuario.id,
        correo_electronico: usuario.correo_electronico,
        fecha_nacimiento: usuario.fecha_nacimiento,
        numero_sindicalizado: usuario.numero_sindicalizado,
        fecha_creacion: usuario.fecha_creacion,
        estatus: usuario.estatus
      }))
    });

  } catch (error) {
    console.error('Error obteniendo usuarios preregistrados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios preregistrados'
    });
  }
});

/**
 * GET /api/usuarios/registrados
 * Obtiene lista de usuarios completamente registrados
 */
router.get('/registrados', async (req, res) => {
  try {
    const [usuarios] = await pool.query(`
      SELECT 
        a.id,
        a.correo_electronico,
        p.numero_sindicalizado,
        p.nombre,
        p.apellido_paterno,
        p.apellido_materno,
        p.genero,
        p.telefono,
        p.fecha_nacimiento,
        p.url_foto,
        u.nombre as universidad,
        prog.nombre as programa_educativo,
        nivel.nombre as nivel_educativo,
        puesto.nombre as puesto_universidad,
        rol.nombre as rol_sindicato,
        p.numero_trabajador,
        a.estatus,
        a.fecha_creacion
      FROM autenticacion_usuarios a
      JOIN perfil_usuarios p ON a.id = p.id
      LEFT JOIN universidades u ON p.universidad_id = u.id
      LEFT JOIN programas_educativos prog ON p.programa_id = prog.id
      LEFT JOIN niveles_educativos nivel ON p.nivel_id = nivel.id
      LEFT JOIN puestos_universidad puesto ON p.puesto_id = puesto.id
      LEFT JOIN roles_sindicato rol ON p.rol_sindicato_id = rol.id
      WHERE a.registro_completado = 1
      ORDER BY p.apellido_paterno, p.apellido_materno, p.nombre
    `);

    res.json({
      success: true,
      usuarios: usuarios
    });

  } catch (error) {
    console.error('Error obteniendo usuarios registrados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios registrados'
    });
  }
});


/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario del sistema (permite eliminar usuarios registrados y preregistrados)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verificar que el usuario existe
    const [usuario] = await pool.query(
      'SELECT id, registro_completado, correo_electronico FROM autenticacion_usuarios WHERE id = ?',
      [id]
    );

    if (usuario.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Obtener información adicional si es un usuario registrado
    let nombreCompleto = usuario[0].correo_electronico;
    if (usuario[0].registro_completado === 1) {
      const [perfilUsuario] = await pool.query(
        'SELECT nombre, apellido_paterno, apellido_materno FROM perfil_usuarios WHERE id = ?',
        [id]
      );
      
      if (perfilUsuario.length > 0) {
        const { nombre, apellido_paterno, apellido_materno } = perfilUsuario[0];
        nombreCompleto = `${nombre} ${apellido_paterno} ${apellido_materno}`;
      }
    }

    // Eliminar usuario
    // El trigger trg_borrar_usuario_completo se encarga de eliminar automáticamente 
    // el registro de autenticacion_usuarios cuando se elimina de perfil_usuarios
    await pool.query('DELETE FROM perfil_usuarios WHERE id = ?', [id]);

    const tipoUsuario = usuario[0].registro_completado === 1 ? 'registrado' : 'preregistrado';
    
    res.json({
      success: true,
      mensaje: `Usuario ${tipoUsuario} "${nombreCompleto}" eliminado exitosamente`
    });

  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al eliminar usuario'
    });
  }
});

/**
 * GET /api/usuarios/estadisticas
 * Obtiene estadísticas generales de usuarios
 */
router.get('/estadisticas', async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_usuarios,
        SUM(CASE WHEN registro_completado = 1 THEN 1 ELSE 0 END) as usuarios_registrados,
        SUM(CASE WHEN registro_completado = 0 THEN 1 ELSE 0 END) as usuarios_preregistrados,
        SUM(CASE WHEN estatus = 'Activo' THEN 1 ELSE 0 END) as usuarios_activos,
        SUM(CASE WHEN estatus = 'Inactivo' THEN 1 ELSE 0 END) as usuarios_inactivos
      FROM autenticacion_usuarios
    `);

    res.json({
      success: true,
      estadisticas: stats[0]
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});
/**
 * GET /api/usuarios/:id
 * Obtiene los datos completos de un usuario específico por ID
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [usuario] = await pool.query(`
      SELECT 
        a.id,
        a.correo_electronico,
        a.estatus,
        a.registro_completado,
        a.fecha_creacion,
        p.numero_sindicalizado,
        p.nombre,
        p.apellido_paterno,
        p.apellido_materno,
        p.genero,
        p.curp,
        p.telefono,
        DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
        DATE_FORMAT(p.antiguedad, '%Y-%m-%d') AS antiguedad,
        p.url_foto,
        p.numero_trabajador,
        
        -- Datos de catálogos con IDs y nombres
        u.id as universidad_id,
        u.nombre as universidad,
        prog.id as programa_id,
        prog.nombre as programa_educativo,
        nivel.id as nivel_id,
        nivel.nombre as nivel_educativo,
        puesto.id as puesto_id,
        puesto.nombre as puesto,
        rol.id as rol_sindicato_id,
        rol.nombre as rol_sindicato,
        
        -- Puesto en el sindicato (si tiene uno asignado)
        ps.id as puesto_sindicato_id,
        ps.nombre as puesto_sindicato
        
      FROM autenticacion_usuarios a
      JOIN perfil_usuarios p ON a.id = p.id
      LEFT JOIN universidades u ON p.universidad_id = u.id
      LEFT JOIN programas_educativos prog ON p.programa_id = prog.id
      LEFT JOIN niveles_educativos nivel ON p.nivel_id = nivel.id
      LEFT JOIN puestos_universidad puesto ON p.puesto_id = puesto.id
      LEFT JOIN roles_sindicato rol ON p.rol_sindicato_id = rol.id
      LEFT JOIN puestos_sindicato ps ON ps.usuario_id = p.id
      WHERE a.id = ?
    `, [id]);

    if (usuario.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      usuario: usuario[0]
    });

  } catch (error) {
    console.error('Error obteniendo usuario por ID:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al obtener usuario'
    });
  }
});

/**
 * PUT /api/usuarios/:id
 * Actualiza los datos de un usuario específico
 */
router.put('/:id', [
  // Validaciones para datos personales
  body('nombre').optional().notEmpty().withMessage('Nombre no puede estar vacío'),
  body('apellido_paterno').optional().notEmpty().withMessage('Apellido paterno no puede estar vacío'),
  body('apellido_materno').optional().notEmpty().withMessage('Apellido materno no puede estar vacío'),
  body('correo_electronico').optional().isEmail().withMessage('Correo electrónico inválido'),
  body('telefono').optional().isLength({ min: 10, max: 10 }).withMessage('Teléfono debe tener 10 dígitos'),
  body('genero').optional().isIn(['Masculino', 'Femenino']).withMessage('Género inválido'),
  body('curp').optional().isLength({ min: 18, max: 18 }).withMessage('CURP debe tener 18 caracteres'),
  body('fecha_nacimiento').optional().isISO8601().withMessage('Fecha de nacimiento inválida'),
  body('antiguedad').optional().isISO8601().withMessage('Fecha de antigüedad inválida'),
  
  // Validaciones para datos laborales
  body('programa_educativo').optional().notEmpty().withMessage('Programa educativo no puede estar vacío'),
  body('puesto_id').optional().isInt().withMessage('Puesto debe ser un número válido'),
  body('universidad_id').optional().isInt().withMessage('Universidad debe ser un número válido'),
  body('numero_trabajador').optional().notEmpty().withMessage('Número de trabajador no puede estar vacío'),
  body('nivel_id').optional().isInt().withMessage('Nivel educativo debe ser un número válido'),
  
  // Validaciones para datos sindicales
  body('rol_sindicato_id').optional().isInt().withMessage('Rol del sindicato debe ser un número válido'),
  body('estatus').optional().isIn(['Activo', 'Inactivo', 'Permiso']).withMessage('Estatus inválido')
], async (req, res) => {
  const { id } = req.params;
  
  // Validar errores de entrada
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    // Verificar que el usuario existe
    const [usuarioExiste] = await pool.query(
      'SELECT id FROM autenticacion_usuarios WHERE id = ?',
      [id]
    );

    if (usuarioExiste.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const {
      // Datos personales
      nombre,
      apellido_paterno,
      apellido_materno,
      correo_electronico,
      telefono,
      genero,
      curp,
      fecha_nacimiento,
      antiguedad,
      
      // Datos laborales
      programa_educativo,
      puesto_id,
      universidad_id,
      numero_trabajador,
      nivel_id,
      
      // Datos sindicales
      rol_sindicato_id,
      estatus
    } = req.body;

    // Construir queries dinámicamente solo para campos proporcionados
    const updates = [];
    const values = [];

    // Actualizar perfil_usuarios
    const perfilUpdates = [];
    const perfilValues = [];

    if (nombre !== undefined) {
      perfilUpdates.push('nombre = ?');
      perfilValues.push(nombre);
    }
    if (apellido_paterno !== undefined) {
      perfilUpdates.push('apellido_paterno = ?');
      perfilValues.push(apellido_paterno);
    }
    if (apellido_materno !== undefined) {
      perfilUpdates.push('apellido_materno = ?');
      perfilValues.push(apellido_materno);
    }
    if (telefono !== undefined) {
      perfilUpdates.push('telefono = ?');
      perfilValues.push(telefono);
    }
    if (genero !== undefined) {
      perfilUpdates.push('genero = ?');
      perfilValues.push(genero);
    }
    if (curp !== undefined) {
      perfilUpdates.push('curp = ?');
      perfilValues.push(curp);
    }
    if (fecha_nacimiento !== undefined) {
      perfilUpdates.push('fecha_nacimiento = ?');
      perfilValues.push(fecha_nacimiento);
    }
    if (antiguedad !== undefined) {
      perfilUpdates.push('antiguedad = ?');
      perfilValues.push(antiguedad);
    }
    if (programa_educativo !== undefined) {
      // Buscar o crear programa educativo
      let programaId = null;
      if (programa_educativo) {
        const [existingPrograma] = await pool.query(
          'SELECT id FROM programas_educativos WHERE nombre = ?',
          [programa_educativo]
        );
        
        if (existingPrograma.length > 0) {
          programaId = existingPrograma[0].id;
        } else {
          const [newPrograma] = await pool.query(
            'INSERT INTO programas_educativos (nombre) VALUES (?)',
            [programa_educativo]
          );
          programaId = newPrograma.insertId;
        }
      }
      perfilUpdates.push('programa_id = ?');
      perfilValues.push(programaId);
    }
    if (puesto_id !== undefined) {
      perfilUpdates.push('puesto_id = ?');
      perfilValues.push(puesto_id);
    }
    if (universidad_id !== undefined) {
      perfilUpdates.push('universidad_id = ?');
      perfilValues.push(universidad_id);
    }
    if (numero_trabajador !== undefined) {
      perfilUpdates.push('numero_trabajador = ?');
      perfilValues.push(numero_trabajador);
    }
    if (nivel_id !== undefined) {
      perfilUpdates.push('nivel_id = ?');
      perfilValues.push(nivel_id);
    }
    if (rol_sindicato_id !== undefined) {
      perfilUpdates.push('rol_sindicato_id = ?');
      perfilValues.push(rol_sindicato_id);
    }

    // Actualizar autenticacion_usuarios
    const authUpdates = [];
    const authValues = [];

    if (correo_electronico !== undefined) {
      authUpdates.push('correo_electronico = ?');
      authValues.push(correo_electronico.toLowerCase());
    }
    if (estatus !== undefined) {
      authUpdates.push('estatus = ?');
      authValues.push(estatus);
    }

    // Ejecutar actualizaciones
    if (perfilUpdates.length > 0) {
      perfilValues.push(id);
      await pool.query(
        `UPDATE perfil_usuarios SET ${perfilUpdates.join(', ')} WHERE id = ?`,
        perfilValues
      );
    }

    if (authUpdates.length > 0) {
      authValues.push(id);
      await pool.query(
        `UPDATE autenticacion_usuarios SET ${authUpdates.join(', ')} WHERE id = ?`,
        authValues
      );
    }

    res.json({
      success: true,
      mensaje: 'Usuario actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al actualizar usuario'
    });
  }
});

/**
 * GET /api/usuarios/catalogos/all
 * Obtiene todos los catálogos necesarios para el formulario de edición
 */
router.get('/catalogos/all', async (req, res) => {
  try {
    const [universidades] = await pool.query(
      'SELECT id, nombre FROM universidades ORDER BY nombre'
    );
    
    const [programas] = await pool.query(
      'SELECT id, nombre FROM programas_educativos ORDER BY nombre'
    );
    
    const [niveles] = await pool.query(
      'SELECT id, nombre FROM niveles_educativos ORDER BY nombre'
    );
    
    const [puestos] = await pool.query(
      'SELECT id, nombre FROM puestos_universidad ORDER BY nombre'
    );
    
    const [roles] = await pool.query(
      'SELECT id, nombre FROM roles_sindicato ORDER BY nombre'
    );

    res.json({
      success: true,
      catalogos: {
        universidades,
        programas,
        niveles,
        puestos,
        roles
      }
    });

  } catch (error) {
    console.error('Error obteniendo catálogos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener catálogos'
    });
  }
});

// server/consultas/gestion_usuarios.js - Fragmentos a actualizar

/**
 * PUT /api/usuarios/:id/campo
 * Actualiza un campo específico de un usuario
 */
router.put('/:id/campo', async (req, res) => {
  const { id } = req.params;
  const { campo, valor } = req.body;

  try {
    // Validar que el usuario existe
    const [usuarioExiste] = await pool.query(
      'SELECT id FROM autenticacion_usuarios WHERE id = ?',
      [id]
    );

    if (usuarioExiste.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // ✅ VALIDACIONES AGREGADAS POR CAMPO
    if (campo === 'nombre' || campo === 'apellido_paterno' || campo === 'apellido_materno') {
      if (!valor || valor.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'El nombre debe tener al menos 2 caracteres'
        });
      }
      const nameRegex = /^[A-Za-zÁÉÍÓÚáéíóúÜüÑñ\s]+$/;
      if (!nameRegex.test(valor)) {
        return res.status(400).json({
          success: false,
          error: 'Solo se permiten letras y espacios'
        });
      }
    }

    if (campo === 'correo_electronico') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(valor)) {
        return res.status(400).json({
          success: false,
          error: 'Formato de correo electrónico inválido'
        });
      }
    }

    if (campo === 'telefono') {
      if (!/^\d{10}$/.test(valor)) {
        return res.status(400).json({
          success: false,
          error: 'El teléfono debe tener exactamente 10 dígitos'
        });
      }
    }

    if (campo === 'curp') {
      if (!/^[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i.test(valor)) {
        return res.status(400).json({
          success: false,
          error: 'Formato de CURP inválido'
        });
      }
    }

    if (campo === 'numero_trabajador') {
      if (!/^[0-9]+$/.test(valor)) {
        return res.status(400).json({
          success: false,
          error: 'El número de trabajador debe ser numérico'
        });
      }
    }

    // Mapear campos a tablas
    const camposAutenticacion = ['correo_electronico', 'estatus'];
    const camposPerfil = [
      'nombre', 'apellido_paterno', 'apellido_materno', 'telefono', 
      'genero', 'curp', 'fecha_nacimiento', 'antiguedad', 
      'numero_trabajador', 'universidad_id', 'programa_id', 
      'nivel_id', 'puesto_id', 'rol_sindicato_id'
    ];

    if (camposAutenticacion.includes(campo)) {
      await pool.query(
        `UPDATE autenticacion_usuarios SET ${campo} = ? WHERE id = ?`,
        [valor, id]
      );
    } else if (camposPerfil.includes(campo)) {
      // ✅ CASO ESPECIAL PARA PROGRAMA EDUCATIVO
      if (campo === 'programa_educativo' && typeof valor === 'string') {
        let programaId = null;
        if (valor && valor.trim()) {
          const [existingPrograma] = await pool.query(
            'SELECT id FROM programas_educativos WHERE nombre = ?',
            [valor.trim()]
          );
          
          if (existingPrograma.length > 0) {
            programaId = existingPrograma[0].id;
          } else {
            const [newPrograma] = await pool.query(
              'INSERT INTO programas_educativos (nombre) VALUES (?)',
              [valor.trim()]
            );
            programaId = newPrograma.insertId;
          }
        }
        await pool.query(
          'UPDATE perfil_usuarios SET programa_id = ? WHERE id = ?',
          [programaId, id]
        );
      } else {
        await pool.query(
          `UPDATE perfil_usuarios SET ${campo} = ? WHERE id = ?`,
          [valor, id]
        );
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Campo no válido para actualización'
      });
    }

    res.json({
      success: true,
      mensaje: `Campo ${campo} actualizado exitosamente`
    });

  } catch (error) {
    console.error('Error actualizando campo:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al actualizar campo'
    });
  }
});
/**
 * POST /api/usuarios/procesar-excel
 * Procesa un archivo Excel y crea usuarios preregistrados
 */
router.post('/procesar-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se proporcionó archivo Excel' 
      });
    }

    console.log('Archivo recibido:', req.file.filename);
    
    // Leer el archivo Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; // Usar la primera hoja
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    
    if (jsonData.length === 0) {
      // Eliminar archivo después de procesarlo
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        success: false, 
        error: 'El archivo Excel está vacío o no tiene datos válidos' 
      });
    }

    console.log('Datos extraídos del Excel:', jsonData.length, 'filas');

    // Validar estructura esperada del Excel
    const requiredColumns = ['correo_electronico', 'fecha_nacimiento'];
    const firstRow = jsonData[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        success: false, 
        error: `Faltan columnas requeridas en el Excel: ${missingColumns.join(', ')}` 
      });
    }

    // Procesar cada fila del Excel
    const results = {
      exitosos: 0,
      errores: 0,
      duplicados: 0,
      detalles: []
    };

    for (let i = 0; i < jsonData.length; i++) {
      const fila = jsonData[i];
      const numeroFila = i + 2; // +2 porque Excel empieza en 1 y tenemos header
      
      try {
        // Validar datos básicos
        if (!fila.correo_electronico || !fila.fecha_nacimiento) {
          results.errores++;
          results.detalles.push({
            fila: numeroFila,
            error: 'Faltan datos obligatorios (correo_electronico, fecha_nacimiento)'
          });
          continue;
        }

        // Normalizar email
        const email = fila.correo_electronico.toString().toLowerCase().trim();
        
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          results.errores++;
          results.detalles.push({
            fila: numeroFila,
            error: `Email inválido: ${email}`
          });
          continue;
        }

        // Procesar fecha de nacimiento
        let fechaNacimiento;
        if (typeof fila.fecha_nacimiento === 'number') {
          // Excel almacena fechas como números
          const excelDate = new Date((fila.fecha_nacimiento - 25569) * 86400 * 1000);
          fechaNacimiento = excelDate.toISOString().split('T')[0];
        } else {
          // Intentar parsear como string
          const parsedDate = new Date(fila.fecha_nacimiento);
          if (isNaN(parsedDate.getTime())) {
            results.errores++;
            results.detalles.push({
              fila: numeroFila,
              error: `Fecha de nacimiento inválida: ${fila.fecha_nacimiento}`
            });
            continue;
          }
          fechaNacimiento = parsedDate.toISOString().split('T')[0];
        }

        // Verificar si el usuario ya existe
        const [existingUser] = await pool.query(
          `SELECT a.id, a.registro_completado
           FROM autenticacion_usuarios a
           JOIN perfil_usuarios p ON a.id = p.id
           WHERE a.correo_electronico = ? AND DATE(p.fecha_nacimiento) = ?`,
          [email, fechaNacimiento]
        );

        if (existingUser.length > 0) {
          results.duplicados++;
          results.detalles.push({
            fila: numeroFila,
            mensaje: `Usuario ya existe: ${email}`
          });
          continue;
        }

        // Insertar usuario usando el procedimiento almacenado
        await pool.query(
          'CALL sp_preregistrar_usuario(?, ?)',
          [email, fechaNacimiento]
        );

        results.exitosos++;
        results.detalles.push({
          fila: numeroFila,
          mensaje: `Usuario creado exitosamente: ${email}`
        });

      } catch (error) {
        console.error(`Error procesando fila ${numeroFila}:`, error);
        results.errores++;
        results.detalles.push({
          fila: numeroFila,
          error: `Error interno: ${error.message}`
        });
      }
    }

    // Eliminar archivo después de procesarlo
    fs.unlinkSync(req.file.path);

    // Responder con resumen
    res.json({
      success: true,
      mensaje: 'Archivo procesado correctamente',
      resumen: {
        total_filas: jsonData.length,
        exitosos: results.exitosos,
        errores: results.errores,
        duplicados: results.duplicados
      },
      detalles: results.detalles
    });

  } catch (error) {
    console.error('Error procesando archivo Excel:', error);
    
    // Eliminar archivo en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Error interno al procesar archivo Excel',
      detalle: error.message
    });
  }
});

/**
 * POST /api/usuarios/agregar-individual
 * Agrega un usuario individual mediante formulario
 */
router.post('/agregar-individual', [
  body('correo_electronico')
    .isEmail()
    .withMessage('Correo electrónico inválido')
    .normalizeEmail(),
  body('fecha_nacimiento')
    .isISO8601()
    .withMessage('Fecha de nacimiento inválida'),
  body('rol')
    .optional()
    .isIn(['agremiado', 'admin'])
    .withMessage('Rol inválido')
], async (req, res) => {
  // Validar errores de entrada
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { correo_electronico, fecha_nacimiento, rol = 'agremiado' } = req.body;

  try {
    // Verificar si el usuario ya existe
    const [existingUser] = await pool.query(
      `SELECT a.id, a.registro_completado
       FROM autenticacion_usuarios a
       JOIN perfil_usuarios p ON a.id = p.id
       WHERE a.correo_electronico = ? AND DATE(p.fecha_nacimiento) = ?`,
      [correo_electronico, fecha_nacimiento]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'El usuario ya existe en el sistema'
      });
    }

    // Insertar usuario usando el procedimiento almacenado
    await pool.query(
      'CALL sp_preregistrar_usuario(?, ?)',
      [correo_electronico, fecha_nacimiento]
    );

    res.status(201).json({
      success: true,
      mensaje: 'Usuario agregado exitosamente',
      usuario: {
        correo_electronico,
        fecha_nacimiento,
        rol
      }
    });

  } catch (error) {
    console.error('Error agregando usuario individual:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al agregar usuario',
      detalle: error.message
    });
  }
});

module.exports = router;