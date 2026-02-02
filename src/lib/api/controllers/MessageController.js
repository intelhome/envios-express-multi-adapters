class MessageController {
    constructor(sendMessageUseCase, sendMediaMessageUseCase, sendMediaMessageUniversalUseCase) {
        this.sendMessageUseCase = sendMessageUseCase;
        this.sendMediaMessageUseCase = sendMediaMessageUseCase;
        this.sendMediaMessageUniversalUseCase = sendMediaMessageUniversalUseCase;
    }

    /* Envio de mensajes de texto simple */
    sendMessage = async (req, res, next) => {
        try {
            const { id_externo } = req.params;
            const { number, message, tempMessage, pdfBase64, imageBase64 } = req.body;

            if (!number) {
                return res.status(400).json({
                    status: false,
                    response: "El número es obligatorio"
                });
            }

            if (!message && !tempMessage && !pdfBase64 && !imageBase64) {
                return res.status(400).json({
                    status: false,
                    response: "Debes proporcionar un mensaje o archivo"
                });
            }

            // Llamar al caso de uso
            const result = await this.sendMessageUseCase.execute(
                id_externo,
                req.body
            );

            if (result.success === false) {
                return res.status(400).json({
                    status: false,
                    response: result.message,
                });
            }

            return res.status(200).json({
                status: true,
                response: result,
            });

        } catch (error) {
            res.status(500).json({
                status: false,
                response: error.message,
            });
        }
    }

    /* Envía mensajes multimedia (imagen, video, audio, documento, ubicación) */
    sendMediaMessage = async (req, res, next) => {
        try {
            const { id_externo } = req.params;
            const { number, tempMessage, link, type, latitud, longitud, file } = req.body;

            // Validación mínima
            if (!number) {
                return res.status(400).json({
                    status: false,
                    response: "El número es requerido"
                });
            }

            const result = await this.sendMediaMessageUseCase.execute(
                id_externo,
                req.body
            );

            if (result.success === false) {
                return res.status(400).json({
                    status: false,
                    response: result.message,
                });
            }

            return res.status(200).json({
                status: true,
                response: result,
            });

        } catch (error) {
            res.status(500).json({
                status: false,
                response: error.message,
            });
        }
    }

    sendMediaMessageUniversal = async (req, res, next) => {
        try {
            const { id_externo } = req.params;
            const { number, tempMessage, link, type, latitud, longitud, file } = req.body;

            // Validación: debe existir al menos uno
            if (!number) {
                return res.status(400).json({
                    status: false,
                    response: "Se requiere al menos uno: contact, number o lid"
                });
            }

            const result = await this.sendMediaMessageUniversalUseCase.execute(
                id_externo,
                req.body
            );

            if (result.success === false) {
                return res.status(400).json({
                    status: false,
                    response: result.message,
                });
            }

            return res.status(200).json({
                status: true,
                response: result,
            });

        } catch (error) {
            res.status(500).json({
                status: false,
                response: error.message,
            });
        }
    }
}

module.exports = MessageController;