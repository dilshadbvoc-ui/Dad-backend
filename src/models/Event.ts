import mongoose, { Document, Schema } from 'mongoose';

export interface IEvent extends Document {
    title: string;
    type: 'meeting' | 'call' | 'demo' | 'follow_up' | 'task' | 'reminder';
    startTime: Date;
    endTime: Date;
    location?: string;
    description?: string;

    // Relations
    lead?: mongoose.Types.ObjectId;
    contact?: mongoose.Types.ObjectId;
    account?: mongoose.Types.ObjectId;
    opportunity?: mongoose.Types.ObjectId;

    virtualMeeting?: {
        provider: 'zoom' | 'google_meet' | 'teams';
        url: string;
    };

    status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';

    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const eventSchema = new Schema<IEvent>({
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ['meeting', 'call', 'demo', 'follow_up', 'task', 'reminder'],
        default: 'meeting'
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    location: String,
    description: String,

    lead: { type: Schema.Types.ObjectId, ref: 'Lead' },
    contact: { type: Schema.Types.ObjectId, ref: 'Contact' },
    account: { type: Schema.Types.ObjectId, ref: 'Account' },
    opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity' },

    virtualMeeting: {
        provider: { type: String, enum: ['zoom', 'google_meet', 'teams'] },
        url: String
    },

    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
        default: 'scheduled'
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

export default mongoose.model<IEvent>('Event', eventSchema);
