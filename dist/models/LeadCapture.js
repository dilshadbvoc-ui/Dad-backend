"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const leadCaptureSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    type: {
        type: String,
        enum: ['web_form', 'landing_page', 'chat_widget', 'phone', 'api', 'import', 'social'],
        required: true
    },
    // Configuration based on type
    config: {
        // For web forms
        formFields: [{
                name: String,
                label: String,
                type: { type: String, enum: ['text', 'email', 'phone', 'select', 'checkbox', 'textarea'] },
                required: Boolean,
                options: [String]
            }],
        // For landing pages
        pageUrl: String,
        templateId: String,
        // For chat widget
        widgetCode: String,
        position: { type: String, enum: ['bottom-right', 'bottom-left'] },
        // For phone tracking
        phoneNumber: String,
        trackingCode: String,
        // For API integrations
        apiEndpoint: String,
        webhookUrl: String
    },
    // Lead assignment
    defaultAssignee: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    assignmentRule: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'AssignmentRule' },
    // Tracking
    stats: {
        totalCaptures: { type: Number, default: 0 },
        todayCaptures: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 }
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'draft'],
        default: 'draft'
    },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
const LeadCapture = mongoose_1.default.models.LeadCapture || mongoose_1.default.model('LeadCapture', leadCaptureSchema);
exports.default = LeadCapture;
