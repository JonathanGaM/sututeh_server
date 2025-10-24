\# Database - Sistema de Puntos (Gamificación)



\## SCRUM-45: Tablas de puntos\_historial y puntos\_saldo



\### Versión: v0.1.0

\*\*Fecha:\*\* 2025-01-18  

\*\*Autor:\*\* Jonathan García Martínez



---



\## 📊 Tablas creadas



\### 1. `puntos\_historial`

Registra todos los movimientos de puntos de los usuarios.



\*\*Estructura:\*\*

| Campo | Tipo | Descripción |

|-------|------|-------------|

| `id` | INT | Identificador único (PK) |

| `usuario\_id` | INT | ID del usuario (FK) |

| `referencia\_id` | INT | ID de reunión o encuesta |

| `puntos` | INT | 30 (asistencia) o 20 (encuesta) |

| `fecha` | DATETIME | Timestamp del registro |

| `descripcion` | VARCHAR(255) | Descripción del movimiento |



\*\*Índices:\*\*

\- Primary key: `id`

\- Foreign key: `usuario\_id` → `perfil\_usuarios(id)`

\- Index: `idx\_referencia\_id`

\- Index: `idx\_fecha`



---



\### 2. `puntos\_saldo`

Almacena el saldo total de puntos por usuario (año actual).



\*\*Estructura:\*\*

| Campo | Tipo | Descripción |

|-------|------|-------------|

| `usuario\_id` | INT | ID del usuario (PK, FK) |

| `total\_puntos` | INT | Suma total de puntos |

| `actualizado\_en` | DATETIME | Última actualización |



\*\*Índices:\*\*

\- Primary key: `usuario\_id`

\- Foreign key: `usuario\_id` → `perfil\_usuarios(id)`



---



\## ⚙️ Stored Procedure



\### `sp\_actualizar\_puntos\_usuario(p\_usuario\_id)`

Recalcula automáticamente los puntos de un usuario basándose en:

\- Asistencias a reuniones (30 puntos c/u)

\- Participación en encuestas (20 puntos c/u)



\*\*Parámetros:\*\*

\- `p\_usuario\_id` (INT): ID del usuario a actualizar



\*\*Uso:\*\*

```sql

CALL sp\_actualizar\_puntos\_usuario(123);

```



\*\*Proceso:\*\*

1\. Elimina registros previos del año actual

2\. Recalcula puntos por asistencias (puntaje >= 2)

3\. Recalcula puntos por encuestas respondidas

4\. Actualiza el saldo total en `puntos\_saldo`



---



\## 🚀 Instalación



\### Ejecutar el script:

```bash

mysql -u root -p dbsututeh < SCRUM-45\_puntos\_tables.sql

```



O desde phpMyAdmin:

1\. Seleccionar base de datos `dbsututeh`

2\. Ir a la pestaña SQL

3\. Copiar y pegar el contenido de `SCRUM-45\_puntos\_tables.sql`

4\. Ejecutar



---



\## ✅ Verificación



Después de ejecutar el script:

```sql

-- Verificar tablas

SHOW TABLES LIKE 'puntos\_%';



-- Verificar estructura

DESCRIBE puntos\_historial;

DESCRIBE puntos\_saldo;



-- Verificar stored procedure

SHOW PROCEDURE STATUS WHERE Db = 'dbsututeh' AND Name = 'sp\_actualizar\_puntos\_usuario';



-- Verificar datos iniciales

SELECT COUNT(\*) FROM puntos\_saldo;

```



---



\## 📌 Notas importantes



\- Las tablas usan `InnoDB` para soportar transacciones

\- Los puntos se calculan \*\*por año\*\* (solo el año actual)

\- La eliminación de un usuario elimina automáticamente su historial (CASCADE)

\- El stored procedure es idempotente (se puede ejecutar múltiples veces)

---

## SCRUM-48: Tablas de logros_catalogo y logros_usuario

### Versión: v0.3.0
**Fecha:** 2025-01-24  
**Autor:** Jonathan García Martínez

---

## 📊 Tablas creadas

### 1. `logros_catalogo`
Catálogo de logros disponibles en el sistema.

**Estructura:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INT | Identificador único (PK) |
| `nombre` | VARCHAR(100) | Nombre del logro |
| `descripcion` | TEXT | Descripción del logro |
| `icono` | VARCHAR(50) | Emoji del logro |
| `tipo` | ENUM | Categoría: asistencia, votacion, encuesta, puntos |
| `meta` | INT | Valor necesario para completar |
| `estado` | ENUM | activo/inactivo |
| `fecha_creacion` | DATETIME | Timestamp de creación |

**Índices:**
- Primary key: `id`
- Index: `idx_tipo_estado` (tipo, estado)

