"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllAsRead = exports.markAsRead = exports.getNotifications = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const getNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[NotificationController] getNotifications called');
        const user = req.user;
        if (!user || !user.id) {
            console.error('[NotificationController] No user attached to request');
            return res.status(401).json({ message: 'Not authorized' });
        }
        const userId = user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        console.log(`[NotificationController] Fetching for user: ${userId}, page: ${page}`);
        const notifications = yield prisma_1.default.notification.findMany({
            where: { recipientId: userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: (page - 1) * limit
        });
        const unreadCount = yield prisma_1.default.notification.count({
            where: { recipientId: userId, isRead: false }
        });
        res.json({ notifications, unreadCount });
    }
    catch (error) {
        console.error('getNotifications Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.getNotifications = getNotifications;
const markAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma_1.default.notification.update({
            where: { id },
            data: { isRead: true }
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});
exports.markAsRead = markAsRead;
const markAllAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        yield prisma_1.default.notification.updateMany({
            where: { recipientId: userId, isRead: false },
            data: { isRead: true }
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});
exports.markAllAsRead = markAllAsRead;
