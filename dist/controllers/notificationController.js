"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllAsRead = exports.markAsRead = exports.getNotifications = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const getNotifications = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.id) {
            return res.status(401).json({ message: 'Not authorized' });
        }
        const userId = user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const type = req.query.type; // 'info', 'warning', etc.
        const isRead = req.query.isRead; // 'true', 'false', or undefined
        const whereClause = { recipientId: userId };
        if (type && type !== 'all') {
            whereClause.type = type;
        }
        if (isRead === 'true') {
            whereClause.isRead = true;
        }
        else if (isRead === 'false') {
            whereClause.isRead = false;
        }
        const notifications = await prisma_1.default.notification.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: (page - 1) * limit
        });
        const total = await prisma_1.default.notification.count({ where: whereClause });
        const unreadCount = await prisma_1.default.notification.count({
            where: { recipientId: userId, isRead: false }
        });
        res.json({
            notifications,
            unreadCount,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    }
    catch (error) {
        console.error('getNotifications Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getNotifications = getNotifications;
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.default.notification.update({
            where: { id },
            data: { isRead: true }
        });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ message: 'Server Error' });
    }
};
exports.markAsRead = markAsRead;
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        await prisma_1.default.notification.updateMany({
            where: { recipientId: userId, isRead: false },
            data: { isRead: true }
        });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ message: 'Server Error' });
    }
};
exports.markAllAsRead = markAllAsRead;
