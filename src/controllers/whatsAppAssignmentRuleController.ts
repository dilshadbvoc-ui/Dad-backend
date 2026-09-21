import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getWhatsAppAssignmentRules = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const rules = await prisma.whatsAppAssignmentRule.findMany({
            where: { organisationId: orgId as string, isDeleted: false },
            include: {
                whatsappAccount: { select: { id: true, phoneNumber: true, displayName: true } },
                targetTeam: { select: { id: true, name: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const allUserIds = Array.from(new Set(rules.flatMap(r => r.assignedUserIds)));
        const users = allUserIds.length
            ? await prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
            : [];
        const userMap = new Map(users.map(u => [u.id, u]));

        res.json(rules.map(r => ({
            ...r,
            assignedUsers: r.assignedUserIds.map(id => userMap.get(id)).filter(Boolean)
        })));
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createWhatsAppAssignmentRule = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const { whatsappAccountId, distributionType, assignedUserIds, targetTeamId, isActive } = req.body;
        if (!whatsappAccountId) return res.status(400).json({ message: 'whatsappAccountId is required' });

        const account = await prisma.whatsAppAccount.findFirst({
            where: { id: whatsappAccountId, organisationId: orgId as string, isDeleted: false }
        });
        if (!account) return res.status(404).json({ message: 'WhatsApp account not found' });

        const rule = await prisma.whatsAppAssignmentRule.create({
            data: {
                organisationId: orgId as string,
                whatsappAccountId,
                distributionType: distributionType || 'specific_user',
                assignedUserIds: assignedUserIds || [],
                targetTeamId: targetTeamId || undefined,
                isActive: isActive ?? true,
                createdById: user.id
            }
        });

        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'CREATE_WHATSAPP_ASSIGNMENT_RULE',
                entity: 'WhatsAppAssignmentRule',
                entityId: rule.id,
                actorId: user.id,
                organisationId: orgId as string,
                details: { whatsappAccountId, distributionType: rule.distributionType }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.status(201).json(rule);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateWhatsAppAssignmentRule = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const existing = await prisma.whatsAppAssignmentRule.findFirst({
            where: { id: req.params.id, organisationId: orgId as string, isDeleted: false }
        });
        if (!existing) return res.status(404).json({ message: 'Assignment rule not found' });

        const { distributionType, assignedUserIds, targetTeamId, isActive } = req.body;

        const rule = await prisma.whatsAppAssignmentRule.update({
            where: { id: existing.id },
            data: {
                distributionType: distributionType ?? undefined,
                assignedUserIds: assignedUserIds ?? undefined,
                targetTeamId: targetTeamId === null ? null : (targetTeamId ?? undefined),
                isActive: isActive ?? undefined
            }
        });

        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'UPDATE_WHATSAPP_ASSIGNMENT_RULE',
                entity: 'WhatsAppAssignmentRule',
                entityId: rule.id,
                actorId: user.id,
                organisationId: orgId as string,
                details: { updatedFields: Object.keys(req.body) }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteWhatsAppAssignmentRule = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const existing = await prisma.whatsAppAssignmentRule.findFirst({
            where: { id: req.params.id, organisationId: orgId as string, isDeleted: false }
        });
        if (!existing) return res.status(404).json({ message: 'Assignment rule not found' });

        await prisma.whatsAppAssignmentRule.update({
            where: { id: existing.id },
            data: { isDeleted: true }
        });

        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'DELETE_WHATSAPP_ASSIGNMENT_RULE',
                entity: 'WhatsAppAssignmentRule',
                entityId: existing.id,
                actorId: user.id,
                organisationId: orgId as string,
                details: {}
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.json({ message: 'Assignment rule deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
