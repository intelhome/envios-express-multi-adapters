class InitializeSessionsUseCase {
    constructor(whatsappProvider, sessionRepository) {
        this.whatsappProvider = whatsappProvider;
        this.sessionRepository = sessionRepository;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async execute() {
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

                // ✅ esperar 3 segundos antes de la siguiente sesión
                await this.sleep(5000);

            } catch (error) {
                console.error(`Error inicializando ${user.id_externo}:`, error.message);

                // (opcional) también espera aunque falle
                await this.sleep(5000);
            }
        }
    }
}

module.exports = InitializeSessionsUseCase;
