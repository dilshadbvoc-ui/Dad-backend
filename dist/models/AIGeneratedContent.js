"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const aiGeneratedContentSchema = new mongoose_1.default.Schema({
    // Content type
    type: {
        type: String,
        enum: ['email', 'sms', 'social_post', 'proposal', 'follow_up', 'cold_outreach', 'summary', 'response'],
        required: true
    },
    // Input context
    context: {
        lead: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Lead' },
        contact: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Contact' },
        account: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Account' },
        opportunity: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Opportunity' },
        prompt: String,
        tone: { type: String, enum: ['professional', 'friendly', 'formal', 'casual', 'urgent'] },
        length: { type: String, enum: ['short', 'medium', 'long'] }
    },
    // Generated content
    content: {
        subject: String, // For emails
        body: { type: String, required: true },
        alternatives: [String] // Alternative versions
    },
    // AI model info
    model: {
        name: String,
        version: String,
        provider: String
    },
    // Usage
    wasUsed: { type: Boolean, default: false },
    usedAt: Date,
    wasEdited: { type: Boolean, default: false },
    // Feedback
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
    generatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
aiGeneratedContentSchema.index({ type: 1, createdAt: -1 });
aiGeneratedContentSchema.index({ generatedBy: 1, organisation: 1 });
const AIGeneratedContent = mongoose_1.default.models.AIGeneratedContent || mongoose_1.default.model('AIGeneratedContent', aiGeneratedContentSchema);
exports.default = AIGeneratedContent;
