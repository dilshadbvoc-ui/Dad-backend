import mongoose, { Document, Schema } from 'mongoose';

export interface ITask extends Document {
    subject: string;
    description?: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
    priority: 'high' | 'medium' | 'low';
    dueDate?: Date;

    // Relations
    assignedTo: mongoose.Types.ObjectId;
    relatedTo?: mongoose.Types.ObjectId;
    onModel?: 'Lead' | 'Contact' | 'Account' | 'Opportunity';

    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const taskSchema = new Schema<ITask>({
    subject: { type: String, required: true },
    description: String,
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed', 'deferred'],
        default: 'not_started'
    },
    priority: {
        type: String,
        enum: ['high', 'medium', 'low'],
        default: 'medium'
    },
    dueDate: Date,

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    relatedTo: { type: Schema.Types.ObjectId, refPath: 'onModel' },
    onModel: {
        type: String,
        enum: ['Lead', 'Contact', 'Account', 'Opportunity']
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

export default mongoose.model<ITask>('Task', taskSchema);
