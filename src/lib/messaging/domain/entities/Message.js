const PhoneNumber = require('../../../shared/domain/value-objects/PhoneNumber');

class Message {
    constructor({
        id,
        from,
        to,
        content,
        timestamp,
        isFromMe = false,
        chatId,
        metadata = {}
    }) {
        this.id = id;
        this.from = from instanceof PhoneNumber ? from : new PhoneNumber(from);
        this.to = to instanceof PhoneNumber ? to : new PhoneNumber(to);
        this.content = content;
        this.timestamp = timestamp || new Date();
        this.isFromMe = isFromMe;
        this.chatId = chatId;
        this.metadata = metadata; // Para guardar info específica del proveedor
    }

    static create(data) {
        return new Message(data);
    }

    toJSON() {
        return {
            id: this.id,
            from: this.from.toString(),
            to: this.to.toString(),
            content: this.content,
            timestamp: this.timestamp,
            isFromMe: this.isFromMe,
            chatId: this.chatId,
            metadata: this.metadata
        };
    }
}

module.exports = Message;