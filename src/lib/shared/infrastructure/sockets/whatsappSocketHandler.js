// Socket Service
const SocketService = require('./SocketService');

// Almacenar sockets de usuarios
const userSockets = {};

const initializeSocketEvents = (io, dependencies) => {
    const { whatsappProvider, sessionRepository, userRepository } = dependencies;

    // Cola para procesar sesiones por lotes
    const sessionQueue = [];
    let isProcessingQueue = false;

    // Función para procesar la cola en lotes
    const processSessionQueue = async () => {
        if (isProcessingQueue || sessionQueue.length === 0) return;

        isProcessingQueue = true;
        const BATCH_SIZE = 3;
        const DELAY_BETWEEN_BATCHES = 5000; // 5 segundos

        while (sessionQueue.length > 0) {
            // Tomar el siguiente lote
            const batch = sessionQueue.splice(0, BATCH_SIZE);

            console.log(`📦 Procesando lote de ${batch.length} sesiones`);

            // Procesar todas las sesiones del lote en paralelo
            await Promise.all(
                batch.map(async ({ socket, id_externo }) => {
                    try {
                        // ⭐ Usar método agnóstico del proveedor
                        const hasSession = await whatsappProvider.getServiceSession(id_externo);

                        if (hasSession) {
                            await handleExistingSession(socket, id_externo, whatsappProvider, userRepository);
                        } else {
                            await handleNewSession(socket, id_externo, whatsappProvider, userRepository);
                        }
                    } catch (error) {
                        console.error(`❌ Error procesando sesión ${id_externo}:`, error);
                        socket.emit('log', 'Error al inicializar la sesión');
                    }
                })
            );

            // Si hay más sesiones en cola, esperar antes del siguiente lote
            if (sessionQueue.length > 0) {
                console.log(`⏳ Esperando ${DELAY_BETWEEN_BATCHES / 1000}s antes del siguiente lote...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }

        isProcessingQueue = false;
    };

    io.on('connection', (socket) => {
        console.log('📡 Socket conectado:', socket.id);

        socket.on('joinSession', async (id_externo) => {
            try {
                console.log(`👤 Usuario ${id_externo} se unió con socket: ${socket.id}`);

                // Verificar si ya existe un socket para este usuario
                const oldSocketId = userSockets[id_externo];
                if (oldSocketId && oldSocketId !== socket.id) {
                    console.log(
                        `⚠️ Reemplazando socket anterior ${oldSocketId} con ${socket.id} para usuario ${id_externo}`
                    );

                    const oldSocket = io.sockets.sockets.get(oldSocketId);
                    if (oldSocket) {
                        oldSocket.leave(id_externo);
                    }
                }

                // Guardar el nuevo socket del usuario
                userSockets[id_externo] = socket.id;
                SocketService.registerSocket(id_externo, socket.id);
                socket.data.id_externo = id_externo;

                // Unir a una sala específica
                socket.join(id_externo);

                // Notificar al cliente que está en cola
                socket.emit('log', 'Sesión agregada a la cola de inicialización...');

                // Agregar a la cola
                sessionQueue.push({ socket, id_externo });

                console.log(`📋 Sesión ${id_externo} agregada a cola. Total en cola: ${sessionQueue.length}`);

                // Iniciar procesamiento de la cola
                processSessionQueue();

            } catch (error) {
                console.error(`❌ Error en joinSession para ${id_externo}:`, error);
                socket.emit('log', 'Error al unirse a la sesión');
            }
        });

        socket.on('disconnect', () => {
            console.log('🔌 Cliente desconectado:', socket.id);

            const id_externo = socket.data.id_externo;
            if (id_externo && userSockets[id_externo] === socket.id) {
                delete userSockets[id_externo];
                console.log(`🧹 Socket eliminado para ${id_externo}`);
            }

            // Eliminar de la cola si aún no ha sido procesado
            const queueIndex = sessionQueue.findIndex(
                item => item.id_externo === id_externo
            );
            if (queueIndex !== -1) {
                sessionQueue.splice(queueIndex, 1);
                console.log(`🗑️ Sesión ${id_externo} eliminada de la cola`);
            }
        });
    });
};

// ⭐ Función auxiliar: Manejar sesión existente (ACTUALIZADA)
async function handleExistingSession(socket, id_externo, whatsappProvider, userRepository) {
    try {
        // ⭐ Usar métodos agnósticos del proveedor
        const qrCode = whatsappProvider.getQRCode(id_externo);
        
        if (qrCode) {
            // Tiene QR pendiente
            socket.emit('qr', qrCode);
            socket.emit('log', 'QR pendiente de escaneo');
            console.log(`📤 QR enviado a ${id_externo}`);
            return;
        }

        // ⭐ Verificar estado usando método común
        const state = await whatsappProvider.getState(id_externo);
        
        if (state === 'CONNECTED') {
            // Ya está conectado
            socket.emit('qrstatus', './assets/check.svg');
            socket.emit('log', 'Usuario conectado');
            
            // ⭐ Obtener número de teléfono de forma agnóstica
            const phoneNumber = await whatsappProvider.getPhoneNumber(id_externo);
            
            socket.emit('ready', {
                message: 'WhatsApp ya está conectado',
                id_externo,
                phoneNumber
            });
            
            console.log(`✅ Usuario ${id_externo} ya conectado`);

            // Enviar información del usuario
            await sendUserInfo(socket, id_externo, userRepository);
            return;
        }

        // Si no está conectado ni tiene QR, intentar reconectar
        console.log(`🔄 Estado de sesión ${id_externo}: ${state}, intentando reconectar...`);
        await handleNewSession(socket, id_externo, whatsappProvider, userRepository);

    } catch (error) {
        console.error(`❌ Error manejando sesión existente ${id_externo}:`, error);
        socket.emit('log', 'Error al verificar sesión');
    }
}

// Función auxiliar: Manejar nueva sesión
async function handleNewSession(socket, id_externo, whatsappProvider, userRepository) {
    try {
        const user = await userRepository.findByExternalId(id_externo);

        if (!user) {
            socket.emit('log', 'Usuario no encontrado');
            console.log(`❌ Usuario ${id_externo} no existe en BD`);
            return;
        }

        if (user.estado === 'conectado' || user.estado === 'desconectado' || user.estado === 'autenticado') {
            socket.emit('qrstatus', './assets/loader.gif');
            socket.emit('log', 'Restaurando sesión...');

            console.log(`🔄 Restaurando sesión para: ${id_externo}`);

            whatsappProvider.connect(id_externo, user.receive_messages)
                .catch((err) => {
                    console.error(`❌ Error restaurando sesión para ${id_externo}:`, err);
                    socket.emit('log', 'Error al restaurar sesión');
                    socket.emit('qrstatus', './assets/loader.gif');
                });
        } else {
            socket.emit('log', 'Sin sesión activa. Inicia sesión escaneando el QR.');
            console.log(`ℹ️ Sin sesión para ${id_externo}`);
        }

    } catch (error) {
        console.error('❌ Error verificando sesión en BD:', error);
        socket.emit('log', 'Error al verificar sesión');
    }
}

// Función auxiliar: Enviar información del usuario
async function sendUserInfo(socket, id_externo, userRepository) {
    try {
        const user = await userRepository.findByExternalId(id_externo);

        if (!user) {
            console.warn(`⚠️ Usuario ${id_externo} no encontrado en BD`);
            return;
        }

        const userData = {
            id: user._id || user.id || id_externo,
            nombre: user.nombre || 'Usuario sin nombre',
            id_externo: user.id_externo,
            fecha: user.fechaCreacion,
            receive_messages: user.receive_messages,
        };

        socket.emit('connected', userData);
        socket.emit('user', userData);

        console.log(`📤 Info de usuario enviada para ${id_externo}`);

    } catch (error) {
        console.error('❌ Error obteniendo info de usuario:', error);
    }
}

module.exports = { initializeSocketEvents };