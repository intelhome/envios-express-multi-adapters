const { IGNORED_MESSAGE_TYPES } = require('../../../infrastructure/config/whatsapp.config');

class MessageService {
    constructor(webhookService) {
        this.webhookService = webhookService;
        this.ignoredTypes = IGNORED_MESSAGE_TYPES || [];
    }

    async handleIncomingMessage(message, sessionId, client) {
        try {
            // 1. Validaciones iniciales
            if (!message || !message.from) return;
            if (message.fromMe) return;

            const messageType = message.type || 'unknown';
            if (this.ignoredTypes.includes(messageType)) {
                console.log(`⏭️ Ignorando mensaje tipo: ${messageType} en ${sessionId}`);
                return;
            }

            const chat = await message.getChat();
            if (chat.isGroup) {
                console.log(`⏭️ Ignorando mensaje de grupo en ${sessionId}`);
                return;
            }

            // 2. Procesar Identidad del Remitente (Manejo de LID)
            let senderNumber = message.from || '';
            if (senderNumber.includes('@lid')) {
                const contactInfoArray = await client.getContactLidAndPhone([senderNumber]);
                if (contactInfoArray && contactInfoArray.length > 0) {
                    senderNumber = contactInfoArray[0].pn;
                    console.log(`✅ Número real LID obtenido: ${senderNumber}`);
                }
            }

            // 3. Obtener nombre del contacto
            let contactName = '';
            try {
                const contact = await message.getContact();
                contactName = contact.pushname || contact.name || contact.verifiedName || senderNumber.split('@')[0];
            } catch (err) {
                contactName = senderNumber.split('@')[0];
            }

            // 4. Manejo de Media (Descarga)
            let base64Media = null;
            let mediaMimeType = null;
            let mediaFileName = null;
            let hasMediaContent = false;

            if (message.hasMedia) {
                try {
                    const media = await message.downloadMedia();
                    if (media && media.data) {
                        base64Media = media.data;
                        mediaMimeType = media.mimetype || 'application/octet-stream';
                        const ext = mediaMimeType.split('/')[1]?.split(';')[0] || 'bin';
                        mediaFileName = media.filename || `${messageType}_${Date.now()}.${ext}`;
                        hasMediaContent = true;
                    }
                } catch (err) {
                    console.error('❌ Error descargando media:', err.message);
                }
            }

            // 5. Normalizar contenido del mensaje (Capturar texto según tipo)
            let captureMessage = '';
            switch (messageType) {
                case 'chat':
                    captureMessage = message.body || '';
                    break;
                case 'image':
                case 'video':
                case 'document':
                case 'audio':
                case 'ptt':
                    captureMessage = message.caption || message.body || '';
                    break;
                case 'location':
                    captureMessage = `[Ubicación: ${message.location?.latitude}, ${message.location?.longitude}]`;
                    break;
                case 'vcard':
                    captureMessage = '[Contacto compartido]';
                    break;
                case 'sticker':
                    captureMessage = '[Sticker]';
                    break;
                default:
                    captureMessage = message.body || `[${messageType}]`;
            }

            const receiverNumber = client.info?.wid?.user || 'desconocido';

            console.log(`📩 Mensaje de ${senderNumber} en ${sessionId}: ${captureMessage.substring(0, 40)}...`);

            // 6. Enviar al Webhook
            return await this.webhookService.sendToWebhook({
                id: message.id.id,
                empresa: 'sigcrm_clinicasancho', // Puedes parametrizar esto si es dinámico
                name: contactName,
                senderNumber: senderNumber.replace('@c.us', ''),
                reciberNumber: receiverNumber,
                description: captureMessage,
                messageType: messageType,
                mediaDataBase64: base64Media,
                mediaMimeType,
                mediaFileName,
                hasMediaContent,
                timestamp: message.timestamp || Math.floor(Date.now() / 1000)
            });

        } catch (error) {
            console.error(`❌ Error procesando mensaje en ${sessionId}:`, error.message);
        }
    }
}

module.exports = MessageService;