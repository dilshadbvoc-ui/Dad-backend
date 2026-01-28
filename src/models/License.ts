import mongoose, { Document, Schema } from 'mongoose';

export interface ILicense extends Document {
    organisation: mongoose.Types.ObjectId;
    plan: mongoose.Types.ObjectId;

    status: 'active' | 'expired' | 'trial' | 'cancelled' | 'pending';

    startDate: Date;
    endDate: Date;

    maxUsers: number;
    currentUsers: number;

    paymentDetails?: {
        amount: number;
        currency: string;
        transactionId?: string;
        paymentMethod?: string;
        paidAt?: Date;
    };

    autoRenew: boolean;
    renewalReminders: boolean;

    activatedBy?: mongoose.Types.ObjectId;
    cancelledBy?: mongoose.Types.ObjectId;
    cancelledAt?: Date;
    cancellationReason?: string;
}

const licenseSchema = new Schema<ILicense>({
    organisation: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },

    status: {
        type: String,
        enum: ['active', 'expired', 'trial', 'cancelled', 'pending'],
        default: 'pending'
    },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    maxUsers: { type: Number, default: 5 },
    currentUsers: { type: Number, default: 0 },

    paymentDetails: {
        amount: Number,
        currency: String,
        transactionId: String,
        paymentMethod: String,
        paidAt: Date
    },

    autoRenew: { type: Boolean, default: false },
    renewalReminders: { type: Boolean, default: true },

    activatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    cancellationReason: String
}, {
    timestamps: true,
});

licenseSchema.index({ organisation: 1, status: 1 });
licenseSchema.index({ endDate: 1 });

export default mongoose.model<ILicense>('License', licenseSchema);
