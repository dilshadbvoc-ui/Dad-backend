"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const quoteSchema = new mongoose_1.Schema({
    quoteNumber: { type: String, required: true, unique: true },
    opportunity: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Opportunity' },
    account: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Account' },
    contact: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Contact' },
    title: { type: String, required: true },
    description: String,
    lineItems: [{
            product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product' },
            productName: String,
            description: String,
            quantity: { type: Number, required: true },
            unitPrice: { type: Number, required: true },
            discount: { type: Number, default: 0 },
            discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
            taxRate: { type: Number, default: 0 },
            total: { type: Number, required: true }
        }],
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    validUntil: { type: Date, required: true },
    paymentTerms: String,
    termsAndConditions: String,
    notes: String,
    status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'revised'],
        default: 'draft'
    },
    version: { type: Number, default: 1 },
    sentAt: Date,
    viewedAt: Date,
    respondedAt: Date,
    pdfUrl: String,
    assignedTo: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
quoteSchema.index({ quoteNumber: 1 });
quoteSchema.index({ opportunity: 1, status: 1 });
exports.default = mongoose_1.default.model('Quote', quoteSchema);
