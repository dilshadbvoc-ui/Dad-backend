"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const assignmentRuleSchema = new mongoose_1.default.Schema({
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
    targetManager: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }, // For hierarchy
    lastAssignedUser: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }, // To track round robin
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
            value: { type: mongoose_1.default.Schema.Types.Mixed }
        }],
    // Action
    assignTo: {
        type: {
            type: String,
            enum: ['user', 'queue'],
            default: 'user'
        },
        value: { type: String } // User ID or Queue Name
    },
    // Metadata
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
const AssignmentRule = mongoose_1.default.models.AssignmentRule || mongoose_1.default.model('AssignmentRule', assignmentRuleSchema);
exports.default = AssignmentRule;
