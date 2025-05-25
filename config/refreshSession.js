// server/config/refreshSession.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) return res.status(401).end();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // opcionalmente puedes volver a firmar un nuevo token para renovar el iat/exp:
    const newToken = jwt.sign(
      { sub: payload.sub, role: payload.role },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );
    // reescribe la cookie:
    res.cookie("authToken", newToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 30 * 60 * 1000,
    });

    // adjunta el payload a req.user para que tus rutas lo usen:
    req.user = payload;
    next();
  } catch (err) {
    // token expirado o inválido
    return res.status(401).json({ error: "Sesión expirada" });
  }
};
