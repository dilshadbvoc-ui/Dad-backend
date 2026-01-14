
import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const getNotifications = async (req: Request, res: Response) => {
    try {
        console.log('[NotificationController] getNotifications called');
        const user = (req as any).user;

        if (!user || !user.id) {
            console.error('[NotificationController] No user attached to request');
            return res.status(401).json({ message: 'Not authorized' });
        }

        const userId = user.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        console.log(`[NotificationController] Fetching for user: ${userId}, page: ${page}`);

        const notifications = await prisma.notification.findMany({
            where: { recipientId: userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: (page - 1) * limit
        });

        const unreadCount = await prisma.notification.count({
            where: { recipientId: userId, isRead: false }
        });

        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('getNotifications Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const markAsRead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.notification.update({
            where: { id },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

export const markAllAsRead = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        await prisma.notification.updateMany({
            where: { recipientId: userId, isRead: false },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};
