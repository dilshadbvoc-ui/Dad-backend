import mongoose from 'mongoose';

const smsCampaignSchema = new mongoose.Schema({
    name: { type: String, required: true },

    // Template
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'SMSTemplate' },
    message: { type: String, required: true },

    // Recipients
    recipients: {
        type: {
            type: String,
            enum: ['segment', 'list', 'manual', 'all_leads'],
            required: true
        },
        segment: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadSegment' },
        list: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailList' },
        manualNumbers: [{ type: String }]
    },

    totalRecipients: { type: Number, default: 0 },

    // Scheduling
    scheduledAt: { type: Date },
    sentAt: { type: Date },

    // Status
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'],
        default: 'draft'
    },

    // Stats
    stats: {
        sent: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },  // If link included
        optedOut: { type: Number, default: 0 }
    },

    // Provider details
    provider: { type: String, default: 'twilio' },
    senderId: { type: String },

    // Cost tracking
    cost: {
        perSms: { type: Number },
        total: { type: Number }
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

smsCampaignSchema.index({ status: 1, scheduledAt: 1 });

const SMSCampaign = mongoose.models.SMSCampaign || mongoose.model('SMSCampaign', smsCampaignSchema);
export default SMSCampaign;
