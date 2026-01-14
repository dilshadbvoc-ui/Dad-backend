"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const documentSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String }, // MIME type
    size: { type: Number }, // in bytes
    // Polymorphic Relationship
    relatedTo: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        refPath: 'onModel'
    },
    onModel: {
        type: String,
        required: true,
        enum: ['Lead', 'Contact', 'Account', 'Opportunity']
    },
    uploadedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
const Document = mongoose_1.default.models.Document || mongoose_1.default.model('Document', documentSchema);
exports.default = Document;
