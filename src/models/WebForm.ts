import mongoose from 'mongoose';

const webFormSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },

    // Form fields configuration
    fields: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        label: { type: String, required: true },
        type: {
            type: String,
            enum: ['text', 'email', 'phone', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file', 'hidden'],
            required: true
        },
        placeholder: String,
        defaultValue: mongoose.Schema.Types.Mixed,
        required: { type: Boolean, default: false },
        validation: {
            pattern: String,
            minLength: Number,
            maxLength: Number,
            min: Number,
            max: Number,
            customMessage: String
        },
        options: [{  // For select, radio, checkbox
            label: String,
            value: String
        }],
        conditionalLogic: {
            enabled: { type: Boolean, default: false },
            action: { type: String, enum: ['show', 'hide'] },
            conditions: [{
                field: String,
                operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'] },
                value: mongoose.Schema.Types.Mixed
            }]
        },
        mapToField: String  // CRM lead field mapping
    }],

    // Form settings
    settings: {
        submitButtonText: { type: String, default: 'Submit' },
        successMessage: { type: String, default: 'Thank you for your submission!' },
        redirectUrl: String,
        enableCaptcha: { type: Boolean, default: true },
        captchaType: { type: String, enum: ['recaptcha', 'hcaptcha'], default: 'recaptcha' },
        notifyEmails: [String],
        autoResponder: {
            enabled: { type: Boolean, default: false },
            subject: String,
            body: String
        }
    },

    // Styling
    styling: {
        theme: { type: String, enum: ['default', 'minimal', 'modern', 'custom'], default: 'default' },
        primaryColor: { type: String, default: '#3b82f6' },
        customCss: String
    },

    // Embed code
    embedCode: { type: String },
    formToken: { type: String, unique: true },

    // Lead capture connection
    leadCaptureSource: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadCapture' },
    defaultAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Stats
    stats: {
        views: { type: Number, default: 0 },
        submissions: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 }
    },

    status: {
        type: String,
        enum: ['draft', 'active', 'inactive'],
        default: 'draft'
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

webFormSchema.index({ formToken: 1 });

const WebForm = mongoose.models.WebForm || mongoose.model('WebForm', webFormSchema);
export default WebForm;
