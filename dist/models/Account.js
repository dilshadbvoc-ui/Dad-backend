"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const accountSchema = new mongoose_1.default.Schema({
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
    owner: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    // Relationships
    contacts: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Contact' }],
    opportunities: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Opportunity' }],
    parentAccount: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Account' },
    type: {
        type: String,
        enum: ['prospect', 'customer', 'partner', 'vendor'],
        default: 'prospect'
    },
    customFields: { type: Map, of: mongoose_1.default.Schema.Types.Mixed },
    tags: [{ type: String }],
}, {
    timestamps: true,
});
const Account = mongoose_1.default.models.Account || mongoose_1.default.model('Account', accountSchema);
exports.default = Account;
