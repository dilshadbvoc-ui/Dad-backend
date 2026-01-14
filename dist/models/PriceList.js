"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const priceListSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    description: { type: String },
    // Type of price list
    type: {
        type: String,
        enum: ['standard', 'discount', 'promotional', 'regional', 'customer_specific'],
        default: 'standard'
    },
    // Validity
    validFrom: { type: Date, required: true },
    validUntil: { type: Date },
    isActive: { type: Boolean, default: true },
    // Pricing rules
    items: [{
            product: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Product', required: true },
            price: { type: Number, required: true },
            discountPercent: { type: Number, default: 0 },
            minQuantity: { type: Number, default: 1 }
        }],
    // Applicability
    currency: { type: String, default: 'USD' },
    regions: [{ type: String }], // e.g., ['US', 'EU']
    customerTiers: [{ type: String }], // e.g., ['enterprise', 'premium']
    specificAccounts: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Account' }],
    // Priority for overlapping price lists
    priority: { type: Number, default: 0 },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
priceListSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });
const PriceList = mongoose_1.default.models.PriceList || mongoose_1.default.model('PriceList', priceListSchema);
exports.default = PriceList;
