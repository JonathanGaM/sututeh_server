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

// Para imágenes de portada
const storagePortadas = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "documentos_agremiados/portadas",
    resource_type: "image",
    allowed_formats: ["jpg","jpeg","png","gif"]
  }
});

// Para documentos (PDF, Word, Excel, PPT...)
const storageArchivos = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "documentos_agremiados/archivos",
    resource_type: "raw"
  }
});
// Para imágenes de rifas
const storageRifas = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "rifas/imagenes",
    resource_type: "image",
    allowed_formats: ["jpg","jpeg","png","gif"]
  }
});

// Para imágenes de productos de rifas
const storageProductosRifa = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "rifas/productos", 
    resource_type: "image",
    allowed_formats: ["jpg","jpeg","png","gif"]
  }
});




module.exports = { cloudinary, storage,storageEmpresa,storageNoticias,storageNosotros,storagePortadas,
  storageArchivos,storageRifas,storageProductosRifa };
