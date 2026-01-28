import mongoose from 'mongoose';

const generatedDocumentSchema = new mongoose.Schema({
    name: { type: String, required: true },

    // Source template
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentTemplate', required: true },

    // Related entities
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity' },
    quote: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },

    // Content
    content: { type: String, required: true },  // Merged HTML

    // File
    file: {
        url: String,
        type: { type: String, enum: ['pdf', 'docx', 'html'] },
        size: Number,
        generatedAt: Date
    },

    // Status
    status: {
        type: String,
        enum: ['draft', 'generated', 'sent', 'signed', 'expired'],
        default: 'draft'
    },

    // E-signature
    signature: {
        required: { type: Boolean, default: false },
        signedAt: Date,
        signedBy: String,
        signatureImage: String,
        ipAddress: String
    },

    // Tracking
    tracking: {
        viewedAt: Date,
        viewCount: { type: Number, default: 0 },
        downloadCount: { type: Number, default: 0 }
    },

    sentAt: Date,
    expiresAt: Date,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

generatedDocumentSchema.index({ template: 1, createdAt: -1 });
generatedDocumentSchema.index({ createdBy: 1 });

const GeneratedDocument = mongoose.models.GeneratedDocument || mongoose.model('GeneratedDocument', generatedDocumentSchema);
export default GeneratedDocument;
