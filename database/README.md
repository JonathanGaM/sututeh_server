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

