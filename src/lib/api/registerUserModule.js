// Providers/Adapters - Repositorios
const { whatsappProvider, sessionRepository, userRepository } = require('../shared/infrastructure/config/dependencies');

// Use Cases - Sessions
const LogoutSessionUseCase = require('../messaging/application/use-cases/sessions/LogoutSessionUseCase');

// Use Cases - Users
const CreateUserUseCase = require('../messaging/application/use-cases/users/CreateUserUseCase');
const GetAllUsersUseCase = require('../messaging/application/use-cases/users/GetAllUsersUseCase');
const DeleteUserUseCase = require('../messaging/application/use-cases/users/DeleteUserUseCase');
const GetUserByIdUseCase = require('../messaging/application/use-cases/users/GetUserByIdUseCase');

// Controllers
const UserController = require('./controllers/UserController');

// Routers
const UserRoutes = require("./routes/user.routes");

module.exports = function registerUserModule(app) {
    // Instanciar casos de uso con sus dependencias
    const logoutSessionUseCase = new LogoutSessionUseCase(whatsappProvider, sessionRepository, userRepository);

    // Casos de uso
    const createUserUseCase = new CreateUserUseCase(userRepository, whatsappProvider);
    const getAllUsersUseCase = new GetAllUsersUseCase(userRepository);
    const deleteUserUseCase = new DeleteUserUseCase(logoutSessionUseCase);
    const getUserByIdUseCase = new GetUserByIdUseCase(userRepository);

    // Instanciar controllers con sus casos de uso
    const userController = new UserController(
        createUserUseCase,
        getAllUsersUseCase,
        deleteUserUseCase,
        getUserByIdUseCase
    );

    app.use("/api/users", UserRoutes(userController));

    return { userController };
};