import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
    name: { type: String, required: true },
    industry: String,
    website: String,
    size: String, // e.g. "1-10", "11-50"
    annualRevenue: Number,

    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zip: String
    },

    phone: String,

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },

    // Relationships
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    opportunities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity' }],
    parentAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },

    type: {
        type: String,
        enum: ['prospect', 'customer', 'partner', 'vendor'],
        default: 'prospect'
    },

    customFields: { type: Map, of: mongoose.Schema.Types.Mixed },
    tags: [{ type: String }],
}, {
    timestamps: true,
});

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
export default Account;
