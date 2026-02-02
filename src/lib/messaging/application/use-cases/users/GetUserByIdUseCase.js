class GetUserByIdUseCase {
    constructor(userRepository) {
        this.userRepository = userRepository;
    }

    async execute(id_externo) {
        return await this.userRepository.findByExternalId(id_externo);
    }
}

module.exports = GetUserByIdUseCase;