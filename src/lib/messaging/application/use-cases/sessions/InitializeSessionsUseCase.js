class InitializeSessionsUseCase {
    constructor(whatsappProvider, sessionRepository) {
        this.whatsappProvider = whatsappProvider;
        this.sessionRepository = sessionRepository;
    }

    async execute() {
        // Usa el repositorio en lugar de acceder directamente a la DB
        const users = await this.sessionRepository.findAll();

        if (users.length === 0) {
            console.log('ℹ️ No hay usuarios registrados');
            return;
        }

        console.log(`🔄 Inicializando ${users.length} sesiones...`);

        for (const user of users) {
            try {
                await this.whatsappProvider.connect(
                    user.id_externo,
                    user.receive_messages
                );
            } catch (error) {
                console.error(`Error inicializando ${user.id_externo}:`, error.message);
            }
        }
    }
}

module.exports = InitializeSessionsUseCase;