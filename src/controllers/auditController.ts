import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const getAuditLogs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { entity, action, userId, startDate, endDate, page = 1, limit = 20 } = req.query;

        // Base where clause - users see ALL activities within their organisation (no hierarchy restrictions)
        const where: any = {};
        if (user.role === 'super_admin') {
            // Super admin sees everything
        } else if (user.organisationId) {
            where.organisationId = user.organisationId;

            // Hierarchy filtering for non-admins
            if (user.role !== 'admin') {
                const { getSubordinateIds } = await import('../utils/hierarchyUtils');
                const subordinateIds = await getSubordinateIds(user.id);

                // Only see activities where actor is self or a subordinate
                where.actorId = { in: subordinateIds };
            }
        } else {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        // Branch Isolation: Users can only see activities from actors in their branch (or system events)
        if (user.branchId && user.role !== 'admin' && user.role !== 'super_admin') {
            // Already filtered by actorId hierarchy above, but adding branch security for good measure
            where.actor = { branchId: user.branchId };
        } else if (req.query.branchId && (user.role === 'admin' || user.role === 'super_admin')) {
            // Admin filtering by specific branch
            where.actor = { branchId: String(req.query.branchId) };
        }

        // Filters
        if (entity) where.entity = String(entity);
        if (action) where.action = String(action);
        if (userId) {
            // If explicit userId is requested, ensure it's within the allowed hierarchy
            if (where.actorId && where.actorId.in && !where.actorId.in.includes(String(userId))) {
                return res.status(403).json({ message: 'Not authorized to view logs for this user' });
            }
            where.actorId = String(userId);
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(String(startDate));
            if (endDate) where.createdAt.lte = new Date(String(endDate));
        }

        const skip = (Number(page) - 1) * Number(limit);

        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip,
            include: {
                actor: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });

        const total = await prisma.auditLog.count({ where });

        res.json({
            logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
