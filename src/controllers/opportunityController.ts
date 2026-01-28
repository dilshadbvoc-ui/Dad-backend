import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

// GET /api/opportunities
export const getOpportunities = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '10');
        const skip = (page - 1) * limit;

        const user = (req as any).user;
        const where: Prisma.OpportunityWhereInput = {};

        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        } else {
            const orgId = getOrgId(user);
            if (orgId) where.organisationId = orgId;
        }

        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            // In Prisma: ownerId IN [...]
            where.ownerId = { in: subordinateIds };
        }

        // Add filters if needed (e.g. stage, etc.) based on query params if standard match Mongoose behavior which passed `query` directly sometimes?
        // Mongoose code had `const query: any = {}` and populated it manually.
        // It didn't seemingly blindly pass req.query to find()? 
        // Ah, checked code: it only set org and owner. 
        // But implicitly if Mongoose `find(query)` was used, maybe other params were assumed?
        // No, lines 16-25 constructed query.
        // So strict filtering.
        // I'll stick to strict.

        const count = await prisma.opportunity.count({ where });
        const opportunities = await prisma.opportunity.findMany({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            opportunities,
            page,
            totalPages: Math.ceil(count / limit),
            totalOpportunities: count
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// POST /api/opportunities
export const createOpportunity = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'Organisation context required' });

        const opportunityData: Prisma.OpportunityCreateInput = {
            name: req.body.name,
            amount: Number(req.body.amount),
            stage: req.body.stage,
            probability: req.body.probability,
            closeDate: req.body.closeDate,
            leadSource: req.body.leadSource,
            description: req.body.description,
            customFields: req.body.customFields,
            tags: req.body.tags,

            organisation: { connect: { id: orgId } },
            owner: { connect: { id: user.id } },

            // Account is required in schema
            account: { connect: { id: req.body.account } }
        };

        const opportunity = await prisma.opportunity.create({
            data: opportunityData
        });

        res.status(201).json(opportunity);

        // Webhook
        import('../services/WebhookService').then(({ WebhookService }) => {
            WebhookService.triggerEvent('opportunity.created', opportunity, orgId).catch(console.error);
        });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getOpportunityById = async (req: Request, res: Response) => {
    try {
        const opportunity = await prisma.opportunity.findUnique({
            where: { id: req.params.id },
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            }
        });

        if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });
        res.json(opportunity);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateOpportunity = async (req: Request, res: Response) => {
    try {
        const updates = { ...req.body };
        const oppId = req.params.id;

        // Handle Relation Updates
        if (updates.account && typeof updates.account === 'string') {
            updates.account = { connect: { id: updates.account } };
        }
        if (updates.owner && typeof updates.owner === 'string') {
            updates.owner = { connect: { id: updates.owner } };
        }

        const opportunity = await prisma.opportunity.update({
            where: { id: oppId },
            data: updates,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            }
        });

        // Trigger Sales Target Update when opportunity is closed won
        if ((req.body.stage === 'closed_won' || (opportunity.stage === 'closed_won' && req.body.amount)) && opportunity.ownerId) {
            import('../services/SalesTargetService').then(({ SalesTargetService }) => {
                SalesTargetService.updateProgressForUser(opportunity.ownerId!).catch(err => {
                    console.error('SalesTargetService error:', err);
                });
            }).catch(err => {
                console.error('Failed to load SalesTargetService:', err);
            });
        }

        res.json(opportunity);

        // Webhook
        import('../services/WebhookService').then(({ WebhookService }) => {
            WebhookService.triggerEvent('opportunity.updated', opportunity, opportunity.organisationId).catch(console.error);
        });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const deleteOpportunity = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const opportunityId = req.params.id;

        // 1. Role Check
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete opportunities' });
        }

        // 2. Org Check for Admins
        if (user.role === 'admin') {
            const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
            if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });

            const orgId = getOrgId(user);
            if (opportunity.organisationId !== orgId) {
                return res.status(403).json({ message: 'Not authorized to delete this opportunity' });
            }
        }

        await prisma.opportunity.delete({
            where: { id: opportunityId }
        });
        res.json({ message: 'Opportunity deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
