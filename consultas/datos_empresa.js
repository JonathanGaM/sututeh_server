    const express = require('express');
    const pool = require('../bd');
    const multer           = require("multer");
    const { storageEmpresa } = require("../cloudinaryConfig");


    const upload = multer({ storage: storageEmpresa });

    const router = express.Router();

    /**
     * GET /api/datos-empresa
     * Devuelve todos los registros de datos_empresa junto con sus redes sociales
     */


    router.get('/', async (req, res) => {
        try {
        // 1) Consultar empresas (ahora con latitud, longitud)
        const [empresas] = await pool.query(`
            SELECT 
            id,
            direccion,
            telefono,
            correo,
            nombre_empresa,
            titulo_empresa,
            avatar_url,
            cover_url,
            latitud,
            longitud,
            fecha_creacion,
            fecha_actualizacion
            FROM datos_empresa
        `);
    
        // 2) Consultar todas las redes sociales (sin cambios)
        const [redes] = await pool.query(`
            SELECT 
            id,
            empresa_id,
            red_social,
            enlace,
            estado,
            fecha_creacion,
            fecha_actualizacion
            FROM redes_sociales
        `);
    
        // 3) Asociar
        const resultado = empresas.map(emp => ({
            ...emp,
            redes: redes.filter(r => r.empresa_id === emp.id)
        }));
    
        res.json(resultado);
        } catch (err) {
        console.error('Error al consultar datos_empresa:', err);
        res.status(500).json({ error: 'Error interno' });
        }
    });

    /**
     * PUT /api/datos-empresa/:id
     * Actualiza cualquier campo de la empresa, y opcionalmente avatar y/o cover
     */



    router.put(
        "/:id",
        upload.fields([
        { name: "avatar", maxCount: 1 },
        { name: "cover",  maxCount: 1 }
        ]),
        async (req, res) => {
        const { id } = req.params;
        const {
            direccion,
            telefono,
            correo,
            nombre_empresa,
            titulo_empresa,
            latitud,
            longitud
        } = req.body;
    
        const avatar_url = req.files?.avatar?.[0]?.path ?? null;
        const cover_url  = req.files?.cover?.[0]?.path  ?? null;
    
        try {
            // Construimos dinámicamente SET según campos recibidos
            const campos = [];
            const valores = [];
    
            if (direccion)      { campos.push("direccion = ?");      valores.push(direccion); }
            if (telefono)       { campos.push("telefono = ?");       valores.push(telefono); }
            if (correo)         { campos.push("correo = ?");         valores.push(correo); }
            if (nombre_empresa) { campos.push("nombre_empresa = ?"); valores.push(nombre_empresa); }
            if (titulo_empresa) { campos.push("titulo_empresa = ?"); valores.push(titulo_empresa); }
            if (latitud)        { campos.push("latitud = ?");        valores.push(latitud); }
            if (longitud)       { campos.push("longitud = ?");       valores.push(longitud); }
            if (avatar_url)     { campos.push("avatar_url = ?");     valores.push(avatar_url); }
            if (cover_url)      { campos.push("cover_url = ?");      valores.push(cover_url); }
    
            if (!campos.length)
            return res.status(400).json({ error: "No hay campos para actualizar" });
    
            valores.push(id);
            const sql = `
            UPDATE datos_empresa
            SET ${campos.join(", ")}, fecha_actualizacion = NOW()
            WHERE id = ?
            `;
            const [result] = await pool.query(sql, valores);
    
            if (result.affectedRows === 0)
            return res.status(404).json({ error: "Empresa no encontrada" });
    
            // Devolver registro actualizado
            const [[updated]] = await pool.query(
            `SELECT * FROM datos_empresa WHERE id = ?`, [id]
            );
            res.json({ message: "Datos actualizados", updated });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Error interno" });
        }
        }
    );
    /**
     * POST /api/redes-sociales
     * Crea una nueva red vinculada a una empresa
     */
    // POST   /api/datos-empresa/:empresaId/redes
    router.post("/:empresaId/redes", async (req, res) => {
        const { empresaId } = req.params;               // <-- toma el ID de la URL
        const { red_social, enlace, estado } = req.body; // <-- sólo lees los campos que te envía el cliente
    
        try {
        const [result] = await pool.query(
            `INSERT INTO redes_sociales
            (empresa_id, red_social, enlace, estado)
            VALUES (?, ?, ?, ?)`,
            [empresaId, red_social, enlace, estado]      // <-- aquí usas empresaId en vez de empresa_id
        );
        res.status(201).json({ id: result.insertId, message: "Red creada" });
        } catch (err) {
        console.error("Error al crear red:", err);
        res.status(500).json({ error: "Error interno" });
        }
    });

    
    
    
    /**
     * PUT /api/redes-sociales/:id
     * Actualiza enlace y/o estado de una red existente
     */
    router.put("/:empresaId/redes/:id", async (req, res) => {
        const { id } = req.params;
        const { enlace, estado } = req.body;
        try {
        const [result] = await pool.query(
            `UPDATE redes_sociales
            SET enlace = ?, estado = ?, fecha_actualizacion = NOW()
            WHERE id = ?`,
            [enlace, estado, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: "Red no encontrada" });
        res.json({ message: "Red actualizada" });
        } catch (err) {
        console.error("Error al actualizar red:", err);
        res.status(500).json({ error: "Error interno" });
        }
    });
    
    /**
     * DELETE /api/redes-sociales/:id
     */
    router.delete("/:empresaId/redes/:id", async (req,res)=> {
        const { id } = req.params;
        try {
        const [result] = await pool.query(`
            DELETE FROM redes_sociales WHERE id = ?
        `, [id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ error: "Red no encontrada" });
        res.json({ message: "Red eliminada" });
        } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error interno" });
        }
    });
        

    module.exports = router;
