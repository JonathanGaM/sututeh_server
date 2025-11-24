//middlewares/verifyMobiletoken.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  // ACEPTA TODAS LAS FORMAS DEL HEADER
  const authHeader =
    req.headers.authorization ||
    req.headers.Authorization ||
    req.headers.AUTHORIZATION;

  if (!authHeader) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Error verificando token móvil:", err);
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};
