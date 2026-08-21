require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

// Shared Infrastructure
const { setupExpressApp } = require("./lib/shared/infrastructure/http/express.config");
const SocketService = require("./lib/shared/infrastructure/sockets/SocketService");
const { initializeSocketEvents } = require("./lib/shared/infrastructure/sockets/whatsappSocketHandler");

// Database
const { connectToMongoDB, closeConnections } = require("./infrastructure/database/connection");

// Use Cases
const InitializeSessionsUseCase = require("./lib/messaging/application/use-cases/sessions/InitializeSessionsUseCase");

// Middlewares
const { errorHandler, notFound } = require("./lib/api/middlewares/errorHandler");
const apiAuth = require("./lib/api/middlewares/apiAuth");
const logger = require("./lib/shared/infrastructure/logging/logger");

// Inicializar Modulos
const registerUserModule = require("./lib/api/registerUserModule");
const registerMessageModule = require("./lib/api/registerMessageModule");
const registerSessionModule = require("./lib/api/registerSessionModule");

// Providers/Adapters - Repositorios
const { whatsappProvider, sessionRepository, userRepository } = require('./lib/shared/infrastructure/config/dependencies');

const PORT = process.env.PORT || 4010;

/**
 * Inicializa el servidor
 */
async function startServer() {
    try {
        console.log("🚀 Iniciando servidor...");

        // 1. Conectar a MongoDB
        await connectToMongoDB();

        // 4. Configurar Express
        const app = setupExpressApp();

        // 5. Crear servidor HTTP
        const server = http.createServer(app);

        // 6. Inicializar Socket.IO
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);

        if (allowedOrigins.length === 0) {
            logger.warn("⚠️ ALLOWED_ORIGINS no está configurado: Socket.IO acepta cualquier origen.");
        }

        const io = socketIO(server, {
            cors: {
                origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
                methods: ["GET", "POST"]
            }
        });

        // Exige el mismo token que se usa para abrir /scan antes de permitir
        // la conexión del socket: sin esto, cualquiera que adivine un
        // id_externo podría unirse a esa sala y ver el QR/estado ajeno.
        // Controlado por el mismo switch REQUIRE_API_TOKEN que apiAuth.js.
        const requireToken = process.env.REQUIRE_API_TOKEN === 'true';
        const scanToken = process.env.API_ACCESS_TOKEN;
        if (requireToken && !scanToken) {
            logger.warn("⚠️ REQUIRE_API_TOKEN=true pero API_ACCESS_TOKEN no está configurado: Socket.IO acepta cualquier conexión sin validar token.");
        } else if (requireToken) {
            io.use((socket, next) => {
                const token = socket.handshake.auth?.token || socket.handshake.query?.token;
                if (token !== scanToken) {
                    return next(new Error("No autorizado"));
                }
                next();
            });
        }

        // Configurar Socket Service
        SocketService.setIO(io);
        // initializeSocketEvents(io);
        initializeSocketEvents(io, {
            whatsappProvider,
            sessionRepository,
            userRepository
        });
        console.log("✅ Socket.IO inicializado");

        // 7. Configurar rutas
        // Ruta especial para escanear QR: requiere el mismo token que Socket.IO
        // (SIGCENTER lo agrega como query param al generar el scanUrl).
        app.get("/scan", (req, res) => {
            if (requireToken && req.query.token !== scanToken) {
                return res.status(401).send("No autorizado");
            }
            return userController.scanQR(req, res);
        });

        // Ruta de prueba
        app.get("/", (req, res) => {
            res.send("WhatsApp API Server Running ✅");
        });

        // Protege todo /api/* con la API key compartida (ver apiAuth.js).
        // Activado/desactivado con el switch REQUIRE_API_TOKEN (.env).
        app.use('/api', apiAuth);

        // registerUserModule(app);
        const { userController } = registerUserModule(app);
        registerMessageModule(app);
        registerSessionModule(app);

        // Middleware de manejo de errores (debe ir después de las rutas)
        app.use(notFound);
        app.use(errorHandler);

        // 8. Reconectar sesiones existentes
        console.log("🔄 Reconectando sesiones existentes...");

        const initSessionsUseCase = new InitializeSessionsUseCase(
            whatsappProvider,
            userRepository
        );

        await initSessionsUseCase.execute();

        // 9. Iniciar servidor
        server.listen(PORT, () => {
            console.log(`✅ Servidor corriendo en puerto ${PORT}`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
        });

        // 10. Manejo de señales de cierre
        process.on("SIGTERM", gracefulShutdown);
        process.on("SIGINT", gracefulShutdown);

        process.on('unhandledRejection', (reason, promise) => {
            if (reason?.message?.includes('EBUSY') && reason?.message?.includes('chrome_debug.log')) {
                console.warn('⚠️ Error EBUSY ignorado');
                return;
            }

            if (reason?.message?.includes('Session closed') ||
                reason?.message?.includes('Protocol error')) {
                console.warn('⚠️ Error de Puppeteer ignorado');
                return;
            }

            console.error('❌ Unhandled Rejection:', reason);
        });

        process.on('uncaughtException', (error) => {
            if (error?.message?.includes('EBUSY') && error?.message?.includes('chrome_debug.log')) {
                console.warn('⚠️ Error EBUSY ignorado');
                return;
            }

            if (error?.message?.includes('Session closed') ||
                error?.message?.includes('Protocol error')) {
                console.warn('⚠️ Error de Puppeteer ignorado');
                return;
            }

            console.error('❌ Uncaught Exception:', error);
            process.exit(1);
        });

        async function gracefulShutdown() {
            console.log("\n🛑 Cerrando servidor...");

            server.close(async () => {
                console.log("✅ Servidor HTTP cerrado");

                // Desconectar WhatsApp
                if (whatsappProvider) {
                    await whatsappProvider.disconnect();
                }

                // Cerrar conexiones de base de datos
                await closeConnections();

                console.log("👋 Servidor cerrado completamente");
                process.exit(0);
            });

            setTimeout(() => {
                console.error("⚠️ Forzando cierre del servidor");
                process.exit(1);
            }, 10000);
        }
    } catch (error) {
        console.error("❌ Error iniciando servidor:", error);
        process.exit(1);
    }
}

// Iniciar servidor
startServer();