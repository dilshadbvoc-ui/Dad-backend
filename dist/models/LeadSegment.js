"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const leadSegmentSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    description: { type: String },
    // Segment criteria (dynamic filters)
    criteria: {
        conditions: [{
                field: String, // e.g., 'source', 'status', 'leadScore', 'city'
                operator: {
                    type: String,
                    enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in', 'between']
                },
                value: mongoose_1.default.Schema.Types.Mixed,
                valueEnd: mongoose_1.default.Schema.Types.Mixed // For 'between' operator
            }],
        logic: { type: String, enum: ['AND', 'OR'], default: 'AND' }
    },
    // Segment type
    type: {
        type: String,
        enum: ['dynamic', 'static'], // dynamic = auto-updated, static = manual list
        default: 'dynamic'
    },
    // For static segments - manually added leads
    staticLeads: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Lead' }],
    // Cached count for quick display
    leadCount: { type: Number, default: 0 },
    lastCalculated: { type: Date },
    // Auto-enrollment in nurturing
    autoEnrollSequence: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'WorkflowRule' },
    color: { type: String, default: '#3b82f6' },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
// Index for faster querying
leadSegmentSchema.index({ 'criteria.conditions.field': 1 });
const LeadSegment = mongoose_1.default.models.LeadSegment || mongoose_1.default.model('LeadSegment', leadSegmentSchema);
exports.default = LeadSegment;
