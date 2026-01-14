"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const importJobSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    // Import type
    entityType: {
        type: String,
        enum: ['leads', 'contacts', 'accounts', 'products', 'opportunities'],
        required: true
    },
    // File info
    file: {
        name: String,
        url: String,
        type: { type: String, enum: ['csv', 'xlsx', 'json'] },
        size: Number
    },
    // Field mapping
    fieldMapping: [{
            sourceField: String, // Column name in file
            targetField: String, // CRM field name
            transformation: { type: String, enum: ['none', 'uppercase', 'lowercase', 'trim', 'date_format'] }
        }],
    // Import settings
    settings: {
        duplicateHandling: {
            type: String,
            enum: ['skip', 'update', 'create_new'],
            default: 'skip'
        },
        duplicateCheckFields: [String], // Fields to check for duplicates
        defaultValues: { type: Map, of: mongoose_1.default.Schema.Types.Mixed },
        assignTo: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
        tags: [String]
    },
    // Progress tracking
    progress: {
        totalRows: { type: Number, default: 0 },
        processedRows: { type: Number, default: 0 },
        successCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        duplicateCount: { type: Number, default: 0 },
        percent: { type: Number, default: 0 }
    },
    // Error log
    errors: [{
            row: Number,
            field: String,
            value: String,
            error: String
        }],
    // Status
    status: {
        type: String,
        enum: ['pending', 'validating', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
importJobSchema.index({ status: 1, createdAt: -1 });
importJobSchema.index({ createdBy: 1 });
const ImportJob = mongoose_1.default.models.ImportJob || mongoose_1.default.model('ImportJob', importJobSchema);
exports.default = ImportJob;
