"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const leadSchema = new mongoose_1.default.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true, unique: true },
    company: { type: String },
    jobTitle: { type: String },
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zip: String
    },
    // Source & Attribution
    source: {
        type: String,
        enum: ['website', 'referral', 'social', 'paid_ad', 'import', 'api', 'manual'],
        default: 'manual'
    },
    sourceDetails: {
        campaign: String,
        medium: String,
        content: String,
        term: String
    },
    // Scoring
    leadScore: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0 },
    qualityScore: { type: Number, default: 0 },
    // Status & Assignment
    status: {
        type: String,
        enum: ['new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost', 'reborn'],
        default: 'new'
    },
    stage: { type: String }, // Linked to pipeline stage
    assignedTo: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    team: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Team' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    // Custom Fields
    customFields: { type: Map, of: mongoose_1.default.Schema.Types.Mixed },
    activities: [{
            type: { type: String, enum: ['call', 'email', 'meeting', 'note', 'task', 'log'], default: 'log' },
            description: String,
            createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
            createdAt: { type: Date, default: Date.now }
        }],
    tags: [{ type: String }],
    convertedToContact: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Contact' },
    convertedToAccount: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Account' },
    convertedToOpportunity: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Opportunity' },
    isDeleted: { type: Boolean, default: false },
}, {
    timestamps: true,
});
// Indexes for faster searching
leadSchema.index({ email: 1, phone: 1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ organisation: 1, status: 1 }); // Optimize dashboard stats
leadSchema.index({ organisation: 1, isDeleted: 1 }); // Optimize generic fetch
leadSchema.index({ organisation: 1, source: 1 }); // Optimize source analytics
const Lead = mongoose_1.default.models.Lead || mongoose_1.default.model('Lead', leadSchema);
exports.default = Lead;
