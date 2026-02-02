const fs = require('fs-extra');
const path = require('path');

class LogoutSessionUseCase {
    constructor(whatsappProvider, sessionRepository, userRepository) {
        this.whatsappProvider = whatsappProvider;
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
    }

    async execute(id_externo) {
        try {
            console.log(`🗑️ Eliminando sesión completa: ${id_externo}`);

            // 1. Desconectar y destruir cliente
            await this.whatsappProvider.disconnect(id_externo);
            console.log(`✅ Cliente destruido: ${id_externo}`);

            // Esperar liberación de archivos
            console.log(`⏳ Esperando liberación de archivos...`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 2. Eliminar de base de datos
            await this.sessionRepository.delete(id_externo);
            await this.userRepository.delete(id_externo);
            console.log(`✅ Usuario eliminado de DB: ${id_externo}`);

            // 3. Eliminar archivos físicos con reintentos
            const authPath = path.join(
                process.cwd(),
                '.wwebjs_auth',
                `session-${id_externo}`
            );

            if (await fs.pathExists(authPath)) {
                const maxIntentos = 5;
                let eliminado = false;

                for (let intento = 1; intento <= maxIntentos; intento++) {
                    try {
                        await fs.remove(authPath);
                        console.log(`✅ Archivos eliminados: ${authPath}`);
                        eliminado = true;
                        break;
                    } catch (error) {
                        if (error.code === 'EBUSY' || error.code === 'EPERM') {
                            if (intento < maxIntentos) {
                                console.log(`⏳ Intento ${intento}/${maxIntentos} - Esperando 2s...`);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            } else {
                                console.warn(`⚠️ No se pudieron eliminar archivos después de ${maxIntentos} intentos`);
                                try {
                                    const deletePath = authPath.replace(/session-/, 'DELETE_session-');
                                    await fs.rename(authPath, deletePath);
                                    console.log(`📝 Carpeta renombrada para limpieza posterior: ${deletePath}`);
                                } catch (renameError) {
                                    console.error(`❌ No se pudo renombrar:`, renameError.message);
                                }
                            }
                        } else {
                            throw error;
                        }
                    }
                }
            } else {
                console.log(`ℹ️ No se encontraron archivos en: ${authPath}`);
            }

            console.log(`✅ Sesión completamente eliminada: ${id_externo}`);
            return { success: true };

        } catch (error) {
            console.error(`❌ Error eliminando sesión ${id_externo}:`, error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = LogoutSessionUseCase;