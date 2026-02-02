const express = require("express");
const router = express.Router();
const { validateSendMessage, validateIdExterno } = require("../middlewares/validation");

module.exports = (messageController) => {

    // Enviar mensaje
    router.post(
        "/:id_externo",
        validateIdExterno,
        validateSendMessage,
        messageController.sendMessage
    );

    // Enviar mensaje multimedia
    router.post(
        "/media/:id_externo",
        validateIdExterno,
        messageController.sendMediaMessage
    );

    // Enviar mensajes lid
    router.post(
        "/universal-media/:id_externo",
        validateIdExterno,
        messageController.sendMediaMessageUniversal
    );

    return router;
};