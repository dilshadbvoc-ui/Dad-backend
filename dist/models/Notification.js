"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const notificationSchema = new mongoose_1.default.Schema({
    recipient: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
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
    relatedId: { type: mongoose_1.default.Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});
notificationSchema.index({ recipient: 1, isRead: 1 });
const Notification = mongoose_1.default.models.Notification || mongoose_1.default.model('Notification', notificationSchema);
exports.default = Notification;
