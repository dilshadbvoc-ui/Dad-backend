"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const contactSchema = new mongoose_1.default.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String },
    phones: [{
            type: { type: String, default: 'mobile' },
            number: String
        }],
    jobTitle: { type: String },
    department: { type: String },
    account: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Account' },
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
    owner: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    customFields: { type: Map, of: mongoose_1.default.Schema.Types.Mixed },
    tags: [{ type: String }],
    lastActivity: { type: Date },
}, {
    timestamps: true,
});
const Contact = mongoose_1.default.models.Contact || mongoose_1.default.model('Contact', contactSchema);
exports.default = Contact;
