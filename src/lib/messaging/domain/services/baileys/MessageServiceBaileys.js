const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { IGNORED_MESSAGE_TYPES } = require('../../../infrastructure/config/whatsapp.config');

class MessageServiceBaileys {
    constructor(webhookService) {
        this.webhookService = webhookService;
        this.ignoredTypes = IGNORED_MESSAGE_TYPES || [];
    }

    async handleIncomingMessage(baileysMsg, sessionId, sock) {
        try {
            // 1. Validaciones iniciales
            if (!baileysMsg || !baileysMsg.key) return;
            if (baileysMsg.key.fromMe) return;
            if (!baileysMsg.message) return;

            const messageContent = baileysMsg.message;
            const messageType = this.getMessageType(messageContent);

            if (this.ignoredTypes.includes(messageType)) {
                console.log(`⏭️ Ignorando mensaje tipo: ${messageType} en ${sessionId}`);
                return;
            }

            // Verificar si es grupo
            const isGroup = baileysMsg.key.remoteJid.endsWith('@g.us');
            if (isGroup) {
                console.log(`⏭️ Ignorando mensaje de grupo en ${sessionId}`);
                return;
            }

            // 2. ⭐ Extraer datos del remitente con manejo de LID
            let senderJid = baileysMsg.key.remoteJid;
            let senderNumber = senderJid;

            // ⭐ Manejo de LID (Linked Device ID)
            if (senderJid.includes('@lid')) {
                try {
                    // En Baileys, el número real está en key.participant cuando es LID
                    if (baileysMsg.key.participant) {
                        senderNumber = baileysMsg.key.participant.split('@')[0].split(':')[0];
                        console.log(`✅ Número real obtenido desde LID: ${senderNumber}`);
                    } else {
                        // Fallback: extraer del propio JID
                        senderNumber = senderJid.split('@')[0].split(':')[0];
                        console.log(`✅ Número extraído de LID (fallback): ${senderNumber}`);
                    }
                } catch (error) {
                    console.error('❌ Error procesando LID:', error);
                    senderNumber = senderJid.split('@')[0];
                }
            } else if (senderJid.includes(':')) {
                // LID en formato alternativo (numero:id@s.whatsapp.net)
                senderNumber = senderJid.split(':')[0];
                console.log(`✅ Número desde formato LID alternativo: ${senderNumber}`);
            } else {
                // Formato normal
                senderNumber = senderJid.replace('@s.whatsapp.net', '');
            }

            // 3. Obtener nombre del contacto
            let contactName = baileysMsg.pushName || '';
            if (!contactName) {
                try {
                    const [contactInfo] = await sock.onWhatsApp(senderNumber + '@s.whatsapp.net');
                    contactName = contactInfo?.verifiedName || senderNumber;
                } catch (err) {
                    contactName = senderNumber;
                }
            }

            // 4. Extraer contenido del mensaje
            const { body, caption } = this.extractMessageContent(messageContent, messageType);

            // 5. Manejo de Media (Descarga)
            let base64Media = null;
            let mediaMimeType = null;
            let mediaFileName = null;
            let hasMediaContent = false;

            const hasMedia = this.hasMediaContent(messageContent);

            if (hasMedia) {
                try {
                    const mediaResult = await this.downloadBaileysMedia(
                        baileysMsg,
                        messageContent,
                        messageType,
                        sock
                    );

                    if (mediaResult) {
                        base64Media = mediaResult.base64;
                        mediaMimeType = mediaResult.mimetype;
                        mediaFileName = mediaResult.filename;
                        hasMediaContent = true;
                    }
                } catch (err) {
                    console.error('❌ Error descargando media:', err.message);
                }
            }

            // 6. Obtener número receptor
            const receiverNumber = this.getReceiverNumber(sock);

            // 7. Preparar mensaje de texto final
            let captureMessage = caption || body;
            if (messageType === 'location') {
                const loc = messageContent.locationMessage;
                captureMessage = `[Ubicación: ${loc.degreesLatitude}, ${loc.degreesLongitude}]`;
                if (loc.name) captureMessage += ` - ${loc.name}`;
            } else if (messageType === 'vcard') {
                captureMessage = '[Contacto compartido]';
            } else if (messageType === 'sticker') {
                captureMessage = '[Sticker]';
            }

            console.log(`📩 Mensaje de ${senderNumber} en ${sessionId}: ${captureMessage?.substring(0, 40) || '[Sin contenido]'}...`);

            // 8. Enviar al Webhook
            return await this.webhookService.sendToWebhook({
                id: baileysMsg.key.id,
                empresa: 'sigcrm_clinicasancho', // Parametrizable
                name: contactName,
                senderNumber: senderNumber,
                reciberNumber: receiverNumber,
                description: captureMessage || '',
                messageType: messageType,
                mediaDataBase64: base64Media,
                mediaMimeType,
                mediaFileName,
                hasMediaContent,
                timestamp: baileysMsg.messageTimestamp || Math.floor(Date.now() / 1000)
            });

        } catch (error) {
            console.error(`❌ Error procesando mensaje Baileys en ${sessionId}:`, error.message);
        }
    }

