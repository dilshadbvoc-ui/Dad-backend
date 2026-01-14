"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const smsTemplateSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    content: { type: String, required: true, maxLength: 160 },
    // Variables that can be merged
    variables: [{ type: String }], // e.g., ['firstName', 'company', 'amount']
    category: { type: String },
    language: { type: String, default: 'en' },
    // For DLT registered templates (India regulatory)
    dltTemplateId: { type: String },
    senderId: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
const SMSTemplate = mongoose_1.default.models.SMSTemplate || mongoose_1.default.model('SMSTemplate', smsTemplateSchema);
exports.default = SMSTemplate;
