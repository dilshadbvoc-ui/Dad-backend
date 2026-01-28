import mongoose from 'mongoose';

const commissionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },

    // Commission type
    type: {
        type: String,
        enum: ['percentage', 'fixed', 'tiered', 'hybrid'],
        required: true
    },

    // Basic rate
    rate: { type: Number },  // Percentage or fixed amount
    currency: { type: String, default: 'USD' },

    // Tiered commission (for tiered type)
    tiers: [{
        minValue: Number,
        maxValue: Number,
        rate: Number,
        rateType: { type: String, enum: ['percentage', 'fixed'] }
    }],

    // Applicability
    applicableTo: {
        type: String,
        enum: ['all', 'products', 'categories', 'specific'],
        default: 'all'
    },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categories: [{ type: String }],

    // Calculation basis
    calculateOn: {
        type: String,
        enum: ['revenue', 'profit', 'deal_value', 'collected_amount'],
        default: 'revenue'
    },

    // Conditions
    conditions: {
        minDealValue: Number,
        maxDealValue: Number,
        dealStages: [String],
        includeDiscounts: { type: Boolean, default: true }
    },

    // Assignment
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    role: { type: String },  // Apply to all users with this role

    // Status
    isActive: { type: Boolean, default: true },
    validFrom: { type: Date },
    validUntil: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

const Commission = mongoose.models.Commission || mongoose.model('Commission', commissionSchema);
export default Commission;
