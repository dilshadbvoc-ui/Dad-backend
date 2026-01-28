import mongoose, { Document, Schema } from 'mongoose';

export interface ICheckIn extends Document {
    user: mongoose.Types.ObjectId;
    type: 'check_in' | 'check_out';

    location: {
        address?: string;
        latitude?: number;
        longitude?: number;
    };

    // Related entity
    relatedTo?: mongoose.Types.ObjectId;
    onModel?: 'Lead' | 'Contact' | 'Account';

    notes?: string;
    photoUrl?: string;

    organisation: mongoose.Types.ObjectId;
}

const checkInSchema = new Schema<ICheckIn>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['check_in', 'check_out'], required: true },

    location: {
        address: String,
        latitude: Number,
        longitude: Number
    },

    relatedTo: { type: Schema.Types.ObjectId, refPath: 'onModel' },
    onModel: { type: String, enum: ['Lead', 'Contact', 'Account'] },

    notes: String,
    photoUrl: String,

    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
    timestamps: true,
});

checkInSchema.index({ user: 1, createdAt: -1 });
checkInSchema.index({ organisation: 1, createdAt: -1 });

export default mongoose.model<ICheckIn>('CheckIn', checkInSchema);
