"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const opportunitySchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    stage: {
        type: String,
        enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
        default: 'prospecting'
    },
    probability: { type: Number, default: 10 }, // Percentage 0-100
    closeDate: { type: Date },
    account: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Account', required: true },
    contacts: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Contact' }],
    owner: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    leadSource: String,
    description: String,
    customFields: { type: Map, of: mongoose_1.default.Schema.Types.Mixed },
    tags: [{ type: String }],
}, {
    timestamps: true,
});
// Indexes
opportunitySchema.index({ organisation: 1, stage: 1 }); // Stats
opportunitySchema.index({ organisation: 1, owner: 1 }); // My Opportunities
opportunitySchema.index({ account: 1 }); // Account view
const Opportunity = mongoose_1.default.models.Opportunity || mongoose_1.default.model('Opportunity', opportunitySchema);
exports.default = Opportunity;
