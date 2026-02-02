const path = require("path");

class UserController {
    constructor(
        createUserUseCase,
        getAllUsersUseCase,
        deleteUserUseCase,
        getUserByIdUseCase
    ) {
        this.createUserUseCase = createUserUseCase;
        this.getAllUsersUseCase = getAllUsersUseCase;
        this.deleteUserUseCase = deleteUserUseCase;
        this.getUserByIdUseCase = getUserByIdUseCase;
    }

    createUser = async (req, res, next) => {
        try {
            const { nombre, id_externo, descripcion, receive_messages } = req.body;

            const result = await this.createUserUseCase.execute({
                nombre,
                id_externo,
                descripcion,
                receive_messages,
            });

            if (!result.success) {
                return res.status(400).json({
                    result: false,
                    error: result.message,
                });
            }

            res.json({
                result: true,
                success: "Usuario creado correctamente",
                registro: result.user,
            });
        } catch (error) {
            next(error);
        }
    }

    getUsers = async (req, res, next) => {
        try {
            const users = await this.getAllUsersUseCase.execute();

            // Filtrar campos sensibles
            const filteredUsers = users.map((user) => {
                const { _id, qr, ...userWithoutSensitive } = user;
                return userWithoutSensitive;
            });

            res.json({
                result: true,
                success: "Datos obtenidos",
                data: filteredUsers,
            });
        } catch (error) {
            next(error);
        }
    }

    getUserInfo = async (req, res, next) => {
        try {
            const { id_externo } = req.params;

            const info = await this.getUserByIdUseCase.execute(id_externo);

            res.json({
                result: true,
                status: true,
                ...info,
            });
        } catch (error) {
            res.status(404).json({
                result: false,
                status: false,
                response: error.message,
            });
        }
    }

    deleteUser = async (req, res, next) => {
        try {
            const { id_externo } = req.params;

            const result = await this.deleteUserUseCase.execute(id_externo);

            if (!result.success) {
                return res.status(400).json({
                    result: false,
                    error: result.message,
                });
            }

            res.json({
                result: true,
                success: "Usuario eliminado correctamente",
            });
        } catch (error) {
            next(error);
        }
    }

    scanQR = async (req, res, next) => {
        try {
            const { id_externo } = req.query;

            if (!id_externo) {
                return res.status(400).send("ID externo es necesario");
            }

            const user = await this.getUserByIdUseCase.execute(id_externo);

            const clientPath = path.join(process.cwd(), "client");

            if (!user) {
                return res.status(404).sendFile(path.join(clientPath, "not-found.html"));
            }

            res.sendFile(path.join(clientPath, "index.html"));
        } catch (error) {
            next(error);
        }
    }
}

module.exports = UserController;