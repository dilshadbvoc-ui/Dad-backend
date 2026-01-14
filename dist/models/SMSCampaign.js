"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const smsCampaignSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    // Template
    template: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'SMSTemplate' },
    message: { type: String, required: true },
    // Recipients
    recipients: {
        type: {
            type: String,
            enum: ['segment', 'list', 'manual', 'all_leads'],
            required: true
        },
        segment: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'LeadSegment' },
        list: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'EmailList' },
        manualNumbers: [{ type: String }]
    },
    totalRecipients: { type: Number, default: 0 },
    // Scheduling
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    // Status
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'],
        default: 'draft'
    },
    // Stats
    stats: {
        sent: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 }, // If link included
        optedOut: { type: Number, default: 0 }
    },
    // Provider details
    provider: { type: String, default: 'twilio' },
    senderId: { type: String },
    // Cost tracking
    cost: {
        perSms: { type: Number },
        total: { type: Number }
    },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
smsCampaignSchema.index({ status: 1, scheduledAt: 1 });
const SMSCampaign = mongoose_1.default.models.SMSCampaign || mongoose_1.default.model('SMSCampaign', smsCampaignSchema);
exports.default = SMSCampaign;
