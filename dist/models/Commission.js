"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const commissionSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    description: { type: String },
    // Commission type
    type: {
        type: String,
        enum: ['percentage', 'fixed', 'tiered', 'hybrid'],
        required: true
    },
    // Basic rate
    rate: { type: Number }, // Percentage or fixed amount
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
    products: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Product' }],
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
    assignedTo: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }],
    team: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Team' },
    role: { type: String }, // Apply to all users with this role
    // Status
    isActive: { type: Boolean, default: true },
    validFrom: { type: Date },
    validUntil: { type: Date },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
const Commission = mongoose_1.default.models.Commission || mongoose_1.default.model('Commission', commissionSchema);
exports.default = Commission;
