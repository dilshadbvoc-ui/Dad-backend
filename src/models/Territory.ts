import mongoose, { Document, Schema } from 'mongoose';

export interface ITerritory extends Document {
    name: string;
    description?: string;

    region?: string;
    country?: string;
    states?: string[];
    cities?: string[];

    manager?: mongoose.Types.ObjectId;
    members: mongoose.Types.ObjectId[];

    isActive: boolean;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const territorySchema = new Schema<ITerritory>({
    name: { type: String, required: true },
    description: String,

    region: String,
    country: String,
    states: [String],
    cities: [String],

    manager: { type: Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    isActive: { type: Boolean, default: true },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

export default mongoose.model<ITerritory>('Territory', territorySchema);
