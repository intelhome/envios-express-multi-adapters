const moment = require('moment-timezone');
const { ACK_STATUS } = require('../../../../messaging/infrastructure/config/whatsapp.config');

class SendMediaMessageUniversalUseCase {
    constructor(whatsappProvider) {
        this.whatsappProvider = whatsappProvider;
    }

    async execute(id_externo, mediaData) {
        const { number, tempMessage, link, type, latitud, longitud, file } = mediaData;

        // Verificar conexión
        const isConnected = await this.whatsappProvider.isConnected(id_externo);
        if (!isConnected) {
            console.log(`❌ Cliente ${id_externo} no conectado`);
            return {
                success: false,
                message: 'Cliente no conectado o sesión inactiva',
                id_externo: id_externo
            };
        }

        // Determinar chatId y tipo de contacto
        let chatId;
        let contactType;

        if (number.includes('@lid')) {
            chatId = number;
            contactType = 'lid';
        } else if (number.includes('@c.us')) {
            chatId = number;
            contactType = 'c.us';
        } else if (number.includes('@')) {
            chatId = number;
            contactType = number.includes('@lid') ? 'lid' : 'c.us';
        } else {
            const formattedNumber = await this.whatsappProvider.formatPhoneNumber(number);
            chatId = `${formattedNumber}@c.us`;
            contactType = 'c.us';
        }

        // Verificar si está registrado
        const isRegistered = await this.whatsappProvider.getNumberId(id_externo, chatId);
        if (!isRegistered) {
            console.log(`❌ El contacto ${chatId} NO está registrado en WhatsApp`);
            return {
                success: false,
                message: `El contacto ${contactType === 'lid' ? 'LID' : ''} no está registrado en WhatsApp`,
                recipientContact: chatId
            };
        }

        // Enviar según tipo
        let result;

        try {
            result = await this.whatsappProvider.sendMediaByType(id_externo, chatId, {
                type,
                link,
                tempMessage,
                latitud,
                longitud,
                file
            });
        } catch (error) {
            console.error(`❌ Error enviando media:`, error);
            throw error;
        }

        const senderNumber = await this.whatsappProvider.getSenderNumber(id_externo);
        const fecha = moment().tz('America/Guayaquil').format('YYYY-MM-DD HH:mm:ss');

        console.log({
            De: `cliente-${id_externo}`,
            Para: chatId,
            EnviadoPor: senderNumber,
            Message: tempMessage,
            Tipo: type,
            TipoContacto: contactType.toUpperCase(),
            Fecha: fecha,
            MessageId: result.messageId,
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        return {
            success: true,
            messageId: result.messageId,
            timestamp: result.timestamp,
            senderNumber: senderNumber,
            recipientContact: chatId,
            contactType,
            type,
            ack: result.ack,
            ackName: ACK_STATUS[result.ack],
            fecha
        };
    }
}

module.exports = SendMediaMessageUniversalUseCase;