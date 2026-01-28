import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getSubordinateIds, getOrgId } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

export const getCases = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const search = req.query.search as string;
        const status = req.query.status as string;
        const skip = (page - 1) * limit;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        const where: Prisma.CaseWhereInput = {
            organisationId: orgId,
            isDeleted: false
        };

        // 1. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            // Show cases assigned to self OR subordinates
            where.assignedToId = { in: [...subordinateIds, user.id] };
        }

        if (search) {
            where.OR = [
                { subject: { contains: search, mode: 'insensitive' } },
                { caseNumber: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (status && status !== 'all') {
            where.status = status;
        }

        const cases = await prisma.case.findMany({
            where,
            include: {
                contact: { select: { firstName: true, lastName: true, email: true } },
                account: { select: { name: true } },
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });

        const total = await prisma.case.count({ where });

        res.json({
            cases,
            page,
            totalPages: Math.ceil(total / limit),
            totalCases: total
        });
    } catch (error) {
        console.error('getCases Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createCase = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        // Generate case number
        const count = await prisma.case.count({ where: { organisationId: orgId } });
        const caseNumber = `CASE-${String(count + 1).padStart(5, '0')}`;

        const newCase = await prisma.case.create({
            data: {
                ...req.body,
                caseNumber,
                organisationId: orgId,
                createdById: user.id,
                // Ensure relations are connected properly if provided
                contactId: req.body.contact || req.body.contactId || undefined,
                accountId: req.body.account || req.body.accountId || undefined,
                assignedToId: req.body.assignedTo || req.body.assignedToId || undefined
            }
        });

        res.status(201).json(newCase);
    } catch (error) {
        console.error('createCase Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getCaseById = async (req: Request, res: Response) => {
    try {
        const supportCase = await prisma.case.findUnique({
            where: { id: req.params.id },
            include: {
                contact: true,
                account: true,
                assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
        });

        if (!supportCase || supportCase.isDeleted) {
            return res.status(404).json({ message: 'Case not found' });
        }

        res.json(supportCase);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateCase = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Handle relation updates if passed as objects or IDs
        if (updates.contact) updates.contactId = updates.contact;
        if (updates.account) updates.accountId = updates.account;
        if (updates.assignedTo) updates.assignedToId = updates.assignedTo;

        delete updates.contact; // Clean up
        delete updates.account;
        delete updates.assignedTo;

        const supportCase = await prisma.case.update({
            where: { id },
            data: updates
        });

        res.json(supportCase);
    } catch (error) {
        // P2025: Record not found
        if ((error as any).code === 'P2025') return res.status(404).json({ message: 'Case not found' });
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteCase = async (req: Request, res: Response) => {
    try {
        const supportCase = await prisma.case.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });

        res.json({ message: 'Case deleted' });
    } catch (error) {
        if ((error as any).code === 'P2025') return res.status(404).json({ message: 'Case not found' });
        res.status(500).json({ message: (error as Error).message });
    }
};
