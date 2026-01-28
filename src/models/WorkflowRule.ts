import mongoose from 'mongoose';

const workflowRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },

    // Trigger Configuration
    triggerEntity: {
        type: String,
        enum: ['Lead', 'Contact', 'Opportunity', 'Task'],
        required: true
    },
    triggerEvent: {
        type: String,
        enum: ['create', 'update', 'field_change', 'status_change'],
        required: true
    },
    triggerField: { type: String }, // For field_change events

    // Conditions (AND logic)
    conditions: [{
        field: { type: String, required: true },
        operator: {
            type: String,
            enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'],
            required: true
        },
        value: { type: mongoose.Schema.Types.Mixed }
    }],

    // Actions to execute
    actions: [{
        type: {
            type: String,
            enum: ['send_email', 'create_task', 'update_field', 'notify_user', 'assign_to'],
            required: true
        },
        config: { type: mongoose.Schema.Types.Mixed } // Action-specific configuration
    }],

    // Execution tracking
    executionCount: { type: Number, default: 0 },
    lastExecutedAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

const WorkflowRule = mongoose.models.WorkflowRule || mongoose.model('WorkflowRule', workflowRuleSchema);
export default WorkflowRule;
