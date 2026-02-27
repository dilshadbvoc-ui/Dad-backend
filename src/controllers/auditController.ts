import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { normalizeRole, isSuperAdmin as checkSuperAdmin } from '../utils/roleUtils';

export const getAuditLogs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { entity, action, userId, startDate, endDate, page = 1, limit = 20 } = req.query;

        const normalisedUserRole = normalizeRole(user.role);
        const userIsSuperAdmin = checkSuperAdmin(user);
        const isOrgAdmin = normalisedUserRole === 'admin';

        const where: any = {};

        // 1. ORGANISATION ISOLATION
        if (!userIsSuperAdmin) {
            if (!user.organisationId) {
                return res.status(400).json({ message: 'Organisation not found' });
            }
            where.organisationId = user.organisationId;
        } else {
            // Super Admin can view specific org if requested, otherwise defaults to all or their own
            const targetOrgId = req.query.organisationId || user.organisationId;
            if (targetOrgId) {
                where.organisationId = String(targetOrgId);
            }
        }

        // 2. HIERARCHY FILTERING - Users should not see activities from people above them
        if (!userIsSuperAdmin) {
            const { getSubordinateIds } = await import('../utils/hierarchyUtils');
            const subordinateIds = await getSubordinateIds(user.id);

            // Limit actor to self or subordinates (not superiors)
            where.actorId = { in: subordinateIds };
        }

        // 3. BRANCH ISOLATION (Optional but enforced for non-admins)
        if (user.branchId && !isOrgAdmin && !userIsSuperAdmin) {
            // Ensure they only see activities from their own branch
            where.actor = { 
                ...where.actor,
                branchId: user.branchId 
            };
        } else if (req.query.branchId && (isOrgAdmin || userIsSuperAdmin)) {
            // Admins can explicitly filter by branch
            where.actor = { 
                ...where.actor,
                branchId: String(req.query.branchId) 
            };
        }

        // 4. EXPLICIT FILTERS
        if (entity) where.entity = String(entity);
        if (action) where.action = String(action);
        if (userId) {
            const targetUserId = String(userId);
            // Security Check: If requesting a specific user, ensure they are in the allowed hierarchy
            if (where.actorId && where.actorId.in && !where.actorId.in.includes(targetUserId)) {
                return res.status(403).json({ message: 'Not authorized to view logs for this user' });
            }
            where.actorId = targetUserId;
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
                        email: true,
                        role: true
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
