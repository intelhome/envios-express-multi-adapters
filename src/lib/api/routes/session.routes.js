const express = require("express");
const router = express.Router();
const { validateIdExterno } = require("../middlewares/validation");

module.exports = (sessionController) => {

    // Cerrar sesión
    router.post("/:id_externo/logout", validateIdExterno, sessionController.logout);

    // Obtener estado de sesión
    router.get("/:id_externo/status", validateIdExterno, sessionController.getSessionStatus);

    return router;
};