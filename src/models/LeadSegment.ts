import mongoose from 'mongoose';

const leadSegmentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },

    // Segment criteria (dynamic filters)
    criteria: {
        conditions: [{
            field: String,  // e.g., 'source', 'status', 'leadScore', 'city'
            operator: {
                type: String,
                enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in', 'between']
            },
            value: mongoose.Schema.Types.Mixed,
            valueEnd: mongoose.Schema.Types.Mixed  // For 'between' operator
        }],
        logic: { type: String, enum: ['AND', 'OR'], default: 'AND' }
    },

    // Segment type
    type: {
        type: String,
        enum: ['dynamic', 'static'],  // dynamic = auto-updated, static = manual list
        default: 'dynamic'
    },

    // For static segments - manually added leads
    staticLeads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }],

    // Cached count for quick display
    leadCount: { type: Number, default: 0 },
    lastCalculated: { type: Date },

    // Auto-enrollment in nurturing
    autoEnrollSequence: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowRule' },

    color: { type: String, default: '#3b82f6' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

// Index for faster querying
leadSegmentSchema.index({ 'criteria.conditions.field': 1 });

const LeadSegment = mongoose.models.LeadSegment || mongoose.model('LeadSegment', leadSegmentSchema);
export default LeadSegment;
