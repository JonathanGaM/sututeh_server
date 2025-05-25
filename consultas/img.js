//img.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage } = require("../cloudinaryConfig");
const upload = multer({ storage });
const pool = require("../bd");

// Endpoint para subir imagen de perfil y actualizar la URL en la base de datos
router.post("/subirImagen", upload.single("imagen"), async (req, res) => {
  try {
    // La imagen se subió a Cloudinary; la URL resultante está en req.file.path
    const urlFoto = req.file.path;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Falta el parámetro email" });
    }

    // Actualiza el campo 'url_foto' en la tabla de usuarios
    await pool.query(
      "UPDATE usuarios SET url_foto = ? WHERE correo_electronico = ?",
      [urlFoto, email]
    );

    return res.json({
      message: "Imagen actualizada correctamente",
      urlFoto,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
