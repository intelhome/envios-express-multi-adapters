class CreateUserUseCase {
    constructor(userRepository, whatsappProvider) {
        this.userRepository = userRepository;
        this.whatsappProvider = whatsappProvider;
    }

    async execute(userData) {
        const { id_externo, receive_messages } = userData;

        // Verificar si ya existe
        const existingUser = await this.userRepository.findByExternalId(id_externo);
        if (existingUser) {
            return {
                success: false,
                message: "Ya existe un registro con el mismo identificador"
            };
        }

        // Crear usuario en DB
        const newUser = await this.userRepository.create(userData);

        // Conectar a WhatsApp
        await this.whatsappProvider.connect(id_externo, receive_messages);

        return {
            success: true,
            user: newUser
        };
    }
}

module.exports = CreateUserUseCase;