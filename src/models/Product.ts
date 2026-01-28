import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
    name: string;
    sku?: string;
    description?: string;

    basePrice: number;
    currency: string;
    taxRate: number;

    category?: string;
    tags: string[];

    unit: string;
    minQuantity: number;
    maxQuantity?: number;

    imageUrl?: string;

    isActive: boolean;
    validFrom?: Date;
    validUntil?: Date;

    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const productSchema = new Schema<IProduct>({
    name: { type: String, required: true },
    sku: { type: String },
    description: String,

    basePrice: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    taxRate: { type: Number, default: 0 },

    category: String,
    tags: [String],

    unit: { type: String, default: 'unit' },
    minQuantity: { type: Number, default: 1 },
    maxQuantity: Number,

    imageUrl: String,

    isActive: { type: Boolean, default: true },
    validFrom: Date,
    validUntil: Date,

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

productSchema.index({ sku: 1 });
productSchema.index({ category: 1, isActive: 1 });

export default mongoose.model<IProduct>('Product', productSchema);
