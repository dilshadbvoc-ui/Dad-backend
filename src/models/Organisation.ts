import mongoose from 'mongoose';

const organisationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    domain: { type: String, unique: true, sparse: true }, // Optional custom domain
    logo: { type: String },

    // License Info
    subscription: {
        plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
        status: {
            type: String,
            enum: ['active', 'expired', 'trial', 'cancelled'],
            default: 'trial'
        },
        startDate: { type: Date },
        endDate: { type: Date },
        autoRenew: { type: Boolean, default: false }
    },

    // Contact Info
    contactEmail: { type: String },
    contactPhone: { type: String },
    address: { type: String },

    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },

    userLimit: { type: Number, default: 5 }, // Override plan limit, or default to 5
    userIdCounter: { type: Number, default: 0 }, // Counter for generating sequential user IDs
    apiKey: { type: String, select: false }, // API Key for external access

    // Integrations
    integrations: {
        meta: {
            appId: { type: String, select: false },
            appSecret: { type: String, select: false },
            verifyToken: { type: String, select: false },
            accessToken: { type: String, select: false },
            pageId: { type: String }
        },
        slack: {
            accessToken: { type: String, select: false },
            teamId: { type: String },
            teamName: { type: String },
            channelId: { type: String },
            channelName: { type: String },
            incomingWebhookUrl: { type: String, select: false },
            connected: { type: Boolean, default: false }
        },
        google: {
            accessToken: { type: String, select: false },
            refreshToken: { type: String, select: false },
            expiresAt: { type: Date },
            connected: { type: Boolean, default: false }
        },
        hubspot: {
            accessToken: { type: String, select: false },
            refreshToken: { type: String, select: false },
            expiresAt: { type: Date },
            portalId: { type: String },
            connected: { type: Boolean, default: false }
        },
        zapier: {
            apiKey: { type: String, select: false }, // If we provide an API key to Zapier
            connected: { type: Boolean, default: false }
        }
    },

    // Lead Scoring Configuration
    leadScoringConfig: {
        emailOpened: { type: Number, default: 1 },
        linkClicked: { type: Number, default: 3 },
        formSubmitted: { type: Number, default: 5 },
        callConnected: { type: Number, default: 10 },
        websiteVisit: { type: Number, default: 1 }
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
});

organisationSchema.index({ name: 1 });
organisationSchema.index({ status: 1 });
organisationSchema.index({ "subscription.status": 1 });

console.log('Defining Organisation Model...');
const Organisation = mongoose.models.Organisation || mongoose.model('Organisation', organisationSchema);
console.log('Organisation Model Defined/Retrieved:', !!Organisation);
export default Organisation;
