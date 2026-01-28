import mongoose from 'mongoose';

const webhookSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },

    // Events to listen for
    events: [{
        type: String,
        enum: [
            'lead.created', 'lead.updated', 'lead.converted', 'lead.deleted',
            'contact.created', 'contact.updated', 'contact.deleted',
            'opportunity.created', 'opportunity.updated', 'opportunity.stage_changed', 'opportunity.won', 'opportunity.lost',
            'task.created', 'task.completed'
        ]
    }],

    // Authentication
    secret: { type: String }, // For signing payloads
    headers: { type: Map, of: String }, // Custom headers

    // Status
    isActive: { type: Boolean, default: true },

    // Tracking
    lastTriggeredAt: { type: Date },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    lastError: { type: String },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

const Webhook = mongoose.models.Webhook || mongoose.model('Webhook', webhookSchema);
export default Webhook;
