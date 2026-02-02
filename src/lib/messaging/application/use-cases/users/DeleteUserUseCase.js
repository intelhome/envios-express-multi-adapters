class DeleteUserUseCase {
    constructor(logoutSessionUseCase) {
        this.logoutSessionUseCase = logoutSessionUseCase;
    }

    async execute(id_externo) {
        // Reutilizar el caso de uso de logout que ya hace todo
        return await this.logoutSessionUseCase.execute(id_externo);
    }
}

module.exports = DeleteUserUseCase;