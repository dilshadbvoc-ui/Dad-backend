import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String },
    phones: [{
        type: { type: String, default: 'mobile' },
        number: String
    }],
    jobTitle: { type: String },
    department: { type: String },

    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },

    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zip: String
    },

    socialProfiles: {
        linkedin: String,
        twitter: String,
        facebook: String
    },

    doNotEmail: { type: Boolean, default: false },
    doNotCall: { type: Boolean, default: false },

    leadSource: String,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },

    customFields: { type: Map, of: mongoose.Schema.Types.Mixed },
    tags: [{ type: String }],

    lastActivity: { type: Date },
}, {
    timestamps: true,
});

const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);
export default Contact;
