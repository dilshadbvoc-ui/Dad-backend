import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
// import { DistributionService } from '../services/DistributionService'; // Disabled for Phase 1
// import { WorkflowEngine } from '../services/WorkflowEngine'; // Disabled for Phase 1
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

        // DISABLE Distribution & Workflow for Phase 1 Migration
        // DistributionService uses Mongoose models (AssignmentRule), incompatible until migrated.
        console.warn('DistributionService and WorkflowEngine skipped in Phase 1 Migration');

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

            // Remap for Prisma
            updates.assignedTo = { connect: { id: targetUserId } };
            delete updates.assignedToId; // Clean up
        }

        const lead = await prisma.lead.update({
            where: { id: leadId },
            data: updates
        });

        res.json(lead);
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

        const result = await prisma.lead.createMany({
            data: leadsToInsert,
            skipDuplicates: true // similar to ordered: false logic broadly? No, skips unique constraint errors
        });

        res.status(201).json({
            message: `Successfully imported leads`,
            count: result.count
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
    res.status(501).json({
        message: 'Lead Conversion is temporarily disabled during Database Migration (Phase 1). Please contact admin.'
    });
};
