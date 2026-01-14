"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const workflowRuleSchema = new mongoose_1.default.Schema({
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
            value: { type: mongoose_1.default.Schema.Types.Mixed }
        }],
    // Actions to execute
    actions: [{
            type: {
                type: String,
                enum: ['send_email', 'create_task', 'update_field', 'notify_user', 'assign_to'],
                required: true
            },
            config: { type: mongoose_1.default.Schema.Types.Mixed } // Action-specific configuration
        }],
    // Execution tracking
    executionCount: { type: Number, default: 0 },
    lastExecutedAt: { type: Date },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
const WorkflowRule = mongoose_1.default.models.WorkflowRule || mongoose_1.default.model('WorkflowRule', workflowRuleSchema);
exports.default = WorkflowRule;
