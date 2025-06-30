
// server/config/refreshSession.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.cookies.authToken;
  
  // ⭐ Si no hay token, simplemente continúa (NO devuelve 401)
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = jwt.sign(
      { sub: payload.sub, role: payload.role },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    );
    
    res.cookie("authToken", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: "lax",
      maxAge: 5 * 60 * 1000 ,
    });

    req.user = payload;
    next();
  } catch (err) {
    // ⭐ Solo loguea el error, NO devuelve 401
    console.log("Token inválido:", err.message);
    next();
  }
};
