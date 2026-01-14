import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info'
    },
    relatedResource: {
        type: String,
        enum: ['Lead', 'Contact', 'Opportunity', 'Task', 'Deal', 'SalesTarget'],
    },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;
