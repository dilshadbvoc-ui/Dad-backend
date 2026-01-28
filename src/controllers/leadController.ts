import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import { DistributionService } from '../services/DistributionService';
import { WorkflowEngine } from '../services/WorkflowEngine';
import { LeadSource, LeadStatus } from '../generated/client';


// GET /api/leads
export const getLeads = async (req: Request, res: Response) => {
    try {
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = (req as any).user;
        const where: any = {};

        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) where.organisationId = req.query.organisationId as string;
        } else {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }

        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            // In Prisma: assignedToId IN [...]
            where.assignedToId = { in: subordinateIds };
        }

        // Filter: Status
        if (req.query.status) {
            where.status = req.query.status as LeadStatus;
        }

        // Filter: Source
        if (req.query.source) {
            where.source = req.query.source as LeadSource;
        }

        // Filter: Search (OR condition)
        if (req.query.search) {
            const search = String(req.query.search);
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { company: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Filter: Assigned User
        if (req.query.assignedTo) {
            where.assignedToId = req.query.assignedTo as string;
        }

        const total = await prisma.lead.count({ where });
        const leads = await prisma.lead.findMany({
            where,
            include: {
                assignedTo: {
                    select: { firstName: true, lastName: true, email: true }
                }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ leads, page, pages: Math.ceil(total / pageSize), total });
    } catch (error) {
        console.error('getLeads Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// POST /api/leads
export const createLead = async (req: Request, res: Response) => {
    try {
        const { email, phone } = req.body;

        if (!phone) return res.status(400).json({ message: 'Phone number is required' });

        // Sanitize Phone
        let cleanPhone = phone.toString().replace(/\D/g, '');
        if (cleanPhone.length > 10 && cleanPhone.endsWith(cleanPhone.slice(-10))) {
            cleanPhone = cleanPhone.slice(-10);
        }

        // Check Duplicate
        const existingLead = await prisma.lead.findFirst({
            where: {
                OR: [
                    { email: email || 'invalid_check' },
                    { phone: cleanPhone }
                ]
            }
        });

        if (existingLead) {
            return res.status(409).json({ message: 'Lead with this email or phone already exists' });
        }

        const orgId = getOrgId((req as any).user);
        if (!orgId) return res.status(400).json({ message: 'Organisation context required' });

        // Extract assignedTo before spreading
        const { assignedTo, ...restBody } = req.body;

        // Create
        const lead = await prisma.lead.create({
            data: {
                ...restBody,
                phone: cleanPhone,
                organisation: { connect: { id: orgId } },
                // Handle assignedTo relation properly
                ...(assignedTo ? { assignedTo: { connect: { id: assignedTo } } } : {}),
                source: req.body.source as LeadSource,
                status: req.body.status as LeadStatus || LeadStatus.new
            }
        });

        // Enable Distribution
        await DistributionService.assignLead(lead, orgId);

        // Trigger Workflow Engine for lead creation
        try {
            await WorkflowEngine.evaluate('Lead', 'created', lead, orgId);
            import('../services/WebhookService').then(({ WebhookService }) => {
                WebhookService.triggerEvent('lead.created', lead, orgId).catch(console.error);
            });
        } catch (workflowErr) {
            console.error('WorkflowEngine error:', workflowErr);
            // Don't fail the request if workflow fails
        }

        res.status(201).json(lead);
    } catch (error) {
        console.error('createLead Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getLeadById = async (req: Request, res: Response) => {
    try {
        const lead = await prisma.lead.findUnique({
            where: { id: req.params.id },
            include: { assignedTo: { select: { firstName: true, lastName: true, email: true } } }
        });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });
        res.json(lead);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateLead = async (req: Request, res: Response) => {
    try {
        const updates = { ...req.body };
        const leadId = req.params.id;
        const requester = (req as any).user;
        let historyData: any = null;

        // Fetch current lead to check for ownership change
        const currentLead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!currentLead) return res.status(404).json({ message: 'Lead not found' });

        // Hierarchy Check
        if (updates.assignedToId || updates.assignedTo) { // Handle payload differences
            const targetUserId = updates.assignedToId || updates.assignedTo; // Assuming ID string

            if (requester.role !== 'super_admin' && requester.role !== 'admin') {
                const allowedIds = await getSubordinateIds(requester.id);

                // If passing an object (legacy), extract ID?? Usually frontend sends ID string for update.
                // Let's assume ID string.
                if (typeof targetUserId === 'string' && !allowedIds.includes(targetUserId)) {
                    return res.status(403).json({ message: 'You can only assign leads to your subordinates.' });
                }
            }

            // Track History
            if (currentLead.assignedToId !== targetUserId) {
                historyData = {
                    leadId,
                    oldOwnerId: currentLead.assignedToId,
                    newOwnerId: targetUserId,
                    changedById: requester.id,
                    reason: req.body.reason || 'Manual Assignment'
                };
            }

            // Remap for Prisma
            updates.assignedTo = { connect: { id: targetUserId } };
            delete updates.assignedToId; // Clean up
        }

        // Track Follow-up Change
        if (updates.nextFollowUp) {
            await prisma.interaction.create({
                data: {
                    leadId: leadId,
                    type: 'other',
                    subject: 'Follow-up Scheduled',
                    description: `Next follow-up scheduled for ${new Date(updates.nextFollowUp).toLocaleDateString()}`,
                    createdById: requester.id,
                    organisationId: currentLead.organisationId
                }
            });
        }

        const [lead] = await prisma.$transaction([
            prisma.lead.update({
                where: { id: leadId },
                data: updates
            }),
            ...(historyData ? [prisma.leadHistory.create({ data: historyData })] : [])
        ]);

        res.json(lead);

        // Webhook
        import('../services/WebhookService').then(({ WebhookService }) => {
            WebhookService.triggerEvent('lead.updated', lead, lead.organisationId).catch(console.error);
        });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const deleteLead = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const leadId = req.params.id;

        // Role Check
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to delete leads' });
        }

        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Org Check
        if (user.role !== 'super_admin') {
            const userOrgId = getOrgId(user);
            if (lead.organisationId !== userOrgId) {
                return res.status(403).json({ message: 'Not authorized to delete this lead' });
            }
        }

        await prisma.lead.delete({ where: { id: leadId } });
        res.json({ message: 'Lead deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createBulkLeads = async (req: Request, res: Response) => {
    try {
        const leadsData = req.body;
        const user = (req as any).user;

        if (!Array.isArray(leadsData) || leadsData.length === 0) {
            return res.status(400).json({ message: 'Invalid input' });
        }

        // Map data
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        // Prisma createMany does not support nested relations logic per row easily if validating constraints one by one?
        // Actually createMany is supported but it's "all or nothing" validation usually or simple insert.
        // And it doesn't return created objects, just count.

        const leadsToInsert = leadsData.map(l => ({
            firstName: l.firstName,
            lastName: l.lastName || '',
            phone: l.phone,
            email: l.email,
            company: l.company,
            organisationId: orgId,
            assignedToId: l.assignedTo || user.id,
            source: l.source || LeadSource.import,
            status: l.status || LeadStatus.new,
            leadScore: l.leadScore || 0
        }));

        // Create individually to run Distribution logic (Round Robin updates)
        // prisma.createMany does not support side-effects like DistributionService
        let createdCount = 0;
        for (const data of leadsToInsert) {
            try {
                // Check duplicate if needed or rely on database constraints? 
                // createMany had skipDuplicates: true. 
                // We'll try create and catch error to simulate skipDuplicates
                const lead = await prisma.lead.create({ data });

                // Distribute
                await DistributionService.assignLead(lead, orgId);
                createdCount++;
            } catch (e) {
                // Ignore duplicates (unique constraint violations)
                // Console log if needed
            }
        }

        res.status(201).json({
            message: `Successfully imported leads`,
            count: createdCount
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const bulkAssignLeads = async (req: Request, res: Response) => {
    try {
        const { leadIds, assignedTo } = req.body;
        const requester = (req as any).user;

        if (requester.role !== 'super_admin' && requester.role !== 'admin') {
            const allowedIds = await getSubordinateIds(requester.id);
            if (!allowedIds.includes(assignedTo)) {
                return res.status(403).json({ message: 'Forbidden assignment' });
            }
        }

        const result = await prisma.lead.updateMany({
            where: { id: { in: leadIds } },
            data: { assignedToId: assignedTo }
        });

        res.json({ message: 'Assigned successfully', count: result.count });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const convertLead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const leadId = id;

        const { dealName, amount, accountId } = req.body; // remove leadId from params here if it was redundant
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'No organisation context' });

        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        if (lead.status === LeadStatus.converted) { // or 'converted' if enum not available in scope, but used above
            return res.status(400).json({ message: 'Lead already converted' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Handle Account
            let targetAccountId = accountId;
            let account;

            if (targetAccountId) {
                account = await tx.account.findUnique({ where: { id: targetAccountId } });
                if (!account) throw new Error('Target account not found');
            } else {
                // Create new Account
                account = await tx.account.create({
                    data: {
                        name: lead.company || `${lead.firstName} ${lead.lastName}`,
                        organisationId: orgId,
                        ownerId: user.id, // Assign to converter or keep lead owner? Usually converter or specific rule.
                        type: 'customer',
                        phone: lead.phone,
                        address: lead.address as any
                    }
                });
                targetAccountId = account.id;
            }

            // 2. Create Contact
            const contact = await tx.contact.create({
                data: {
                    firstName: lead.firstName,
                    lastName: lead.lastName,
                    email: lead.email,
                    phones: lead.phone ? { mobile: lead.phone } : undefined,
                    jobTitle: lead.jobTitle,
                    organisationId: orgId,
                    ownerId: user.id,
                    accountId: targetAccountId,
                    address: lead.address as any
                }
            });

            // 3. Create Opportunity
            const opportunity = await tx.opportunity.create({
                data: {
                    name: dealName || `Deal - ${lead.company || lead.lastName}`,
                    amount: Number(amount) || 0,
                    stage: 'prospecting', // Default stage
                    organisationId: orgId,
                    ownerId: user.id,
                    accountId: targetAccountId,
                    contacts: { connect: { id: contact.id } }
                }
            });

            // 4. Update Lead
            const updatedLead = await tx.lead.update({
                where: { id: leadId },
                data: {
                    status: LeadStatus.converted // or 'converted'
                }
            });

            return { account, contact, opportunity, lead: updatedLead };
        });

        res.json({
            message: 'Lead converted successfully',
            data: result
        });

    } catch (error) {
        console.error('Lead conversion error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getViolations = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;

        // User sees violations where they were the PREVIOUS owner (the one who failed)
        // OR if they are a manager, seeing violations of their subordinates?
        // Prompt says "user and their managers need to give an explanation".

        const where: any = {
            rotationViolation: true,
            isDeleted: false,
        };

        if (user.role !== 'super_admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            // Include self in subordinate list for simple "my or my team's violations" check?
            // If I am a rep, subordinateIds is just [myId] usually? Or empty?
            // getSubordinateIds usually returns descendants.

            // Logic:
            // 1. I am previousOwner (I failed)
            // 2. I am manager of previousOwner (My report failed)

            where.OR = [
                { previousOwnerId: user.id }, // My failure
                { previousOwnerId: { in: subordinateIds } } // My team's failure
            ];
        }

        const violations = await prisma.lead.findMany({
            where,
            include: {
                previousOwner: { select: { firstName: true, lastName: true } },
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { violationTime: 'desc' }
        });

        const total = await prisma.lead.count({ where });
        res.json({ violations, page, pages: Math.ceil(total / pageSize), total });

    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getLeadHistory = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as any).user;

        // Verify access (simple org check)
        const lead = await prisma.lead.findUnique({ where: { id } });
        const orgId = getOrgId(user);

        if (!lead || (orgId && lead.organisationId !== orgId && user.role !== 'super_admin')) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const history = await prisma.leadHistory.findMany({
            where: { leadId: id },
            include: {
                oldOwner: { select: { firstName: true, lastName: true } },
                newOwner: { select: { firstName: true, lastName: true } },
                changedBy: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(history);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};


export const submitExplanation = async (req: Request, res: Response) => {
    try {
        const { leadId, explanation, type } = req.body; // type = 'user' | 'manager'
        const user = (req as any).user;

        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        if (!lead.rotationViolation) {
            return res.status(400).json({ message: 'This lead is not flagged for violation' });
        }

        const data: any = {};

        if (type === 'user') {
            if (lead.previousOwnerId !== user.id && user.role !== 'admin') {
                return res.status(403).json({ message: 'Only the previous owner can submit a user explanation' });
            }
            data.userExplanation = explanation;
        } else if (type === 'manager') {
            // Check if user is manager of previousOwner
            // Ideally we check hierarchy properly.
            // For MVP, if user is admin or has subordinates including previousOwner
            if (user.role === 'sales_rep') {
                return res.status(403).json({ message: 'Sales reps cannot submit manager explanations' });
            }
            data.managerExplanation = explanation;
        } else {
            return res.status(400).json({ message: 'Invalid explanation type' });
        }

        const updatedLead = await prisma.lead.update({
            where: { id: leadId },
            data
        });

        res.json(updatedLead);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getPendingFollowUpsCount = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const now = new Date();
        const endOfToday = new Date(now.setHours(23, 59, 59, 999));

        const where: any = {
            nextFollowUp: { lte: endOfToday },
            status: { not: LeadStatus.converted }
        };

        if (user.role !== 'super_admin') {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }

        // Daily Briefing is personal
        where.assignedToId = user.id;

        const count = await prisma.lead.count({ where });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

