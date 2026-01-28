import mongoose, { Document, Schema } from 'mongoose';

export interface IGoal extends Document {
    name: string;
    description?: string;

    type: 'revenue' | 'deals' | 'leads' | 'calls' | 'meetings' | 'custom';

    targetValue: number;
    currentValue: number;
    unit: string;
    currency: string;

    period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
    startDate: Date;
    endDate: Date;

    assignmentType: 'individual' | 'team' | 'company';
    assignedTo?: mongoose.Types.ObjectId;
    team?: mongoose.Types.ObjectId;

    status: 'active' | 'completed' | 'missed' | 'cancelled';
    completedAt?: Date;
    achievementPercent: number;

    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const goalSchema = new Schema<IGoal>({
    name: { type: String, required: true },
    description: String,

    type: {
        type: String,
        enum: ['revenue', 'deals', 'leads', 'calls', 'meetings', 'custom'],
        required: true
    },

    targetValue: { type: Number, required: true },
    currentValue: { type: Number, default: 0 },
    unit: { type: String, default: 'count' },
    currency: { type: String, default: 'USD' },

    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
        required: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    assignmentType: {
        type: String,
        enum: ['individual', 'team', 'company'],
        default: 'individual'
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    team: { type: Schema.Types.ObjectId, ref: 'Team' },

    status: {
        type: String,
        enum: ['active', 'completed', 'missed', 'cancelled'],
        default: 'active'
    },
    completedAt: Date,
    achievementPercent: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

goalSchema.index({ assignedTo: 1, status: 1 });
goalSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.model<IGoal>('Goal', goalSchema);
