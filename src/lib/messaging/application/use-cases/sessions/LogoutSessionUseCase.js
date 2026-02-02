const fs = require('fs-extra');
const path = require('path');
const { getCollection } = require('../../../../../infrastructure/database/connection');

class LogoutSessionUseCase {
    constructor(whatsappProvider, sessionRepository, userRepository, providerType) {
        this.whatsappProvider = whatsappProvider;
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.providerType = providerType;
    }

    async execute(id_externo) {
        try {
            console.log(`🗑️ Eliminando sesión completa: ${id_externo} (${this.providerType})`);

            // 1. Desconectar y destruir cliente
            await this.whatsappProvider.disconnect(id_externo);
            console.log(`✅ Cliente destruido: ${id_externo}`);

            // Esperar liberación de recursos
            console.log(`⏳ Esperando liberación de recursos...`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 2. Eliminar de base de datos
            await this.sessionRepository.delete(id_externo);
            await this.userRepository.delete(id_externo);
            console.log(`✅ Usuario eliminado de DB: ${id_externo}`);

            // 3. ⭐ Eliminar archivos según el proveedor
            if (this.providerType === 'baileys') {
                await this.deleteBaileysSession(id_externo);
            } else if (this.providerType === 'whatsapp-web') {
                await this.deleteWhatsAppWebSession(id_externo);
            }

            console.log(`✅ Sesión completamente eliminada: ${id_externo}`);
            return { success: true };

        } catch (error) {
            console.error(`❌ Error eliminando sesión ${id_externo}:`, error);
            return { success: false, error: error.message };
        }
    }

    // ⭐ Eliminar sesión de WhatsApp Web
    async deleteWhatsAppWebSession(id_externo) {
        const authPath = path.join(
            process.cwd(),
            '.wwebjs_auth',
            `session-${id_externo}`
        );

        if (await fs.pathExists(authPath)) {
            await this.deleteWithRetry(authPath, 'WhatsApp Web');
        } else {
            console.log(`ℹ️ No se encontraron archivos de WhatsApp Web en: ${authPath}`);
        }
    }

    // ⭐ Eliminar sesión de Baileys (MongoDB + archivos locales si existen)
    async deleteBaileysSession(id_externo) {
        // 1. Eliminar colección de MongoDB
        try {
            const sessionCollection = `session_auth_info_${id_externo}`;
            await getCollection(sessionCollection).drop();
            console.log(`✅ Colección MongoDB eliminada: ${sessionCollection}`);
        } catch (error) {
            if (error.message.includes('ns not found')) {
                console.log(`ℹ️ Colección MongoDB no existía: session_auth_info_${id_externo}`);
            } else {
                console.error(`❌ Error eliminando colección MongoDB:`, error.message);
            }
        }
    }

    // ⭐ Método común para eliminar con reintentos
    async deleteWithRetry(authPath, providerName) {
        const maxIntentos = 5;
        let eliminado = false;

        for (let intento = 1; intento <= maxIntentos; intento++) {
            try {
                await fs.remove(authPath);
                console.log(`✅ Archivos de ${providerName} eliminados: ${authPath}`);
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
                            const deletePath = authPath.replace(/session-|baileys_auth/, `DELETE_${providerName}_`);
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

        return eliminado;
    }
}

module.exports = LogoutSessionUseCase;