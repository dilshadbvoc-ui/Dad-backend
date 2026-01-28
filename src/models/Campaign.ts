import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaign extends Document {
    name: string;
    subject: string;
    content: string;
    status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
    scheduledAt?: Date;
    sentAt?: Date;
    emailList: mongoose.Types.ObjectId;
    stats: {
        sent: number;
        opened: number;
        clicked: number;
        bounced: number;
    };
    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const campaignSchema = new Schema<ICampaign>({
    name: { type: String, required: true },
    subject: { type: String, required: true },
    content: { type: String, required: true },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sent', 'cancelled'],
        default: 'draft'
    },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    emailList: { type: Schema.Types.ObjectId, ref: 'EmailList', required: true },
    stats: {
        sent: { type: Number, default: 0 },
        opened: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
        bounced: { type: Number, default: 0 }
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

export default mongoose.model<ICampaign>('Campaign', campaignSchema);
