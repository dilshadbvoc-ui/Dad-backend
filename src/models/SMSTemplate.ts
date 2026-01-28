import mongoose from 'mongoose';

const smsTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    content: { type: String, required: true, maxLength: 160 },

    // Variables that can be merged
    variables: [{ type: String }],  // e.g., ['firstName', 'company', 'amount']

    category: { type: String },
    language: { type: String, default: 'en' },

    // For DLT registered templates (India regulatory)
    dltTemplateId: { type: String },
    senderId: { type: String },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

const SMSTemplate = mongoose.models.SMSTemplate || mongoose.model('SMSTemplate', smsTemplateSchema);
export default SMSTemplate;
