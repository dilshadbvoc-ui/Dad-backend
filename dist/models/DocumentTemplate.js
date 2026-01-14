"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const documentTemplateSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    description: { type: String },
    // Template type
    type: {
        type: String,
        enum: ['quote', 'proposal', 'contract', 'invoice', 'letter', 'email', 'report'],
        required: true
    },
    // Content
    content: { type: String, required: true }, // HTML with merge fields
    // Merge fields defined
    mergeFields: [{
            field: String, // e.g., {{contact.firstName}}
            label: String,
            source: { type: String, enum: ['lead', 'contact', 'account', 'opportunity', 'quote', 'user', 'custom'] },
            defaultValue: String
        }],
    // Styling
    styling: {
        headerHtml: String,
        footerHtml: String,
        css: String,
        pageSize: { type: String, enum: ['A4', 'Letter', 'Legal'], default: 'A4' },
        orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
        margins: {
            top: { type: Number, default: 20 },
            bottom: { type: Number, default: 20 },
            left: { type: Number, default: 20 },
            right: { type: Number, default: 20 }
        }
    },
    // Versioning
    version: { type: Number, default: 1 },
    // Status
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    // Usage stats
    stats: {
        timesUsed: { type: Number, default: 0 },
        lastUsedAt: Date
    },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
documentTemplateSchema.index({ type: 1, isActive: 1 });
const DocumentTemplate = mongoose_1.default.models.DocumentTemplate || mongoose_1.default.model('DocumentTemplate', documentTemplateSchema);
exports.default = DocumentTemplate;
