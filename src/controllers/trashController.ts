import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ResponseHandler as ApiResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { getOrgId } from '../utils/hierarchyUtils';
import { logAudit } from '../utils/auditLogger';

const prisma = new PrismaClient();

export const getTrashItems = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const organisationId = getOrgId(user);

    try {
        if (!organisationId) {
            return ApiResponse.forbidden(res, 'User not associated with an organisation');
        }

        // Fetch deleted items from all relevant models
        const [leads, contacts, accounts, opportunities, tasks, documents] = await Promise.all([
            prisma.lead.findMany({ where: { organisationId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }),
            prisma.contact.findMany({ where: { organisationId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }),
            prisma.account.findMany({ where: { organisationId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }),
            prisma.opportunity.findMany({ where: { organisationId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }),
            prisma.task.findMany({ where: { organisationId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }),
            prisma.document.findMany({ where: { organisationId, isDeleted: true }, orderBy: { deletedAt: 'desc' } })
        ]);

        const trashItems = [
            ...leads.map((item: any) => ({ ...item, type: 'Lead' })),
            ...contacts.map((item: any) => ({ ...item, type: 'Contact' })),
            ...accounts.map((item: any) => ({ ...item, type: 'Account' })),
            ...opportunities.map((item: any) => ({ ...item, type: 'Opportunity' })),
            ...tasks.map((item: any) => ({ ...item, type: 'Task' })),
            ...documents.map((item: any) => ({ ...item, type: 'Document' }))
        ].sort((a, b) => (b.deletedAt?.getTime() || 0) - (a.deletedAt?.getTime() || 0));

        return ApiResponse.success(res, trashItems, 'Trash items fetched successfully');
    } catch (error: any) {
        logger.apiError('GET', '/api/trash', error, user?.id, organisationId ?? undefined);
        return ApiResponse.serverError(res, 'Error fetching trash items');
    }
};

export const restoreItem = async (req: Request, res: Response) => {
    const { type, id } = req.body;
    const user = (req as any).user;
    const organisationId = getOrgId(user);

    try {
        if (!organisationId) {
            return ApiResponse.forbidden(res, 'User not associated with an organisation');
        }

        let result;
        const data = { isDeleted: false, deletedAt: null };

        switch (type) {
            case 'Lead':
                result = await prisma.lead.update({ where: { id, organisationId }, data });
                break;
            case 'Contact':
                result = await prisma.contact.update({ where: { id, organisationId }, data });
                break;
            case 'Account':
                result = await prisma.account.update({ where: { id, organisationId }, data });
                break;
            case 'Opportunity':
                result = await prisma.opportunity.update({ where: { id, organisationId }, data });
                break;
            case 'Task':
                result = await prisma.task.update({ where: { id, organisationId }, data });
                break;
            case 'Document':
                result = await prisma.document.update({ where: { id, organisationId }, data });
                break;
            default:
                return ApiResponse.validationError(res, 'Invalid item type');
        }

        await logAudit({
            organisationId,
            actorId: user.id,
            action: `RESTORE_${type.toUpperCase()}`,
            entity: type,
            entityId: id,
            details: { restoredBy: user.id }
        });

        return ApiResponse.success(res, result, `${type} restored successfully`);
    } catch (error: any) {
        logger.apiError('POST', '/api/trash/restore', error, user?.id, organisationId ?? undefined);
        return ApiResponse.serverError(res, `Error restoring ${type}`);
    }
};

export const permanentDelete = async (req: Request, res: Response) => {
    const { type, id } = req.body;
    const user = (req as any).user;
    const organisationId = getOrgId(user);

    try {
        if (!organisationId) {
            return ApiResponse.forbidden(res, 'User not associated with an organisation');
        }

        let result;
        switch (type) {
            case 'Lead':
                result = await prisma.lead.delete({ where: { id, organisationId } });
                break;
            case 'Contact':
                result = await prisma.contact.delete({ where: { id, organisationId } });
                break;
            case 'Account':
                result = await prisma.account.delete({ where: { id, organisationId } });
                break;
            case 'Opportunity':
                result = await prisma.opportunity.delete({ where: { id, organisationId } });
                break;
            case 'Task':
                result = await prisma.task.delete({ where: { id, organisationId } });
                break;
            case 'Document':
                result = await prisma.document.delete({ where: { id, organisationId } });
                break;
            default:
                return ApiResponse.validationError(res, 'Invalid item type');
        }

        await logAudit({
            organisationId,
            actorId: user.id,
            action: `PERMANENT_DELETE_${type.toUpperCase()}`,
            entity: type,
            entityId: id,
            details: { deletedBy: user.id }
        });

        return ApiResponse.success(res, result, `${type} permanently deleted`);
    } catch (error: any) {
        logger.apiError('DELETE', '/api/trash/permanent', error, user?.id, organisationId ?? undefined);
        return ApiResponse.serverError(res, `Error permanently deleting ${type}`);
    }
};
