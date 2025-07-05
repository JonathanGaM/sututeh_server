// server/consultas/authCheck.js - ARREGLADO
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  if (req.user) {
    // Convertir el nombre del rol a roleId
    let roleId = null;
    if (req.user.role === 'Agremiado') {
      roleId = 1;
    } else if (req.user.role === 'Admin') {
      roleId = 2;
    }

    res.json({
      success: true,
      user: {
        id: req.user.sub,
        roleId: roleId
      }
    });
  } else {
    res.status(401).json({ error: 'No autorizado' });
  }
});

module.exports = router;