---

### 2. `logros_usuario`
Almacena los logros obtenidos y en progreso de cada usuario.

**Estructura:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INT | Identificador único (PK) |
| `usuario_id` | INT | ID del usuario (FK) |
| `logro_id` | INT | ID del logro (FK) |
| `progreso` | INT | Valor actual (ej: 3 de 6 meses) |
| `completado` | TINYINT(1) | 0=En progreso, 1=Completado |
| `fecha_obtencion` | DATETIME | Cuándo completó el logro |
| `fecha_inicio` | DATETIME | Cuándo comenzó el logro |

**Índices:**
- Primary key: `id`
- Unique key: `uq_usuario_logro` (usuario_id, logro_id)
- Foreign key: `usuario_id` → `perfil_usuarios(id)` ON DELETE CASCADE
- Foreign key: `logro_id` → `logros_catalogo(id)` ON DELETE CASCADE
- Index: `idx_completado`

---

## ⚙️ Stored Procedure

### `sp_evaluar_logros_usuario(p_usuario_id)`
Evalúa y actualiza automáticamente los logros de un usuario basándose en:
- Asistencias a reuniones (meses sin faltas)
- Participación en votaciones
- Participación en encuestas
- Total de puntos acumulados

**Parámetros:**
- `p_usuario_id` (INT): ID del usuario a evaluar

**Uso:**
```sql
CALL sp_evaluar_logros_usuario(123);
```

**Proceso:**
1. Calcula métricas del usuario:
   - Meses sin faltas (últimos 6 meses)
   - Total de votaciones participadas
   - Total de encuestas completadas
   - Total de puntos acumulados
2. Actualiza progreso de cada logro
3. Marca logros como completados cuando se alcanza la meta
4. Registra fecha de obtención al completar

---

## 🏆 Logros disponibles

| ID | Nombre | Tipo | Meta | Descripción |
|----|--------|------|------|-------------|
| 1 | Asistente Comprometido 🎯 | asistencia | 3 | 3 meses consecutivos sin faltas |
| 2 | Asistencia Perfecta ⭐ | asistencia | 6 | 6 meses consecutivos sin faltas |
| 3 | Votante Principiante 🗳️ | votacion | 5 | Participar en 5 votaciones |
| 4 | Votante Activo 🏆 | votacion | 15 | Participar en 15 votaciones |
| 5 | Opinador 💭 | encuesta | 10 | Completar 10 encuestas |
| 6 | Voz del Sindicato 📢 | encuesta | 30 | Completar 30 encuestas |
| 7 | Coleccionista Bronce 🥉 | puntos | 250 | Acumular 250 puntos |
| 8 | Coleccionista Plata 🥈 | puntos | 500 | Acumular 500 puntos |
| 9 | Coleccionista Oro 🥇 | puntos | 1000 | Acumular 1000 puntos |
| 10 | Leyenda del Sindicato 👑 | puntos | 2000 | Acumular 2000 puntos |

---

## 🚀 Instalación

### Ejecutar el script:
```bash
mysql -u root -p dbsututeh < SCRUM-48_logros_tables.sql
```

O desde phpMyAdmin:
1. Seleccionar base de datos `dbsututeh`
2. Ir a la pestaña SQL
3. Copiar y pegar el contenido de `SCRUM-48_logros_tables.sql`
4. Ejecutar

---

## ✅ Verificación

Después de ejecutar el script:
```sql
-- Verificar tablas
SHOW TABLES LIKE 'logros_%';

-- Verificar estructura
DESCRIBE logros_catalogo;
DESCRIBE logros_usuario;

-- Verificar stored procedure
SHOW PROCEDURE STATUS WHERE Db = 'dbsututeh' AND Name = 'sp_evaluar_logros_usuario';

-- Verificar datos iniciales del catálogo
SELECT * FROM logros_catalogo;

-- Ver logros de un usuario específico
SELECT 
    lu.usuario_id,
    lc.nombre,
    lc.icono,
    lu.progreso,
    lc.meta,
    lu.completado,
    lu.fecha_obtencion
FROM logros_usuario lu
JOIN logros_catalogo lc ON lu.logro_id = lc.id
WHERE lu.usuario_id = 1;
```

---

## 📌 Notas importantes

- Las tablas usan `InnoDB` para soportar transacciones
- La relación usuario-logro es única (un usuario no puede tener duplicados del mismo logro)
- La eliminación de un usuario elimina automáticamente sus logros (CASCADE)
- La eliminación de un logro del catálogo elimina los registros de usuarios (CASCADE)
- El stored procedure es idempotente (se puede ejecutar múltiples veces)
- Los logros se evalúan en tiempo real cada vez que se llama al procedimiento
