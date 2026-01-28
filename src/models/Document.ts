import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String }, // MIME type
    size: { type: Number }, // in bytes

    // Polymorphic Relationship
    relatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'onModel'
    },
    onModel: {
        type: String,
        required: true,
        enum: ['Lead', 'Contact', 'Account', 'Opportunity']
    },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);
export default Document;
