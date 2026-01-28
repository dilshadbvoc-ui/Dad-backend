import mongoose, { Document, Schema } from 'mongoose';

export interface ISalesTarget extends Document {
    targetValue: number;
    achievedValue: number;
    period: 'monthly' | 'quarterly' | 'yearly';
    startDate: Date;
    endDate: Date;

    assignedTo: mongoose.Types.ObjectId;
    assignedBy: mongoose.Types.ObjectId;
    parentTarget?: mongoose.Types.ObjectId;

    status: 'active' | 'completed' | 'missed';
    autoDistributed: boolean;
    lastNotifiedDate?: Date;

    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const salesTargetSchema = new Schema<ISalesTarget>({
    targetValue: { type: Number, required: true },
    achievedValue: { type: Number, default: 0 },
    period: {
        type: String,
        enum: ['monthly', 'quarterly', 'yearly'],
        required: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentTarget: { type: Schema.Types.ObjectId, ref: 'SalesTarget' },

    status: {
        type: String,
        enum: ['active', 'completed', 'missed'],
        default: 'active'
    },
    autoDistributed: { type: Boolean, default: false },
    lastNotifiedDate: { type: Date },

    organisation: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

// Indexes for performance
salesTargetSchema.index({ assignedTo: 1, status: 1 });
salesTargetSchema.index({ parentTarget: 1 });
salesTargetSchema.index({ organisation: 1, period: 1 });
salesTargetSchema.index({ startDate: 1, endDate: 1 });

const SalesTarget = mongoose.models.SalesTarget || mongoose.model<ISalesTarget>('SalesTarget', salesTargetSchema);
export default SalesTarget;
