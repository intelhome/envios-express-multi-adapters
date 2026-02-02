class SessionController {
    constructor(initializeSessionsUseCase, logoutSessionUseCase, getSessionStatusUseCase) {
        this.initializeSessionsUseCase = initializeSessionsUseCase;
        this.logoutSessionUseCase = logoutSessionUseCase;
        this.getSessionStatusUseCase = getSessionStatusUseCase;
    }

    async initializeWhatsAppSessions(db) {
        try {
            await this.initializeSessionsUseCase.execute(db);
        } catch (error) {
            console.error('Error inicializando sesiones:', error.message);
        }
    }

    async logout(req, res, next) {
        try {
            const { id_externo } = req.params;

            const result = await this.logoutSessionUseCase.execute(id_externo);

            res.json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async getSessionStatus(req, res, next) {
        try {
            const { id_externo } = req.params;

            const result = await this.getSessionStatusUseCase.execute(id_externo);

            res.json(result);
        } catch (error) {
            res.status(500).json({
                connected: false,
                error: error.message,
            });
        }
    }
}

module.exports = SessionController;