import mongoose from 'mongoose';

const socialAccountSchema = new mongoose.Schema({
    platform: {
        type: String,
        enum: ['facebook', 'twitter', 'linkedin', 'instagram', 'youtube'],
        required: true
    },

    accountName: { type: String, required: true },
    accountId: { type: String, required: true },

    // OAuth tokens
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiresAt: { type: Date },

    // Profile info
    profileUrl: { type: String },
    profileImage: { type: String },
    followersCount: { type: Number, default: 0 },

    // Permissions/scopes granted
    scopes: [{ type: String }],

    // Features enabled
    features: {
        postPublishing: { type: Boolean, default: false },
        leadCapture: { type: Boolean, default: false },
        messaging: { type: Boolean, default: false },
        analytics: { type: Boolean, default: false }
    },

    // Stats
    stats: {
        postsPublished: { type: Number, default: 0 },
        leadsGenerated: { type: Number, default: 0 },
        messagesReceived: { type: Number, default: 0 }
    },

    // Status
    status: {
        type: String,
        enum: ['connected', 'disconnected', 'error', 'token_expired'],
        default: 'connected'
    },
    lastSyncAt: { type: Date },
    errorMessage: { type: String },

    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

socialAccountSchema.index({ platform: 1, accountId: 1 }, { unique: true });
socialAccountSchema.index({ connectedBy: 1 });

const SocialAccount = mongoose.models.SocialAccount || mongoose.model('SocialAccount', socialAccountSchema);
export default SocialAccount;
