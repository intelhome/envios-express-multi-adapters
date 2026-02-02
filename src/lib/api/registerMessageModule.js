// Providers/Adapters - Repositorios
const { whatsappProvider, sessionRepository, userRepository } = require('../shared/infrastructure/config/dependencies');

// Use Cases - Messages
const SendMessageUseCase = require('../messaging/application/use-cases/messages/SendMessageUseCase');
const SendMediaMessageUseCase = require('../messaging/application/use-cases/messages/SendMediaMessageUseCase');
const SendMediaMessageUniversalUseCase = require('../messaging/application/use-cases/messages/SendMediaMessageUniversalUseCase');

// Controllers
const MessageController = require('./controllers/MessageController');

// Routers
const MessageRoutes = require("./routes/message.routes");

module.exports = function registerMessageModule(app) {
    // Instanciar casos de uso con sus dependencias
    const sendMessageUseCase = new SendMessageUseCase(whatsappProvider);
    const sendMediaMessageUseCase = new SendMediaMessageUseCase(whatsappProvider);
    const sendMediaMessageUniversalUseCase = new SendMediaMessageUniversalUseCase(whatsappProvider);

    const messageController = new MessageController(
        sendMessageUseCase, sendMediaMessageUseCase, sendMediaMessageUniversalUseCase);

    app.use("/api/messages", MessageRoutes(messageController));
}