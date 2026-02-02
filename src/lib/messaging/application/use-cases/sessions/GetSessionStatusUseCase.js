class GetSessionStatusUseCase {
    constructor(whatsappProvider, sessionRepository) {
        this.whatsappProvider = whatsappProvider;
        this.sessionRepository = sessionRepository;
    }

    async execute(id_externo) {
        const session = await this.whatsappProvider.getServiceSession(id_externo);

        if (!session) {
            return {
                connected: false,
                message: 'Sin sesión activa'
            };
        }

        const isConnected = await this.whatsappProvider.isConnected(id_externo);
        const state = await this.whatsappProvider.getConnectionState(id_externo);

        return {
            connected: isConnected,
            connectedAt: session.connectedAt,
            qrAvailable: !!session.qrCode,
            state: state
        };
    }
}

module.exports = GetSessionStatusUseCase;