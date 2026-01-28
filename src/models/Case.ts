import mongoose, { Document, Schema } from 'mongoose';

export interface ICase extends Document {
    caseNumber: string;
    subject: string;
    description?: string;

    status: 'new' | 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    type: 'question' | 'problem' | 'feature_request' | 'other';

    contact?: mongoose.Types.ObjectId;
    account?: mongoose.Types.ObjectId;

    assignedTo?: mongoose.Types.ObjectId;

    resolvedAt?: Date;
    resolution?: string;

    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const caseSchema = new Schema<ICase>({
    caseNumber: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    description: String,

    status: {
        type: String,
        enum: ['new', 'open', 'in_progress', 'resolved', 'closed'],
        default: 'new'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    type: {
        type: String,
        enum: ['question', 'problem', 'feature_request', 'other'],
        default: 'question'
    },

    contact: { type: Schema.Types.ObjectId, ref: 'Contact' },
    account: { type: Schema.Types.ObjectId, ref: 'Account' },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },

    resolvedAt: Date,
    resolution: String,

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

caseSchema.index({ caseNumber: 1 });
caseSchema.index({ status: 1, priority: 1 });

export default mongoose.model<ICase>('Case', caseSchema);
