import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true, unique: true },
    company: { type: String },
    jobTitle: { type: String },

    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zip: String
    },

    // Source & Attribution
    source: {
        type: String,
        enum: ['website', 'referral', 'social', 'paid_ad', 'import', 'api', 'manual'],
        default: 'manual'
    },
    sourceDetails: {
        campaign: String,
        medium: String,
        content: String,
        term: String
    },

    // Scoring
    leadScore: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0 },
    qualityScore: { type: Number, default: 0 },

    // Status & Assignment
    status: {
        type: String,
        enum: ['new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost', 'reborn'],
        default: 'new'
    },
    stage: { type: String }, // Linked to pipeline stage
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },

    // Custom Fields
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed },

    activities: [{
        type: { type: String, enum: ['call', 'email', 'meeting', 'note', 'task', 'log'], default: 'log' },
        description: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }],

    tags: [{ type: String }],

    // Rotation & SLA Tracking
    rotationViolation: { type: Boolean, default: false },
    violationTime: { type: Date },
    previousOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userExplanation: { type: String },
    managerExplanation: { type: String },

    convertedToContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    convertedToAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    convertedToOpportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity' },

    isDeleted: { type: Boolean, default: false },
}, {
    timestamps: true,
});

// Indexes for faster searching
leadSchema.index({ email: 1, phone: 1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ organisation: 1, status: 1 }); // Optimize dashboard stats
leadSchema.index({ organisation: 1, isDeleted: 1 }); // Optimize generic fetch
leadSchema.index({ organisation: 1, source: 1 }); // Optimize source analytics

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
export default Lead;
