"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastNotification = exports.markAllAsRead = exports.markAsRead = exports.getNotifications = void 0;
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
    catch (error) {
        console.error('markAsRead Error:', error);
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
    catch (error) {
        console.error('markAllAsRead Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
exports.markAllAsRead = markAllAsRead;
// Broadcast notification to all users in the organisation (Organisation Admin Only)
const broadcastNotification = async (req, res) => {
    try {
        const user = req.user;
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Organisation admin only.' });
        }
        const { title, message } = req.body;
        if (!title || !message) {
            return res.status(400).json({ message: 'Title and message are required' });
        }
        const organisationId = user.organisationId;
        if (!organisationId) {
            return res.status(400).json({ message: 'User is not associated with an organisation' });
        }
        // Fetch all active, non-deleted users in the admin's organisation
        const orgUsers = await prisma_1.default.user.findMany({
            where: {
                organisationId,
                isActive: true,
                isDeleted: false
            },
            select: { id: true }
        });
        if (orgUsers.length === 0) {
            return res.json({ success: true, count: 0, message: 'No users found in this organisation' });
        }
        const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
        // Prepare notifications data with pre-generated UUIDs
        const notificationsData = orgUsers.map(orgUser => ({
            id: crypto.randomUUID(),
            recipientId: orgUser.id,
            title,
            message,
            type: 'popup',
            isRead: false,
            createdAt: new Date(),
            updatedAt: new Date()
        }));
        // Batch insert
        await prisma_1.default.notification.createMany({
            data: notificationsData
        });
        // Real-time emission via Socket.io
        const { getIO } = await Promise.resolve().then(() => __importStar(require('../socket')));
        const io = getIO();
        if (io) {
            notificationsData.forEach(notif => {
                io.to(notif.recipientId).emit('notification', notif);
            });
        }
        res.json({ success: true, count: orgUsers.length, message: `Broadcast successfully sent to ${orgUsers.length} users` });
    }
    catch (error) {
        console.error('broadcastNotification Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.broadcastNotification = broadcastNotification;
