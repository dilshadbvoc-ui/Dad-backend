import mongoose from 'mongoose';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },

    // The key itself (hashed for security)
    keyHash: { type: String, required: true },
    keyPrefix: { type: String, required: true },  // First 8 chars for display

    // Permissions
    permissions: [{
        resource: { type: String, required: true },  // e.g., 'leads', 'contacts', 'opportunities'
        actions: [{ type: String, enum: ['read', 'create', 'update', 'delete'] }]
    }],

    // Rate limiting
    rateLimit: {
        requestsPerMinute: { type: Number, default: 60 },
        requestsPerDay: { type: Number, default: 10000 }
    },

    // IP restrictions
    allowedIPs: [{ type: String }],

    // Usage tracking
    usage: {
        totalRequests: { type: Number, default: 0 },
        lastUsedAt: Date,
        lastUsedIP: String
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'revoked'],
        default: 'active'
    },

    // Expiry
    expiresAt: { type: Date },

    // Owner
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

// Static method to generate API key
apiKeySchema.statics.generateKey = function () {
    const key = 'crm_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const keyPrefix = key.substring(0, 12);
    return { key, keyHash, keyPrefix };
};

// Static method to verify API key
apiKeySchema.statics.verifyKey = function (key: string) {
    return crypto.createHash('sha256').update(key).digest('hex');
};

apiKeySchema.index({ keyHash: 1 });
apiKeySchema.index({ keyPrefix: 1 });
apiKeySchema.index({ createdBy: 1 });

const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
