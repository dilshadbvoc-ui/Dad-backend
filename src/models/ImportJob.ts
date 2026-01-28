import mongoose from 'mongoose';

const importJobSchema = new mongoose.Schema({
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
        sourceField: String,  // Column name in file
        targetField: String,  // CRM field name
        transformation: { type: String, enum: ['none', 'uppercase', 'lowercase', 'trim', 'date_format'] }
    }],

    // Import settings
    settings: {
        duplicateHandling: {
            type: String,
            enum: ['skip', 'update', 'create_new'],
            default: 'skip'
        },
        duplicateCheckFields: [String],  // Fields to check for duplicates
        defaultValues: { type: Map, of: mongoose.Schema.Types.Mixed },
        assignTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

importJobSchema.index({ status: 1, createdAt: -1 });
importJobSchema.index({ createdBy: 1 });

const ImportJob = mongoose.models.ImportJob || mongoose.model('ImportJob', importJobSchema);
export default ImportJob;
