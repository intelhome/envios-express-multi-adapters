const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const fs = require('fs');
const log = (pino = require("pino"));
const path = require('path');
const SocketService = require('../../../../shared/infrastructure/sockets/SocketService');
const { NO_RECONNECT_REASONS, DEFAULT_COUNTRY_CODE } = require('../../config/whatsapp.config');
const mongoAuthState = require('../../../../authentication/infrastructure/adapters/baileys-auth/mongoAuthState');
const { getCollection } = require('../../../../../infrastructure/database/connection');

class BaileysAdapter {
    constructor(sessionRepository, userRepository, messageService) {
        this.sessions = {};
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.messageService = messageService;
    }

    getServiceSession(sessionId) {
        return this.sessions[sessionId] || null;
    }

    async connect(sessionId, receiveMessages = false) {

        try {
            // ✅ Verificar si ya existe una sesión activa
            if (this.sessions[sessionId]) {
                const sessionData = this.sessions[sessionId];
                if (sessionData.status === 'CONNECTED' || sessionData.status === 'ready') {
                    console.log(`✅ Sesión ${sessionId} ya está conectada`);
                    return sessionData.sock;
                }
                // Si existe pero no está conectada, destruirla
                console.log(`⚠️ Destruyendo sesión anterior de ${sessionId}`);
                await this.disconnect(sessionId);
            }

            console.log(`🔄 Conectando Baileys para: ${sessionId}`);

            const sessionCollection = `session_auth_info_${sessionId}`;
            const collection_session = getCollection(sessionCollection);

            const { state, saveCreds } = await mongoAuthState(collection_session);

            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
                qrTimeout: 60 * 1000,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                defaultQueryTimeoutMs: undefined,
                logger: log({ level: "silent" }),
            });

            // ✅ Guardar credenciales cuando cambien
            sock.ev.on('creds.update', saveCreds);

            // ✅ Manejar actualizaciones de conexión
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // Manejar QR
                if (qr) {
                    console.log(`📱 QR generado para ${sessionId}`);
                    try {
                        const qrImage = await qrcode.toDataURL(qr);

                        this.sessions[sessionId] = {
                            ...this.sessions[sessionId],
                            sock,
                            status: 'qr_code',
                            qr: qrImage,
                            qrCode: qrImage,
                            connectedAt: null,
                            qrGeneratedAt: Date.now()
                        };

                        SocketService.emitQR(sessionId, qrImage, qr);
                    } catch (error) {
                        console.error(`❌ Error generando QR para ${sessionId}:`, error.message);
                    }
                }

                // Conexión abierta (equivalente a 'ready')
                if (connection === 'open') {
                    const user = await this.userRepository.findByExternalId(sessionId);

                    if (!user) {
                        console.error(`❌ Usuario no encontrado: ${sessionId}`);
                        return;
                    }

                    console.log(`✅ Baileys conectado: ${sessionId}`);

                    if (this.sessions[sessionId]) {
                        this.sessions[sessionId].status = 'ready';
                        this.sessions[sessionId].connectedAt = Date.now();
                    }

                    await this.userRepository.updateUser(sessionId, { estado: 'conectado' });

                    SocketService.emitConnected(sessionId, {
                        id: user._id || user.id || sessionId,
                        nombre: user.nombre || user.name || 'Usuario',
                        sessionId: user.sessionId,
                        fecha: user.fechaCreacion || user.fecha,
                        receive_messages: user.receive_messages,
                    });

                    // Emitir estado autenticado
                    SocketService.emitStatus(sessionId, 'authenticated');
                }

                // Conexión cerrada
                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output.statusCode
                        : 500;

                    const reason = this.getDisconnectReason(statusCode);
                    console.log(`❌ Desconectado ${sessionId}:`, reason);

                    // 1. Limpiar sesión de memoria
                    if (this.sessions[sessionId]) {
                        delete this.sessions[sessionId];
                        console.log(`✅ Sesión eliminada de memoria: ${sessionId}`);
                    }

