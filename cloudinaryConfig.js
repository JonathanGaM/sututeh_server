const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "imagenes_usuarios", // carpeta en tu cuenta Cloudinary
    allowed_formats: ["jpg", "png"],
  },
});
const storageEmpresa = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "datos_empresa",       // nueva carpeta para tus uploads de empresa
    allowed_formats: ["jpg", "png"],
  },
});

const storageNoticias = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".mp4", ".mov", ".avi", ".mkv"].includes(ext)) {
      return {
        folder: "noticias/videos",
        resource_type: "video",
        format: ext.slice(1),
      };
    }
    return {
      folder: "noticias/imagenes",
      resource_type: "image",
      format: ext.slice(1),
    };
  },
});
const storageNosotros = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "nosotros",       // carpeta para uploads de la sección Nosotros
    allowed_formats: ["jpg", "png"],
  },
});


module.exports = { cloudinary, storage,storageEmpresa,storageNoticias,storageNosotros };
