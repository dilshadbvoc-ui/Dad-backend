import mongoose from 'mongoose';

const leadCaptureSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: {
        type: String,
        enum: ['web_form', 'landing_page', 'chat_widget', 'phone', 'api', 'import', 'social'],
        required: true
    },

    // Configuration based on type
    config: {
        // For web forms
        formFields: [{
            name: String,
            label: String,
            type: { type: String, enum: ['text', 'email', 'phone', 'select', 'checkbox', 'textarea'] },
            required: Boolean,
            options: [String]
        }],

        // For landing pages
        pageUrl: String,
        templateId: String,

        // For chat widget
        widgetCode: String,
        position: { type: String, enum: ['bottom-right', 'bottom-left'] },

        // For phone tracking
        phoneNumber: String,
        trackingCode: String,

        // For API integrations
        apiEndpoint: String,
        webhookUrl: String
    },

    // Lead assignment
    defaultAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignmentRule: { type: mongoose.Schema.Types.ObjectId, ref: 'AssignmentRule' },

    // Tracking
    stats: {
        totalCaptures: { type: Number, default: 0 },
        todayCaptures: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 }
    },

    status: {
        type: String,
        enum: ['active', 'inactive', 'draft'],
        default: 'draft'
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

const LeadCapture = mongoose.models.LeadCapture || mongoose.model('LeadCapture', leadCaptureSchema);
export default LeadCapture;