                    // 2. Actualizar estado en BD
                    try {
                        await this.userRepository.updateUser(sessionId, {
                            estado: 'desconectado',
                        });
                        console.log(`✅ Estado actualizado en BD: ${sessionId}`);
                    } catch (error) {
                        console.error(`Error actualizando estado en DB:`, error.message);
                    }

                    // 3. Emitir evento de socket
                    if (reason === 'RESTART_REQUIRED') {
                        try {
                            SocketService.emitReconnecting(sessionId);
                            console.log(`✅ Socket notificado (reconectando): ${sessionId}`);
                        } catch (error) {
                            console.error(`Error emitiendo socket:`, error.message);
                        }
                    } else {
                        try {
                            SocketService.emitSessionClosed(sessionId);
                            console.log(`✅ Socket notificado: ${sessionId}`);
                        } catch (error) {
                            console.error(`Error emitiendo socket:`, error.message);
                        }
                    }

                    // 4. Decidir si reconectar
                    const shouldReconnect = this.shouldReconnect(statusCode);

                    if (shouldReconnect) {
                        console.log(`🔄 Reconectando en 5s: ${sessionId}`);
                        setTimeout(async () => {
                            try {
                                await this.connect(sessionId, receiveMessages);
                            } catch (reconnectError) {
                                console.error(`❌ Error reconectando ${sessionId}:`, reconnectError.message);
                            }
                        }, 5000);
                    } else {
                        console.log(`Sesión eliminada para ${sessionId}, no se reconectará`);

                        delete this.sessions[sessionId];

                        try {
                            const sessionCollectionName = `session_auth_info_${sessionId}`;
                            const collection = await getCollection(sessionCollectionName);
                            await collection.drop();
                            console.log(`🗑️ Colección ${sessionCollectionName} eliminada correctamente.`);

                            setTimeout(async () => {
                                console.log(`✨ Iniciando nueva solicitud de QR para ${sessionId}...`);
                                await this.connect(sessionId, receiveMessages);
                            }, 2000);

                        } catch (dropError) {
                            console.warn(`⚠️ No se pudo eliminar la colección, intentando conectar de todos modos.`);
                            // Reintento de conexión aunque falle el drop
                            await this.connect(sessionId, receiveMessages);
                        }
                    }
                }
            });

            // ✅ Manejar mensajes entrantes si está habilitado
            if (receiveMessages) {
                try {
                    sock.ev.on('messages.upsert', async ({ messages, type }) => {
                        if (type !== 'notify') return; // Solo mensajes nuevos

                        for (const msg of messages) {
                            // Ignorar mensajes propios o sin contenido
                            if (msg.key.fromMe || !msg.message) continue;

                            console.log(`📩 Mensaje recibido en ${sessionId}:`, msg.message.conversation || msg.message.extendedTextMessage?.text || '[Media]');

                            // Convertir mensaje de Baileys a formato compatible con tu MessageService
                            const adaptedMessage = this.adaptBaileysMessage(msg, sessionId);

                            await this.messageService.handleIncomingMessage(adaptedMessage, sessionId, sock);
                        }
                    });

                    // Manejar mensajes eliminados
                    sock.ev.on('messages.update', async (updates) => {
                        for (const update of updates) {
                            if (update.update.message === null) {
                                console.log(`🗑️ Mensaje eliminado: ${update.key.id}`);
                            }
                        }
                    });

                    console.log(`📩 Recepción activada para: ${sessionId}`);
                } catch (error) {
                    console.log("error ", error);
                }
            }

            // ✅ Guardar sesión
            this.sessions[sessionId] = {
                sock,
                status: 'connecting',
                receiveMessages
            };

            console.log(`✅ Baileys iniciado exitosamente: ${sessionId}`);
            return sock;

        } catch (error) {
            console.error(`❌ Error conectando Baileys para ${sessionId}:`, error.message);

            // Limpiar sesión fallida
            if (this.sessions[sessionId]) {
                await this.disconnect(sessionId);
            }

            throw new Error(`Error al conectar Baileys: ${error.message}`);
        }
    }

    async disconnect(sessionId) {
        try {
            const sessionData = this.sessions[sessionId];
            if (sessionData) {
                console.log(`🔌 Desconectando sesión: ${sessionId}`);

                try {
                    const { sock } = sessionData;
                    if (sock) {
                        sock.ev.removeAllListeners();
                        await sock.logout();
                    }
                } catch (error) {
                    console.warn(`⚠️ Error al cerrar socket ${sessionId}:`, error.message);
                }

                delete this.sessions[sessionId];
                console.log(`✅ Sesión ${sessionId} eliminada`);
            }
        } catch (error) {
            console.error(`❌ Error desconectando ${sessionId}:`, error.message);
        }
    }

    async sendMessage(sessionId, phone, message) {
        const sessionData = this.sessions[sessionId];
        if (!sessionData || !sessionData.sock) {
            throw new Error(`No hay sesión activa para ${sessionId}`);
        }

        if (sessionData.status !== 'ready' && sessionData.status !== 'CONNECTED') {
            throw new Error(`Sesión ${sessionId} no está conectada. Estado: ${sessionData.status}`);
        }

        const { sock } = sessionData;
        const jid = this.formatJID(phone);

        const result = await sock.sendMessage(jid, { text: message });

        return {
            id: {
                _serialized: result.key.id
            },
            timestamp: result.messageTimestamp,
            ack: 1, // Baileys no tiene ACK inmediato como wwebjs
            from: result.key.remoteJid
        };
    }

    async sendMediaMessage(sessionId, phone, media) {
        const sessionData = this.sessions[sessionId];
        if (!sessionData || !sessionData.sock) {
            throw new Error(`No hay sesión activa para ${sessionId}`);
        }

        if (sessionData.status !== 'ready' && sessionData.status !== 'CONNECTED') {
            throw new Error(`Sesión ${sessionId} no está conectada. Estado: ${sessionData.status}`);
        }

        const { sock } = sessionData;
        const jid = this.formatJID(phone);

        // 'media' debe ser el objeto MessageMedia de whatsapp-web.js adaptado
        // o un objeto compatible con Baileys
        const result = await sock.sendMessage(jid, media);

        return {
            id: {
                _serialized: result.key.id
            },
            timestamp: result.messageTimestamp,
            ack: 1
        };
    }

    async getSessionStatus(sessionId) {
        const sessionData = this.sessions[sessionId];
        if (!sessionData) {
            return { connected: false, state: 'DISCONNECTED' };
        }

        try {
            const state = sessionData.status === 'ready' ? 'CONNECTED' : sessionData.status.toUpperCase();
            return {
                connected: sessionData.status === 'ready',
                state
            };
        } catch (error) {
            return { connected: false, state: 'ERROR', error: error.message };
        }
    }

    getSession(sessionId) {
        const sessionData = this.sessions[sessionId];
        return sessionData ? sessionData.sock : null;
    }

    getAllSessions() {
        return Object.keys(this.sessions);
    }

    async isConnected(sessionId) {
        try {
            const sessionData = this.sessions[sessionId];
            if (!sessionData) {
                return false;
            }
            return sessionData.status === 'ready' || sessionData.status === 'CONNECTED';
        } catch (error) {
            console.error(`Error verificando conexión para ${sessionId}:`, error);
            return false;
        }
    }

    async getNumberId(id_externo, formattedNumber) {
        try {
            const sessionData = this.sessions[id_externo];

            if (!sessionData || !sessionData.sock) {
                throw new Error(`Cliente ${id_externo} no encontrado en el proveedor`);
            }

            const { sock } = sessionData;
            const jid = this.formatJID(formattedNumber);

            // onWhatsApp verifica si el número está registrado
            const [result] = await sock.onWhatsApp(jid);

            if (!result || !result.exists) {
                console.warn(`⚠️ El número ${formattedNumber} no está registrado en WhatsApp.`);
                return null;
            }

            return result.jid; // Equivalente a _serialized en wwebjs

        } catch (error) {
            console.error(`❌ Error en getNumberId para ${formattedNumber}:`, error.message);
            throw error;
        }
    }

    async getSenderNumber(id_externo) {
        try {
            const sessionData = this.sessions[id_externo];

            if (!sessionData || !sessionData.sock) {
                console.warn(`⚠️ No se pudo obtener el número del emisor para: ${id_externo}. ¿Sesión lista?`);
                return null;
            }

            const { sock } = sessionData;

            // En Baileys, el número del usuario está en sock.user.id
            if (sock.user && sock.user.id) {
                // sock.user.id viene en formato: 593XXXXXXXXX:XX@s.whatsapp.net
                return sock.user.id.split(':')[0].replace('@s.whatsapp.net', '');
            }

            return null;

        } catch (error) {
            console.error(`❌ Error en getSenderNumber para ${id_externo}:`, error.message);
            return null;
        }
    }

    async sendMediaByType(id_externo, chatId, mediaData) {
        const { type, link, tempMessage, latitud, longitud, file } = mediaData;
        const sessionData = this.sessions[id_externo];

        if (!sessionData || !sessionData.sock) {
            throw new Error('Cliente no encontrado');
        }

        const { sock } = sessionData;
        const jid = this.formatJID(chatId);

        let result;

        switch (type) {
            case 'image': {
                result = await sock.sendMessage(jid, {
                    image: { url: link },
                    caption: tempMessage || ''
                });
                break;
            }

            case 'video': {
                result = await sock.sendMessage(jid, {
                    video: { url: link },
                    caption: tempMessage || ''
                });
                break;
            }

            case 'audio': {
                result = await sock.sendMessage(jid, {
                    audio: { url: link },
                    mimetype: 'audio/mp4',
                    ptt: true // Push to talk (nota de voz)
                });
                break;
            }

            case 'location': {
                result = await sock.sendMessage(jid, {
                    location: {
                        degreesLatitude: latitud,
                        degreesLongitude: longitud,
                        name: tempMessage || 'Ubicación'
                    }
                });
                break;
            }

            case 'document': {
                const pathname = new URL(link).pathname;
                const filename = decodeURIComponent(pathname.substring(pathname.lastIndexOf('/') + 1));

                result = await sock.sendMessage(jid, {
                    document: { url: link },
                    fileName: file || filename,
                    caption: tempMessage || '',
                    mimetype: 'application/pdf'
                });
                break;
            }

            case 'documentBase64': {
                const buffer = Buffer.from(link, 'base64');

                result = await sock.sendMessage(jid, {
                    document: buffer,
                    fileName: `${file || 'documento'}.pdf`,
                    caption: tempMessage || '',
                    mimetype: 'application/pdf'
                });
                break;
            }

            default: {
                result = await sock.sendMessage(jid, { text: tempMessage });
                break;
            }
        }

        return {
            messageId: result.key.id,
            timestamp: result.messageTimestamp,
            ack: 1,
            raw: result
        };
    }

    async formatPhoneNumber(number) {
        let formatted = String(number || '').replace(/[^\d]/g, '');

        if (!formatted) {
            throw new Error('Número inválido');
        }

        // Agregar código de país Ecuador
        if (formatted.length === 10 && !formatted.startsWith(DEFAULT_COUNTRY_CODE)) {
            formatted = DEFAULT_COUNTRY_CODE + formatted;
        } else if (formatted.length === 9 && !formatted.startsWith(DEFAULT_COUNTRY_CODE)) {
            formatted = DEFAULT_COUNTRY_CODE + formatted;
        }

        return formatted;
    }

    // ========== MÉTODOS AUXILIARES DE BAILEYS ==========

    formatJID(phone) {
        // Eliminar @c.us o @s.whatsapp.net si ya viene
        let number = phone.replace(/@c\.us|@s\.whatsapp\.net/g, '');

        // Asegurar que termine con @s.whatsapp.net
        return number.includes('@') ? number : `${number}@s.whatsapp.net`;
    }

    getDisconnectReason(statusCode) {
        const reasons = {
            [DisconnectReason.badSession]: 'UNPAIRED',
            [DisconnectReason.connectionClosed]: 'CONNECTION_CLOSED',
            [DisconnectReason.connectionLost]: 'CONNECTION_LOST',
            [DisconnectReason.connectionReplaced]: 'CONFLICT',
            [DisconnectReason.loggedOut]: 'LOGOUT',
            [DisconnectReason.restartRequired]: 'RESTART_REQUIRED',
            [DisconnectReason.timedOut]: 'TIMEOUT',
            [DisconnectReason.multideviceMismatch]: 'MULTIDEVICE_MISMATCH'
        };

        return reasons[statusCode] || `UNKNOWN_${statusCode}`;
    }

    shouldReconnect(statusCode) {
        const noReconnect = [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.connectionReplaced
        ];

        return !noReconnect.includes(statusCode);
    }

    /**
     * Adapta un mensaje de Baileys al formato esperado por MessageService
     * (compatible con whatsapp-web.js)
     */
    adaptBaileysMessage(baileysMsg, sessionId) {
        const messageContent = baileysMsg.message;

        // Extraer texto según el tipo de mensaje
        let body = '';
        if (messageContent.conversation) {
            body = messageContent.conversation;
        } else if (messageContent.extendedTextMessage) {
            body = messageContent.extendedTextMessage.text;
        } else if (messageContent.imageMessage) {
            body = messageContent.imageMessage.caption || '';
        } else if (messageContent.videoMessage) {
            body = messageContent.videoMessage.caption || '';
        } else if (messageContent.documentMessage) {
            body = messageContent.documentMessage.caption || '';
        }

        // Formato compatible con whatsapp-web.js
        return {
            id: {
                _serialized: baileysMsg.key.id,
                fromMe: baileysMsg.key.fromMe,
                remote: baileysMsg.key.remoteJid
            },
            from: baileysMsg.key.remoteJid,
            to: sessionId,
            body: body,
            type: this.getBaileysMessageType(messageContent),
            timestamp: baileysMsg.messageTimestamp,
            hasMedia: !!(messageContent.imageMessage || messageContent.videoMessage ||
                messageContent.audioMessage || messageContent.documentMessage),
            isForwarded: messageContent.extendedTextMessage?.contextInfo?.isForwarded || false,
            // Métodos simulados para compatibilidad
            getChat: async () => ({ id: { _serialized: baileysMsg.key.remoteJid } }),
            getContact: async () => ({ id: { _serialized: baileysMsg.key.remoteJid } }),
            // Agregar el mensaje original de Baileys para acceso completo si se necesita
            _raw: baileysMsg
        };
    }

    getBaileysMessageType(messageContent) {
        if (messageContent.conversation || messageContent.extendedTextMessage) return 'chat';
        if (messageContent.imageMessage) return 'image';
        if (messageContent.videoMessage) return 'video';
        if (messageContent.audioMessage) return 'audio';
        if (messageContent.documentMessage) return 'document';
        if (messageContent.stickerMessage) return 'sticker';
        if (messageContent.locationMessage) return 'location';
        if (messageContent.contactMessage) return 'vcard';
        return 'unknown';
    }


    async getState(sessionId) {
        const sessionData = this.sessions[sessionId];
        if (!sessionData) {
            return 'DISCONNECTED';
        }

        // Mapear estados de Baileys a estados de wwebjs
        const statusMap = {
            'ready': 'CONNECTED',
            'qr_code': 'QR_CODE',
            'connecting': 'OPENING',
            'authenticated': 'CONNECTED'
        };

        return statusMap[sessionData.status] || sessionData.status.toUpperCase();
    }

    getQRCode(sessionId) {
        const sessionData = this.sessions[sessionId];
        return sessionData?.qrCode || sessionData?.qr || null;
    }

    async getPhoneNumber(sessionId) {
        const sessionData = this.sessions[sessionId];
        if (!sessionData || !sessionData.sock || !sessionData.sock.user) {
            return null;
        }

        const userId = sessionData.sock.user.id;
        return userId.split(':')[0].replace('@s.whatsapp.net', '');
    }
}

module.exports = BaileysAdapter;