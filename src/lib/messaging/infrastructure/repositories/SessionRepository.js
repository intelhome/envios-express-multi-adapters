const { getCollection } = require('../../../../infrastructure/database/connection');

class SessionRepository {
    constructor() {
        this.collectionName = process.env.COLLECTION_SESSIONS_NAME || "registros_whatsapp";
    }

    async findByExternalId(id_externo) {
        const collection = getCollection(this.collectionName);
        return await collection.findOne({ id_externo });
    }

    async create(sessionData) {
        const collection = getCollection(this.collectionName);

        const newSession = {
            ...sessionData,
            fechaCreacion: new Date(),
            estado: 'creado'
        };

        await collection.insertOne(newSession);
        return newSession;
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

    async findAll() {
        const collection = getCollection(this.collectionName);
        return await collection.find().toArray();
    }

    async updateQR(id_externo, qrCode) {
        const collection = getCollection(this.collectionName);

        return await collection.updateOne(
            { id_externo },
            {
                $set: {
                    qrCode: qrCode,
                    updatedAt: new Date()
                }
            }
        );
    }

    async updateConnectionStatus(id_externo, estado) {
        const collection = getCollection(this.collectionName);

        return await collection.updateOne(
            { id_externo },
            {
                $set: {
                    estado: estado,
                    updatedAt: new Date()
                }
            }
        );
    }
}

module.exports = SessionRepository;