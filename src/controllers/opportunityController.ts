import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';
import { NotificationService } from '../services/notificationService';

// GET /api/opportunities
export const getOpportunities = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '10');
        const skip = (page - 1) * limit;

        const user = (req as any).user;
        const where: Prisma.OpportunityWhereInput = { isDeleted: false };

        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        } else {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId) where.branchId = user.branchId;
        }

        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            // In Prisma: ownerId IN [...]
            where.ownerId = { in: [...subordinateIds, user.id] };
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
                owner: { select: { firstName: true, lastName: true, profileImage: true } },
                emiSchedule: { select: { id: true, status: true } }
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

        // Validate required fields
        if (!req.body.account) {
            return res.status(400).json({ message: 'Account is required to create an opportunity' });
        }

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
            type: req.body.type || 'NEW_BUSINESS', // Default

            organisation: { connect: { id: orgId } },
            owner: { connect: { id: user.id } },
            branch: user.branchId ? { connect: { id: user.branchId } } : (req.body.branchId ? { connect: { id: req.body.branchId } } : undefined),

            // Account is required in schema
            account: { connect: { id: req.body.account } }
        };

        // Custom Field Validation
        if (req.body.customFields) {
            const { CustomFieldValidationService } = await import('../services/customFieldValidationService');
            await CustomFieldValidationService.validateFields('Opportunity', orgId, req.body.customFields);
        }

        const opportunity = await prisma.opportunity.create({
            data: opportunityData
        });

        // Audit Log
        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'CREATE_OPPORTUNITY',
                entity: 'Opportunity',
                entityId: opportunity.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: opportunity.name, amount: opportunity.amount, type: opportunity.type }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.status(201).json(opportunity);

        // Webhook
        import('../services/webhookService').then(({ WebhookService }) => {
            WebhookService.triggerEvent('opportunity.created', opportunity, orgId).catch(console.error);
        });

        // Trigger Sales Target Update if created as closed_won
        if (opportunity.stage === 'closed_won' && opportunity.ownerId) {
            // New logic for payment and EMI
            const { paymentType, paidAmount, installments } = req.body;
            const oppId = opportunity.id;

            if (paymentType === 'paid') {
                import('../services/paymentService').then(m => m.default.recordFullPayment(oppId, user.id, orgId));
            } else if (paymentType === 'partial') {
                import('../services/paymentService').then(async m => {
                    if (paidAmount > 0) {
                        await m.default.recordPartialPayment(oppId, paidAmount, user.id, orgId);
                    }
                    if (installments && installments.length > 0) {
                        const { default: EMIService } = await import('../services/emiService');
                        await EMIService.convertToEMI(oppId, installments, orgId);
                    }
                });
            } else if (paymentType === 'emi') {
                (async () => {
                    try {
                        // First update payment status
                        await prisma.opportunity.update({
                            where: { id: oppId },
                            data: { paymentStatus: 'partial' }
                        });
                        
                        // Then convert to EMI
                        if (installments && installments.length > 0) {
                            const { default: EMIService } = await import('../services/emiService');
                            await EMIService.convertToEMI(oppId, installments, orgId);
                        }
                    } catch (error) {
                        console.error('Error in EMI conversion:', error);
                    }
                })();
            }

            import('../services/salesTargetService').then(({ SalesTargetService }) => {
                SalesTargetService.updateProgressForUser(opportunity.ownerId!).catch(console.error);
            });
            import('../services/goalService').then(({ GoalService }) => {
                GoalService.updateProgressForUser(opportunity.ownerId!, 'revenue').catch(console.error);
            });

            // Meta Conversion API: Purchase
            if (req.body.amount && opportunity.amount > 0) {
                import('../services/metaConversionService').then(({ MetaConversionService }) => {
                    MetaConversionService.sendEvent(orgId, {
                        eventName: 'Purchase',
                        userData: { externalId: user.id },
                        customData: {
                            value: opportunity.amount,
                            currency: 'INR',
                            contentName: opportunity.name
                        }
                    }).catch(console.error);
                });
            }

            // Hierarchy Notification on Sale Closure with Payment
            try {
                const { paymentType, paidAmount } = req.body;
                
                // Only send notification if payment is recorded
                if (paymentType && (paymentType === 'paid' || paymentType === 'partial' || paymentType === 'emi')) {
                    const owner = await prisma.user.findUnique({
                        where: { id: opportunity.ownerId! },
                        select: { reportsToId: true, firstName: true, lastName: true }
                    });

                    if (owner && owner.reportsToId) {
                        let paymentMessage = '';
                        if (paymentType === 'paid') {
                            paymentMessage = `Full payment of ₹${opportunity.amount.toLocaleString('en-IN')} received.`;
                        } else if (paymentType === 'partial') {
                            paymentMessage = `Partial payment of ₹${paidAmount?.toLocaleString('en-IN')} received (Total: ₹${opportunity.amount.toLocaleString('en-IN')}).`;
                        } else if (paymentType === 'emi') {
                            paymentMessage = `EMI payment plan initiated for ₹${opportunity.amount.toLocaleString('en-IN')}.`;
                        }

                        await NotificationService.sendToHierarchy(
                            opportunity.ownerId!,
                            'Sale Closed with Payment! 🎉💰',
                            `${owner.firstName} ${owner.lastName} closed a deal "${opportunity.name}". ${paymentMessage}`,
                            'success'
                        );
                    }
                }
            } catch (notifyErr) {
                console.error('Hierarchy notification error:', notifyErr);
            }
        }
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getOpportunityById = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        const where: any = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId) where.branchId = user.branchId;
        }

        const opportunity = await prisma.opportunity.findFirst({
            where,
            include: {
                account: {
                    select: {
                        name: true,
                        accountProducts: {
                            include: {
                                product: true
                            },
                            orderBy: {
                                createdAt: 'desc'
                            }
                        }
                    }
                },
                owner: { select: { firstName: true, lastName: true, profileImage: true, email: true } },
                contacts: true,
                lead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        assignedTo: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                profileImage: true,
                                email: true
                            }
                        }
                    }
                },
                emiSchedule: {
                    include: {
                        installments: {
                            orderBy: { installmentNumber: 'asc' }
                        }
                    }
                },
                paymentRecords: {
                    orderBy: { paymentDate: 'desc' }
                }
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

        // Extract payment-related fields that are not part of the Opportunity model
        const { paymentType, paidAmount, installments, ...opportunityUpdates } = updates;

        // Handle Relation Updates
        if (opportunityUpdates.account && typeof opportunityUpdates.account === 'string') {
            opportunityUpdates.account = { connect: { id: opportunityUpdates.account } };
        }
        if (opportunityUpdates.owner && typeof opportunityUpdates.owner === 'string') {
            opportunityUpdates.owner = { connect: { id: opportunityUpdates.owner } };
        }

        // Fetch first for validation and existence
        const currentOpp = await prisma.opportunity.findUnique({ where: { id: oppId } });
        if (!currentOpp) return res.status(404).json({ message: 'Opportunity not found' });

        if (opportunityUpdates.customFields) {
            const { CustomFieldValidationService } = await import('../services/customFieldValidationService');
            await CustomFieldValidationService.validateFields('Opportunity', currentOpp.organisationId, opportunityUpdates.customFields);
        }

        const requester = (req as any).user;
        const whereObj: any = { id: oppId };
        if (requester.role !== 'super_admin') {
            const orgId = getOrgId(requester);
            if (!orgId) return res.status(403).json({ message: 'No org' });
            whereObj.organisationId = orgId;
            if (requester.branchId) whereObj.branchId = requester.branchId;
        }

        const opportunity = await prisma.opportunity.update({
            where: whereObj,
            data: opportunityUpdates,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, profileImage: true } }
            }
        });

        // Audit Log
        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'UPDATE_OPPORTUNITY',
                entity: 'Opportunity',
                entityId: oppId,
                actorId: requester.id,
                organisationId: opportunity.organisationId,
                details: { name: opportunity.name, updatedFields: Object.keys(updates) }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        // Trigger Sales Target Update when opportunity is closed won
        if ((req.body.stage === 'closed_won' || (opportunity.stage === 'closed_won' && req.body.amount)) && opportunity.ownerId) {
            // New logic for payment and EMI
            const { paymentType, paidAmount, installments } = req.body;
            const orgId = opportunity.organisationId;

            if (paymentType === 'paid') {
                import('../services/paymentService').then(m => m.default.recordFullPayment(oppId, requester.id, orgId));
            } else if (paymentType === 'partial') {
                import('../services/paymentService').then(async m => {
                    if (paidAmount > 0) {
                        await m.default.recordPartialPayment(oppId, paidAmount, requester.id, orgId);
                    }
                    if (installments && installments.length > 0) {
                        const { default: EMIService } = await import('../services/emiService');
                        await EMIService.convertToEMI(oppId, installments, orgId);
                    }
                });
            } else if (paymentType === 'emi') {
                (async () => {
                    try {
                        // First update payment status
                        await prisma.opportunity.update({
                            where: { id: oppId },
                            data: { paymentStatus: 'partial' }
                        });
                        
                        // Then convert to EMI
                        if (installments && installments.length > 0) {
                            const { default: EMIService } = await import('../services/emiService');
                            await EMIService.convertToEMI(oppId, installments, orgId);
                        }
                    } catch (error) {
                        console.error('Error in EMI conversion:', error);
                    }
                })();
            }

            import('../services/salesTargetService').then(({ SalesTargetService }) => {
                SalesTargetService.updateProgressForUser(opportunity.ownerId!).catch(err => {
                    console.error('SalesTargetService error:', err);
                });
            }).catch(err => {
                console.error('Failed to load SalesTargetService:', err);
            });

            // Goal Automation
            import('../services/goalService').then(({ GoalService }) => {
                GoalService.updateProgressForUser(opportunity.ownerId!, 'revenue').catch(console.error);
            });

            // Meta Conversion API: Purchase
            if (req.body.amount && opportunity.amount > 0) {
                import('../services/metaConversionService').then(async ({ MetaConversionService }) => {
                    const oppWithContact = await prisma.opportunity.findUnique({
                        where: { id: oppId },
                        include: {
                            contacts: { take: 1 }
                        }
                    });

                    if (oppWithContact && oppWithContact.contacts.length > 0) {
                        const contact = oppWithContact.contacts[0];
                        const phone = (contact.phones as any)?.mobile || (contact.phones as any)?.work || '';

                        MetaConversionService.sendEvent(opportunity.organisationId, {
                            eventName: 'Purchase',
                            userData: {
                                email: contact.email,
                                phone: phone,
                                firstName: contact.firstName,
                                lastName: contact.lastName,
                                externalId: contact.id
                            },
                            customData: {
                                value: opportunity.amount,
                                currency: 'USD',
                                contentName: opportunity.name
                            },
                            actionSource: 'system_generated'
                        }).catch(console.error);
                    }
                });
            }

            // Hierarchy Notification on Sale Closure with Payment
            try {
                const { paymentType, paidAmount } = req.body;
                
                // Only send notification if payment is recorded
                if (paymentType && (paymentType === 'paid' || paymentType === 'partial' || paymentType === 'emi')) {
                    const owner = await prisma.user.findUnique({
                        where: { id: opportunity.ownerId! },
                        select: { reportsToId: true, firstName: true, lastName: true }
                    });

                    if (owner && owner.reportsToId) {
                        let paymentMessage = '';
                        if (paymentType === 'paid') {
                            paymentMessage = `Full payment of ₹${opportunity.amount.toLocaleString('en-IN')} received.`;
                        } else if (paymentType === 'partial') {
                            paymentMessage = `Partial payment of ₹${paidAmount?.toLocaleString('en-IN')} received (Total: ₹${opportunity.amount.toLocaleString('en-IN')}).`;
                        } else if (paymentType === 'emi') {
                            paymentMessage = `EMI payment plan initiated for ₹${opportunity.amount.toLocaleString('en-IN')}.`;
                        }

                        await NotificationService.sendToHierarchy(
                            opportunity.ownerId!,
                            'Sale Closed with Payment! 🎉💰',
                            `${owner.firstName} ${owner.lastName} closed a deal "${opportunity.name}". ${paymentMessage}`,
                            'success'
                        );
                    }
                }
            } catch (notifyErr) {
                console.error('Hierarchy notification error:', notifyErr);
            }
        }

        if (updates.stage && updates.stage !== currentOpp.stage) {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'OPPORTUNITY_STAGE_CHANGE',
                entity: 'Opportunity',
                entityId: oppId,
                actorId: requester.id,
                organisationId: currentOpp.organisationId,
                details: { oldStage: currentOpp.stage, newStage: updates.stage }
            });
        }

        res.json(opportunity);

        // Webhook
        import('../services/webhookService').then(({ WebhookService }) => {
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
        const orgId = getOrgId(user);

        // 1. Role Check
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete opportunities' });
        }

        const where: any = { id: opportunityId };
        if (user.role !== 'super_admin') {
            if (!orgId) return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
            if (user.branchId) where.branchId = user.branchId;
        }

        const opportunity = await prisma.opportunity.findFirst({ where });
        if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });

        await prisma.opportunity.update({
            where: { id: opportunityId },
            data: { isDeleted: true }
        });

        // Audit Log
        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'DELETE_OPPORTUNITY',
                entity: 'Opportunity',
                entityId: opportunityId,
                actorId: user.id,
                organisationId: opportunity.organisationId,
                details: { name: opportunity.name }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.json({ message: 'Opportunity deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
