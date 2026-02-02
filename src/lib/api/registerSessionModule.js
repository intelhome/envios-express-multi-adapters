// Providers/Adapters - Repositorios
const { whatsappProvider, sessionRepository, userRepository, PROVIDER_TYPE } = require('../shared/infrastructure/config/dependencies');

// Use Cases - Sessions
const LogoutSessionUseCase = require('../messaging/application/use-cases/sessions/LogoutSessionUseCase');
const GetSessionStatusUseCase = require('../messaging/application/use-cases/sessions/GetSessionStatusUseCase');
const InitializeSessionsUseCase = require('../messaging/application/use-cases/sessions/InitializeSessionsUseCase');

// Controllers
const SessionController = require('./controllers/SessionController');

// Routers
const SessionRoutes = require("./routes/session.routes");

// Instanciar casos de uso con sus dependencias
const logoutSessionUseCase = new LogoutSessionUseCase(whatsappProvider, sessionRepository, userRepository, PROVIDER_TYPE);
const getSessionStatusUseCase = new GetSessionStatusUseCase(whatsappProvider, sessionRepository);
const initializeSessionsUseCase = new InitializeSessionsUseCase(whatsappProvider, sessionRepository);

// Instanciar controllers con sus casos de uso
module.exports = function registerSessionModule(app) {
    const sessionController = new SessionController(
        logoutSessionUseCase,
        getSessionStatusUseCase,
        initializeSessionsUseCase
    );

    app.use("/api/sessions", SessionRoutes(sessionController));
}