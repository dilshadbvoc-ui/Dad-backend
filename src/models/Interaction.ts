import mongoose, { Document, Schema } from 'mongoose';

export interface IInteraction extends Document {
    type: 'call' | 'email' | 'meeting' | 'note' | 'other';
    direction: 'inbound' | 'outbound';
    subject: string;
    description?: string;
    date: Date;
    duration?: number; // in minutes

    // Call Recording Fields
    recordingUrl?: string;
    recordingDuration?: number; // in seconds
    callStatus?: 'initiated' | 'ringing' | 'answered' | 'completed' | 'missed' | 'failed';
    phoneNumber?: string;
    callerId?: string;

    // Polymorphic Reference
    relatedTo: mongoose.Types.ObjectId;
    onModel: 'Lead' | 'Contact' | 'Account' | 'Opportunity';

    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const interactionSchema = new Schema<IInteraction>({
    type: {
        type: String,
        enum: ['call', 'email', 'meeting', 'note', 'other'],
        required: true
    },
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'outbound'
    },
    subject: { type: String, required: true },
    description: String,
    date: { type: Date, default: Date.now },
    duration: Number,

    // Call Recording Specific Fields
    recordingUrl: String,
    recordingDuration: Number, // in seconds
    callStatus: {
        type: String,
        enum: ['initiated', 'ringing', 'answered', 'completed', 'missed', 'failed'],
        default: 'completed'
    },
    phoneNumber: String,
    callerId: String,

    relatedTo: { type: Schema.Types.ObjectId, required: true, refPath: 'onModel' },
    onModel: {
        type: String,
        required: true,
        enum: ['Lead', 'Contact', 'Account', 'Opportunity']
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

export default mongoose.model<IInteraction>('Interaction', interactionSchema);
