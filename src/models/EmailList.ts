import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailList extends Document {
    name: string;
    description?: string;
    contacts: mongoose.Types.ObjectId[];
    leads: mongoose.Types.ObjectId[];
    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const emailListSchema = new Schema<IEmailList>({
    name: { type: String, required: true },
    description: String,
    contacts: [{ type: Schema.Types.ObjectId, ref: 'Contact' }],
    leads: [{ type: Schema.Types.ObjectId, ref: 'Lead' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // Organisation is linked via User usually in this app schema
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

export default mongoose.model<IEmailList>('EmailList', emailListSchema);
