import mongoose, { Document, Schema } from 'mongoose';

export interface IQuote extends Document {
    quoteNumber: string;

    opportunity?: mongoose.Types.ObjectId;
    account?: mongoose.Types.ObjectId;
    contact?: mongoose.Types.ObjectId;

    title: string;
    description?: string;

    lineItems: {
        product?: mongoose.Types.ObjectId;
        productName?: string;
        description?: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        discountType: 'percent' | 'fixed';
        taxRate: number;
        total: number;
    }[];

    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    grandTotal: number;
    currency: string;

    validUntil: Date;
    paymentTerms?: string;
    termsAndConditions?: string;
    notes?: string;

    status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'revised';
    version: number;

    sentAt?: Date;
    viewedAt?: Date;
    respondedAt?: Date;

    pdfUrl?: string;

    assignedTo?: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const quoteSchema = new Schema<IQuote>({
    quoteNumber: { type: String, required: true, unique: true },

    opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity' },
    account: { type: Schema.Types.ObjectId, ref: 'Account' },
    contact: { type: Schema.Types.ObjectId, ref: 'Contact' },

    title: { type: String, required: true },
    description: String,

    lineItems: [{
        product: { type: Schema.Types.ObjectId, ref: 'Product' },
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

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

quoteSchema.index({ quoteNumber: 1 });
quoteSchema.index({ opportunity: 1, status: 1 });

export default mongoose.model<IQuote>('Quote', quoteSchema);
