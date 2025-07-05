
// server/config/refreshSession.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.cookies.authToken;
  
  // Si no hay token, simplemente continúa (NO devuelve 401)
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
     const isProduction = process.env.NODE_ENV === 'production';
    res.cookie("authToken", newToken, {
      httpOnly: true,
       secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 5 * 60 * 1000 ,
       path: "/" 
    });

    req.user = payload;
    next();
  } catch (err) {
    // ⭐ Solo loguea el error, NO devuelve 401
    console.log("Token inválido:", err.message);
     // 🔧 Limpiar cookie inválida con la misma configuración
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/"
    });
    
    
    next();
  }
};

