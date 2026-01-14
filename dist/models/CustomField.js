"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const customFieldSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    label: { type: String, required: true },
    // Which entity this field applies to
    entityType: {
        type: String,
        enum: ['Lead', 'Contact', 'Account', 'Opportunity'],
        required: true
    },
    // Field configuration
    fieldType: {
        type: String,
        enum: ['text', 'number', 'date', 'dropdown', 'checkbox', 'email', 'phone', 'url', 'textarea'],
        required: true
    },
    // Dropdown options (for dropdown type)
    options: [{ type: String }],
    // Validation
    isRequired: { type: Boolean, default: false },
    defaultValue: { type: mongoose_1.default.Schema.Types.Mixed },
    placeholder: { type: String },
    // Display order
    order: { type: Number, default: 0 },
    // Visibility
    isActive: { type: Boolean, default: true },
    showInList: { type: Boolean, default: false },
    showInForm: { type: Boolean, default: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
// Compound index for uniqueness
customFieldSchema.index({ name: 1, entityType: 1, organisation: 1 }, { unique: true });
const CustomField = mongoose_1.default.models.CustomField || mongoose_1.default.model('CustomField', customFieldSchema);
exports.default = CustomField;