    /**
     * Determina el tipo de mensaje de Baileys
     */
    getMessageType(messageContent) {
        if (messageContent.conversation || messageContent.extendedTextMessage) {
            return 'chat';
        }
        if (messageContent.imageMessage) return 'image';
        if (messageContent.videoMessage) return 'video';
        if (messageContent.audioMessage) {
            return messageContent.audioMessage.ptt ? 'ptt' : 'audio';
        }
        if (messageContent.documentMessage) return 'document';
        if (messageContent.stickerMessage) return 'sticker';
        if (messageContent.locationMessage) return 'location';
        if (messageContent.contactMessage || messageContent.contactsArrayMessage) return 'vcard';
        if (messageContent.liveLocationMessage) return 'location';
        if (messageContent.reactionMessage) return 'reaction';

        return 'unknown';
    }

    /**
     * Extrae el contenido de texto del mensaje
     */
    extractMessageContent(messageContent, messageType) {
        let body = '';
        let caption = '';

        if (messageContent.conversation) {
            body = messageContent.conversation;
        } else if (messageContent.extendedTextMessage) {
            body = messageContent.extendedTextMessage.text;
        } else if (messageContent.imageMessage) {
            caption = messageContent.imageMessage.caption || '';
            body = caption;
        } else if (messageContent.videoMessage) {
            caption = messageContent.videoMessage.caption || '';
            body = caption;
        } else if (messageContent.documentMessage) {
            caption = messageContent.documentMessage.caption || '';
            body = caption || '[Documento]';
        } else if (messageContent.audioMessage) {
            body = '[Audio]';
        } else if (messageContent.stickerMessage) {
            body = '[Sticker]';
        } else if (messageContent.locationMessage) {
            body = '[Ubicación]';
        } else if (messageContent.contactMessage) {
            body = '[Contacto]';
        }

        return { body, caption };
    }

    /**
     * Verifica si el mensaje tiene contenido multimedia
     */
    hasMediaContent(messageContent) {
        return !!(
            messageContent.imageMessage ||
            messageContent.videoMessage ||
            messageContent.audioMessage ||
            messageContent.documentMessage ||
            messageContent.stickerMessage
        );
    }

    /**
     * Descarga media de un mensaje de Baileys
     */
    async downloadBaileysMedia(baileysMsg, messageContent, messageType, sock) {
        try {
            // Descargar el buffer
            const buffer = await downloadMediaMessage(
                baileysMsg,
                'buffer',
                {},
                {
                    logger: undefined,
                    reuploadRequest: sock.updateMediaMessage
                }
            );

            if (!buffer) {
                return null;
            }

            // Determinar mimetype y filename según el tipo
            let mimetype = 'application/octet-stream';
            let filename = `media_${Date.now()}`;
            let extension = 'bin';

            switch (messageType) {
                case 'image':
                    mimetype = messageContent.imageMessage.mimetype || 'image/jpeg';
                    extension = mimetype.split('/')[1]?.split(';')[0] || 'jpg';
                    filename = `image_${Date.now()}.${extension}`;
                    break;

                case 'video':
                    mimetype = messageContent.videoMessage.mimetype || 'video/mp4';
                    extension = mimetype.split('/')[1]?.split(';')[0] || 'mp4';
                    filename = `video_${Date.now()}.${extension}`;
                    break;

                case 'audio':
                case 'ptt':
                    mimetype = messageContent.audioMessage.mimetype || 'audio/ogg; codecs=opus';
                    extension = mimetype.includes('ogg') ? 'ogg' : 'mp3';
                    filename = `audio_${Date.now()}.${extension}`;
                    break;

                case 'document':
                    mimetype = messageContent.documentMessage.mimetype || 'application/pdf';
                    filename = messageContent.documentMessage.fileName || `document_${Date.now()}.pdf`;
                    break;

                case 'sticker':
                    mimetype = 'image/webp';
                    filename = `sticker_${Date.now()}.webp`;
                    break;
            }

            // Convertir a base64
            const base64 = buffer.toString('base64');

            return {
                base64,
                mimetype,
                filename
            };

        } catch (error) {
            console.error('❌ Error en downloadBaileysMedia:', error);
            throw error;
        }
    }

    /**
     * Obtiene el número receptor (quien recibe el mensaje)
     */
    getReceiverNumber(sock) {
        try {
            if (sock.user && sock.user.id) {
                // sock.user.id formato: "593XXXXXXXXX:XX@s.whatsapp.net"
                return sock.user.id.split(':')[0].replace('@s.whatsapp.net', '');
            }
            return 'desconocido';
        } catch (error) {
            return 'desconocido';
        }
    }
}

module.exports = MessageServiceBaileys;