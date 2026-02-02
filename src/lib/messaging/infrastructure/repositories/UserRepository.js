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
        return await collection.findOne({ id_externo });
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