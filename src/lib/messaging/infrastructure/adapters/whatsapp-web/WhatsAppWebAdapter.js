const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const SocketService = require('../../../../shared/infrastructure/sockets/SocketService');
const { NO_RECONNECT_REASONS, DEFAULT_COUNTRY_CODE } = require('../../config/whatsapp.config');

class WhatsAppWebAdapter {
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
                const state = await this.sessions[sessionId].getState();
                if (state === 'CONNECTED') {
                    console.log(`✅ Sesión ${sessionId} ya está conectada`);
                    return this.sessions[sessionId];
                }
                // Si existe pero no está conectada, destruirla
                console.log(`⚠️ Destruyendo sesión anterior de ${sessionId}`);
                await this.disconnect(sessionId);
            }

            console.log(`🔄 Conectando WhatsApp para: ${sessionId}`);

            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: sessionId,
                    dataPath: './.wwebjs_auth'
                }),
                puppeteer: {
                    headless: true,
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-extensions',
                        '--disable-infobars',
                        '--disable-background-networking',
                        '--disable-background-timer-throttling',
                        '--disable-renderer-backgrounding',
                        '--mute-audio',
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--window-size=800,600',
                        '--disable-session-crashed-bubble',
                    ],
                    defaultViewport: {
                        width: 800,
                        height: 600,
                        deviceScaleFactor: 1,
                    },
                    userAgent: 'WhatsApp Web Personalizado'
                },
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014580221-alpha.html',
                },
                authTimeoutMs: 0,
                qrMaxRetries: 5,
                restartDelay: 5000
            });

            // ✅ Manejar QR
            client.on('qr', async (qr) => {
                console.log(`📱 QR generado para ${sessionId}`);
                try {
                    const qrImage = await qrcode.toDataURL(qr);

                    if (this.sessions[sessionId]) {
                        this.sessions[sessionId] = Object.assign(this.sessions[sessionId], {
                            status: 'qr_code',
                            qr: qrImage,
                            qrCode: qrImage,
                            connectedAt: null,
                            qrGeneratedAt: Date.now()
                        });
                    }

                    SocketService.emitQR(sessionId, qrImage, qr);
                } catch (error) {
                    console.error(`❌ Error generando QR para ${sessionId}:`, error.message);
                }
            });

            // ✅ Manejar eventos
            client.on('ready', async () => {

                const user = await this.userRepository.findByExternalId(sessionId);

                if (!user) {
                    console.error(`❌ Usuario no encontrado: ${sessionId}`);
                    return;
                }

                console.log(`✅ Cliente WhatsApp listo: ${sessionId}`);

                // await client.pupPage.evaluate(() => {
                //     if (window.WWebJS?.sendSeen) {
                //         window.WWebJS.sendSeen = () => { };
                //     }
                // });

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
            });

            client.on('authenticated', async () => {
                console.log(`🔐 Autenticado: ${sessionId}`);

                if (this.sessions[sessionId]) {
                    this.sessions[sessionId].status = 'authenticated';
                    this.sessions[sessionId].qr = null;
                }

                this.userRepository.updateUser(sessionId, { estado: 'autenticado' });

                SocketService.emitStatus(sessionId, 'authenticated');
            });

            client.on('auth_failure', async (error) => {
                console.error(`❌ Fallo de autenticación para ${sessionId}:`, error);

                await this.userRepository.updateUser(sessionId, {
                    estado: 'error_autenticacion',
                    error_msg: error,
                });
                await sessionService.removeSession(sessionId);

                SocketService.emitStatus(sessionId, 'auth_failure');
                this.disconnect(sessionId);
            });

            client.on('disconnected', async (reason) => {
                console.log(`❌ Desconectado ${sessionId}:`, reason);

                // 1. PRIMERO: Limpiar sesión de memoria INMEDIATAMENTE
                if (this.sessions[sessionId]) {
                    delete this.sessions[sessionId];
                    console.log(`✅ Sesión eliminada de memoria: ${sessionId}`);
                }

                // 2. SEGUNDO: Actualizar estado en BD
                try {
                    await this.userRepository.updateUser(sessionId, {
                        estado: 'desconectado',
                    });
                    console.log(`✅ Estado actualizado en BD: ${sessionId}`);
                } catch (error) {
                    console.error(`Error actualizando estado en DB:`, error.message);
                }

                // 3. TERCERO: Emitir evento de socket
                try {
                    SocketService.emitDisconnected(sessionId);
                    console.log(`✅ Socket notificado: ${sessionId}`);
                } catch (error) {
                    console.error(`Error emitiendo socket:`, error.message);
                }

                // 4. CUARTO: Decidir si reconectar o no
                // const NO_RECONNECT_REASONS = ['Max qrcode retries reached', 'LOGOUT'];
                const shouldReconnect = !NO_RECONNECT_REASONS.includes(reason);

                if (shouldReconnect) {
                    console.log(`🔄 Reconectando en 5s: ${sessionId}`);
                    setTimeout(async () => {
                        try {
                            // Llamas a tu propio método connect del adaptador
                            await this.connect(sessionId, receiveMessages);
                        } catch (reconnectError) {
                            console.error(`❌ Error reconectando ${sessionId}:`, reconnectError.message);
                        }
                    }, 5000);
                } else {
                    // Logout permanente - limpiar TODO después de un delay
                    console.log(`🗑️ Logout permanente o límite alcanzado: ${sessionId}`);

                    setTimeout(async () => {
                        try {
                            if (client && typeof client.destroy === 'function') {
                                // ⭐ CLAVE: Remover TODOS los listeners antes de intentar destruir
                                client.removeAllListeners();
                                console.log(`🧹 Listeners removidos: ${sessionId}`);

                                // Intentar destruir el proceso de Puppeteer de forma segura
                                await client.destroy().catch(e => {
                                    if (!e.message.includes('no se encontró el proceso')) {
                                        throw e;
                                    }
                                });
                                console.log(`🧹 Cliente destruido: ${sessionId}`);
                            }
                        } catch (e) {
                            console.log(`⚠️ Error destruyendo cliente (ignorado): ${e.message}`);
                        }
                    }, 3000);
                }

            });

            // ✅ Manejar mensajes si está habilitado
            if (receiveMessages) {
                client.on('message', async (message) => {
                    console.log(`📩 Mensaje recibido en ${sessionId}:`, message.body);

                    await this.messageService.handleIncomingMessage(message, sessionId, client);
                });

                client.on('message_revoke_everyone', async (revokedMsg) => {
                    console.log(`🗑️ Mensaje eliminado: ${revokedMsg.id._serialized}`);
                });

                console.log(`📩 Recepción activada para: ${sessionId}`);
            }

            // ✅ Guardar sesión
            this.sessions[sessionId] = client;

            // ✅ Inicializar con timeout
            const initPromise = client.initialize();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout al conectar')), 120000)
            );

            await Promise.race([initPromise, timeoutPromise]);

            console.log(`✅ WhatsApp conectado exitosamente: ${sessionId}`);
            return client;

        } catch (error) {
            console.error(`❌ Error conectando WhatsApp para ${sessionId}:`, error.message);

            // ✅ Limpiar sesión fallida
            if (this.sessions[sessionId]) {
                await this.disconnect(sessionId);
            }

            throw new Error(`Error al conectar WhatsApp: ${error.message}`);
        }
    }

    async disconnect(sessionId) {
        try {
            const client = this.sessions[sessionId];
            if (client) {
                console.log(`🔌 Desconectando sesión: ${sessionId}`);

                try {
                    await client.destroy();
                } catch (error) {
                    console.warn(`⚠️ Error al destruir cliente ${sessionId}:`, error.message);
                }

                delete this.sessions[sessionId];
                console.log(`✅ Sesión ${sessionId} eliminada`);
            }
        } catch (error) {
            console.error(`❌ Error desconectando ${sessionId}:`, error.message);
        }
    }

    async sendMessage(sessionId, phone, message) {
        const client = this.sessions[sessionId];
        if (!client) {
            throw new Error(`No hay sesión activa para ${sessionId}`);
        }

        const state = await client.getState();
        if (state !== 'CONNECTED') {
            throw new Error(`Sesión ${sessionId} no está conectada. Estado: ${state}`);
        }

        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        return await client.sendMessage(chatId, message);
    }

    async sendMediaMessage(sessionId, phone, media) {
        const client = this.sessions[sessionId];
        if (!client) {
            throw new Error(`No hay sesión activa para ${sessionId}`);
        }

        const state = await client.getState();
        if (state !== 'CONNECTED') {
            throw new Error(`Sesión ${sessionId} no está conectada. Estado: ${state}`);
        }

        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        return await client.sendMessage(chatId, media);
    }

    async getSessionStatus(sessionId) {
        const client = this.sessions[sessionId];
        if (!client) {
            return { connected: false, state: 'DISCONNECTED' };
        }

        try {
            const state = await client.getState();
            return {
                connected: state === 'CONNECTED',
                state
            };
        } catch (error) {
            return { connected: false, state: 'ERROR', error: error.message };
        }
    }

    getSession(sessionId) {
        return this.sessions[sessionId];
    }

    getAllSessions() {
        return Object.keys(this.sessions);
    }

    async isConnected(sessionId) {
        try {
            const client = this.sessions[sessionId];

            if (!client) {
                return false;
            }

            const state = await client.getState();
            return state === 'CONNECTED';
        } catch (error) {
            console.error(`Error verificando conexión para ${sessionId}:`, error);
            return false;
        }
    }

    async getNumberId(id_externo, formattedNumber) {
        try {
            const client = this.sessions[id_externo];

            if (!client) {
                throw new Error(`Cliente ${id_externo} no encontrado en el proveedor`);
            }

            const numberDetails = await client.getNumberId(formattedNumber);

            if (!numberDetails) {
                console.warn(`⚠️ El número ${formattedNumber} no está registrado en WhatsApp.`);
                return null;
            }

            return numberDetails._serialized;

        } catch (error) {
            console.error(`❌ Error en getNumberId para ${formattedNumber}:`, error.message);
            throw error;
        }
    }

    async getSenderNumber(id_externo) {
        try {
            const client = this.sessions[id_externo];

            if (!client || !client.info) {
                console.warn(`⚠️ No se pudo obtener el número del emisor para: ${id_externo}. ¿Sesión lista?`);
                return null;
            }

            // client.info.wid.user contiene el número sin el @c.us
            return client.info.wid.user;

        } catch (error) {
            console.error(`❌ Error en getSenderNumber para ${id_externo}:`, error.message);
            return null;
        }
    }

    async sendMediaByType(id_externo, chatId, mediaData) {
        const { type, link, tempMessage, latitud, longitud, file } = mediaData;
        const client = this.sessions[id_externo]; // Ajusta según cómo guardes tus clientes

        if (!client) throw new Error('Cliente no encontrado');

        let result;

        switch (type) {
            case 'image':
                const imageMedia = await MessageMedia.fromUrl(link);
                result = await client.sendMessage(chatId, imageMedia, {
                    caption: tempMessage || ''
                });
                break;

            case 'video':
                const videoMedia = await MessageMedia.fromUrl(link);
                result = await client.sendMessage(chatId, videoMedia, {
                    caption: tempMessage || '',
                    sendMediaAsDocument: false
                });
                break;

            case 'audio':
                const audioMedia = await MessageMedia.fromUrl(link);
                result = await client.sendMessage(chatId, audioMedia, {
                    sendAudioAsVoice: true
                });
                break;

            case 'location':
                const location = new Location(latitud, longitud, tempMessage || '');
                result = await client.sendMessage(chatId, location);
                break;

            case 'document':
                // Extraer nombre de archivo de la URL si no viene uno
                const pathname = new URL(link).pathname;
                const filename = decodeURIComponent(pathname.substring(pathname.lastIndexOf('/') + 1));
                const docMedia = await MessageMedia.fromUrl(link);
                docMedia.filename = file || filename; // Prioriza 'file' si viene en el body
                result = await client.sendMessage(chatId, docMedia, {
                    caption: tempMessage || '',
                    sendMediaAsDocument: true
                });
                break;

            case 'documentBase64':
                const pdfMedia = new MessageMedia(
                    'application/pdf',
                    link, // Aquí 'link' es el string Base64
                    `${file || 'documento'}.pdf`
                );
                result = await client.sendMessage(chatId, pdfMedia, {
                    caption: tempMessage || '',
                    sendMediaAsDocument: true
                });
                break;

            default:
                // Por defecto envía el mensaje de texto
                result = await client.sendMessage(chatId, tempMessage);
                break;
        }

        return {
            messageId: result.id._serialized, // Aquí extraemos el ID
            timestamp: result.timestamp,
            ack: result.ack,
            raw: result // Por si necesitas algo más después
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

    async getState(sessionId) {
        const client = this.sessions[sessionId];
        if (!client) {
            return 'DISCONNECTED';
        }

        try {
            return await client.getState();
        } catch (error) {
            return 'ERROR';
        }
    }

    getQRCode(sessionId) {
        const sessionData = this.sessions[sessionId];
        return sessionData?.qrCode || sessionData?.qr || null;
    }

    async getPhoneNumber(sessionId) {
        const client = this.sessions[sessionId];
        if (!client || !client.info) {
            return null;
        }
        return client.info.wid.user;
    }
}

module.exports = WhatsAppWebAdapter;