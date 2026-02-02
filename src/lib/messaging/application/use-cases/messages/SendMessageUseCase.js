const moment = require('moment-timezone');
const { ACK_STATUS } = require('../../../../messaging/infrastructure/config/whatsapp.config');

class SendMessageUseCase {
    constructor(whatsappProvider) {
        this.whatsappProvider = whatsappProvider;
    }

    async execute(id_externo, messageData) {
        const {
            number,
            message,
            tempMessage,
            pdfBase64,
            imageBase64,
            fileName,
            caption
        } = messageData;

        // Verificar que el cliente existe y está conectado
        const isConnected = await this.whatsappProvider.isConnected(id_externo);
        if (!isConnected) {
            console.log(`❌ Cliente ${id_externo} no conectado`);
            return {
                success: false,
                message: 'Cliente no conectado o sesión inactiva',
                id_externo: id_externo
            };
        }

        // Formatear número
        const formattedNumber = await this.whatsappProvider.formatPhoneNumber(number);

        // Verificar si el número está registrado en WhatsApp
        let chatId;
        try {
            chatId = await this.whatsappProvider.getNumberId(id_externo, formattedNumber);

            if (!chatId) {
                console.log(`❌ El número ${formattedNumber} NO está registrado en WhatsApp`);
                return {
                    success: false,
                    message: "El número no está registrado en WhatsApp",
                    recipientContact: formattedNumber
                };
            }

            console.log('✅ ChatId verificado:', chatId);

        } catch (error) {
            console.error('❌ Error verificando número:', error.message);
            throw new Error(`El número ${formattedNumber} no está registrado en WhatsApp`);
        }

        const messageText = message || tempMessage;
        let result;

        try {
            // Enviar con archivo o solo texto
            if (pdfBase64 || imageBase64) {
                const mimeType = pdfBase64 ? 'application/pdf' : 'image/jpeg';
                const base64Data = pdfBase64 || imageBase64;
                const defaultName = pdfBase64 ? 'documento.pdf' : 'imagen.jpg';

                console.log('📎 Enviando mensaje con multimedia');

                result = await this.whatsappProvider.sendMediaMessage(id_externo, chatId, {
                    mimeType,
                    base64Data,
                    fileName: fileName || defaultName,
                    caption: caption || messageText || ''
                });
            } else {
                console.log('💬 Enviando mensaje de texto simple');
                result = await this.whatsappProvider.sendMessage(id_externo, chatId, messageText);
            }
        } catch (sendError) {
            console.error('❌ Error al enviar mensaje:', sendError);

            // Manejo de errores específicos
            if (sendError.message.includes('Evaluation failed')) {
                throw new Error('Error al procesar el mensaje. El número puede no ser válido');
            }

            if (sendError.message.includes('Phone not connected')) {
                throw new Error('Teléfono desconectado. Reconecta el dispositivo');
            }

            throw new Error(`Error enviando mensaje: ${sendError.message}`);
        }

        // Obtener información del cliente
        const senderNumber = await this.whatsappProvider.getSenderNumber(id_externo);
        const { messageId, timestamp, ack } = result;
        const fecha = moment().tz('America/Guayaquil').format('YYYY-MM-DD HH:mm:ss');

        const contactType = chatId.includes('@g.us') ? 'group' : 'individual';

        // Log de éxito simplificado
        console.log(`✅ Mensaje enviado: ${id_externo} ➡️ ${formattedNumber}`);

        // Log detallado
        console.dir({
            transaccion: { de: `cliente-${id_externo}`, para: chatId },
            mensaje: {
                id: messageId,
                cuerpo: tempMessage,
                fecha
            },
            meta: {
                enviadoPor: senderNumber,
                contacto: contactType.toUpperCase()
            }
        }, { depth: null, colors: true });

        return {
            messageId,
            timestamp,
            senderNumber,
            recipientNumber: formattedNumber,
            ack,
            ackName: ACK_STATUS[ack] ?? 'Desconocido',
            fecha
        };
    }
}

module.exports = SendMessageUseCase;