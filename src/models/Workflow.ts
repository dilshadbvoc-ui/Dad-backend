import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkflow extends Document {
    name: string;
    description?: string;
    isActive: boolean;

    triggerEntity: 'Lead' | 'Contact' | 'Account' | 'Opportunity' | 'Task';
    triggerEvent: 'created' | 'updated' | 'deleted' | 'status_changed' | 'assigned';

    conditions: {
        field: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
        value: any;
    }[];

    actions: {
        type: 'send_email' | 'create_task' | 'update_field' | 'notify_user' | 'webhook';
        config: Record<string, any>;
    }[];

    executionCount: number;
    lastExecutedAt?: Date;

    createdBy: mongoose.Types.ObjectId;
    organisation: mongoose.Types.ObjectId;
    isDeleted: boolean;
}

const workflowSchema = new Schema<IWorkflow>({
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: false },

    triggerEntity: {
        type: String,
        enum: ['Lead', 'Contact', 'Account', 'Opportunity', 'Task'],
        required: true
    },
    triggerEvent: {
        type: String,
        enum: ['created', 'updated', 'deleted', 'status_changed', 'assigned'],
        required: true
    },

    conditions: [{
        field: String,
        operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'] },
        value: Schema.Types.Mixed
    }],

    actions: [{
        type: { type: String, enum: ['send_email', 'create_task', 'update_field', 'notify_user', 'webhook'] },
        config: Schema.Types.Mixed
    }],

    executionCount: { type: Number, default: 0 },
    lastExecutedAt: Date,

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

export default mongoose.model<IWorkflow>('Workflow', workflowSchema);
