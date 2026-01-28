import mongoose from 'mongoose';

const assignmentRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 }, // Higher = checked first

    // Added fields to match frontend
    entity: {
        type: String,
        enum: ['Lead', 'Opportunity'],
        default: 'Lead'
    },

    // Distribution Logic
    distributionType: {
        type: String,
        enum: ['specific_user', 'round_robin_role', 'round_robin_hierarchy', 'top_performer'],
        default: 'specific_user'
    },

    // Scope of Distribution
    distributionScope: {
        type: String,
        enum: ['organisation', 'direct_subordinates'],
        default: 'organisation'
    },

    targetRole: {
        type: String,
        enum: ['sales_rep', 'manager', 'admin']
    },
    targetManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For hierarchy
    lastAssignedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // To track round robin

    ruleType: {
        type: String,
        enum: ['round_robin', 'criteria_based', 'territory', 'load_balanced'],
        default: 'round_robin'
    },

    // Criteria (Frontend sends 'criteria', renamed from 'conditions')
    criteria: [{
        field: { type: String },
        operator: {
            type: String,
            enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'gt', 'lt'], // Added gt/lt for frontend compat
        },
        value: { type: mongoose.Schema.Types.Mixed }
    }],

    // Action
    assignTo: {
        type: {
            type: String,
            enum: ['user', 'queue'],
            default: 'user'
        },
        value: { type: String }, // User ID or Queue Name
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // For round_robin pool
    },

    // Rotation / SLA Policy
    enableRotation: { type: Boolean, default: false },
    timeLimitMinutes: { type: Number, default: 0 }, // 0 = no limit
    rotationType: {
        type: String,
        enum: ['random', 'selective', 'manager'],
        default: 'random'
    },
    rotationPool: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

const AssignmentRule = mongoose.models.AssignmentRule || mongoose.model('AssignmentRule', assignmentRuleSchema);
export default AssignmentRule;
