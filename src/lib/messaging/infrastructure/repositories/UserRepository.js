const { getCollection } = require('../../../../infrastructure/database/connection');

class UserRepository {
    constructor() {
        this.collectionName = process.env.COLLECTION_SESSIONS_NAME || "registros_whatsapp";
    }

    async create(userData) {
        const collection = getCollection(this.collectionName);

        const newUser = {
            ...userData,
            fechaCreacion: new Date(),
            estado: 'creado'
        };

        await collection.insertOne(newUser);
        return newUser;
    }

    async findByExternalId(id_externo) {
        const collection = getCollection(this.collectionName);
        const sessionData = await collection.findOne({ id_externo });

        if (!sessionData) {
            return null;
        }

        // Obtener la sesión activa del servicio correspondiente
        const { whatsappProvider } = require('../../../shared/infrastructure/config/dependencies');
        const activeSession = whatsappProvider.getServiceSession(id_externo);

        return {
            ...sessionData,
            activeSession: activeSession ? {
                status: activeSession.status,
                isConnected: activeSession.status === 'CONNECTED' || activeSession.status === 'ready',
                // Datos del usuario de WhatsApp
                userId: activeSession.sock?.user?.id || null,
                userName: activeSession.sock?.user?.name || null,
                userPhone: activeSession.sock?.user?.id ? activeSession.sock.user.id.split(':')[0] : null,
                // Información adicional útil
                timestamp: new Date(),
                library: process.env.WHATSAPP_PROVIDER || 'whatsapp-web'
            } : null
        };
    }

    async findAll() {
        const collection = getCollection(this.collectionName);
        return await collection.find().toArray();
    }

    async update(id_externo, updatedFields) {
        const collection = getCollection(this.collectionName);

        return await collection.updateOne(
            { id_externo },
            {
                $set: {
                    ...updatedFields,
                    updatedAt: new Date()
                }
            }
        );
    }

    async delete(id_externo) {
        const collection = getCollection(this.collectionName);
        return await collection.deleteOne({ id_externo });
    }

    async updateConnectionStatus(id_externo, receive_messages, estado) {
        const collection = getCollection(this.collectionName);

        const user = await collection.findOne({ id_externo });
        if (!user) {
            console.warn(`Usuario ${id_externo} no encontrado`);
            return;
        }

        return await collection.updateOne(
            { id_externo },
            {
                $set: {
                    estado: estado,
                    receive_messages: receive_messages,
                    updatedAt: new Date(),
                },
            }
        );
    }

    async updateUser(id_externo, updatedFields) {
        const collection = getCollection(this.collectionName);

        return await collection.updateOne(
            { id_externo },
            {
                $set: {
                    ...updatedFields,
                    updatedAt: new Date()
                }
            }
        );
    };
}

module.exports = UserRepository;