import mongoose from 'mongoose';

const whatsappMessageSchema = new mongoose.Schema({
    // Conversation reference
    conversationId: { type: String, required: true },

    // Participants
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    phoneNumber: { type: String, required: true },

    // Message details
    direction: {
        type: String,
        enum: ['incoming', 'outgoing'],
        required: true
    },

    messageType: {
        type: String,
        enum: ['text', 'image', 'document', 'audio', 'video', 'location', 'template', 'interactive'],
        default: 'text'
    },

    content: {
        text: String,
        mediaUrl: String,
        mediaType: String,
        fileName: String,
        caption: String,
        latitude: Number,
        longitude: Number,
        templateName: String,
        templateParams: [String]
    },

    // Status tracking
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'pending'
    },

    // WhatsApp message ID
    waMessageId: { type: String },

    // Error details
    errorCode: { type: String },
    errorMessage: { type: String },

    // Timestamps
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },

    // Agent who sent/handled
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

whatsappMessageSchema.index({ conversationId: 1, createdAt: -1 });
whatsappMessageSchema.index({ lead: 1 });
whatsappMessageSchema.index({ phoneNumber: 1 });

const WhatsAppMessage = mongoose.models.WhatsAppMessage || mongoose.model('WhatsAppMessage', whatsappMessageSchema);
export default WhatsAppMessage;
