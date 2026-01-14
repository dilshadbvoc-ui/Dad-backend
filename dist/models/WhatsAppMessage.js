"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const whatsappMessageSchema = new mongoose_1.default.Schema({
    // Conversation reference
    conversationId: { type: String, required: true },
    // Participants
    lead: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Lead' },
    contact: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Contact' },
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
    agent: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
whatsappMessageSchema.index({ conversationId: 1, createdAt: -1 });
whatsappMessageSchema.index({ lead: 1 });
whatsappMessageSchema.index({ phoneNumber: 1 });
const WhatsAppMessage = mongoose_1.default.models.WhatsAppMessage || mongoose_1.default.model('WhatsAppMessage', whatsappMessageSchema);
exports.default = WhatsAppMessage;
