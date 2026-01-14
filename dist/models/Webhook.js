"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const webhookSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    // Events to listen for
    events: [{
            type: String,
            enum: [
                'lead.created', 'lead.updated', 'lead.converted', 'lead.deleted',
                'contact.created', 'contact.updated', 'contact.deleted',
                'opportunity.created', 'opportunity.updated', 'opportunity.stage_changed', 'opportunity.won', 'opportunity.lost',
                'task.created', 'task.completed'
            ]
        }],
    // Authentication
    secret: { type: String }, // For signing payloads
    headers: { type: Map, of: String }, // Custom headers
    // Status
    isActive: { type: Boolean, default: true },
    // Tracking
    lastTriggeredAt: { type: Date },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    lastError: { type: String },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
const Webhook = mongoose_1.default.models.Webhook || mongoose_1.default.model('Webhook', webhookSchema);
exports.default = Webhook;
