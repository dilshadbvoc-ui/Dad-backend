import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

// GET /api/accounts
export const getAccounts = async (req: Request, res: Response) => {
    try {
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = (req as any).user;
        const where: Prisma.AccountWhereInput = {};

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

        // Filters
        if (req.query.type) where.type = String(req.query.type);
        if (req.query.industry) where.industry = String(req.query.industry);

        // Search
        if (req.query.search) {
            const search = String(req.query.search);
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { website: { contains: search, mode: 'insensitive' } },
                // JSON filtering for City (best effort for Prisma+PG)
                { address: { path: ['city'], string_contains: search } }
            ];
        }

        const count = await prisma.account.count({ where });
        const accounts = await prisma.account.findMany({
            where,
            include: {
                owner: { select: { firstName: true, lastName: true, email: true } }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ accounts, page, pages: Math.ceil(count / pageSize), total: count });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// POST /api/accounts
export const createAccount = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'Organisation context required' });

        const accountData: Prisma.AccountCreateInput = {
            name: req.body.name,
            industry: req.body.industry,
            website: req.body.website,
            size: req.body.size,
            annualRevenue: req.body.annualRevenue,
            address: req.body.address,
            phone: req.body.phone,
            type: req.body.type || 'prospect',
            customFields: req.body.customFields,
            tags: req.body.tags,

            organisation: { connect: { id: orgId } },
            owner: req.body.owner ? { connect: { id: req.body.owner } } : { connect: { id: user.id } },
        };

        const account = await prisma.account.create({
            data: accountData
        });

        res.status(201).json(account);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getAccountById = async (req: Request, res: Response) => {
    try {
        const account = await prisma.account.findUnique({
            where: { id: req.params.id },
            include: {
                owner: { select: { firstName: true, lastName: true, email: true } },
                contacts: { select: { id: true, firstName: true, lastName: true, email: true } },
                opportunities: { select: { id: true, name: true, amount: true, stage: true } }
            }
        });

        if (!account) return res.status(404).json({ message: 'Account not found' });
        res.json(account);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateAccount = async (req: Request, res: Response) => {
    try {
        const updates = { ...req.body };
        const accountId = req.params.id;

        if (updates.owner && typeof updates.owner === 'string') {
            updates.owner = { connect: { id: updates.owner } };
        }

        const account = await prisma.account.update({
            where: { id: accountId },
            data: updates,
            include: {
                owner: { select: { firstName: true, lastName: true, email: true } }
            }
        });

        res.json(account);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const deleteAccount = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const accountId = req.params.id;

        // 1. Role Check
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete accounts' });
        }

        // 2. Org Check for Admins
        if (user.role === 'admin') {
            const account = await prisma.account.findUnique({ where: { id: accountId } });
            if (!account) return res.status(404).json({ message: 'Account not found' });

            const orgId = getOrgId(user);
            if (account.organisationId !== orgId) {
                return res.status(403).json({ message: 'Not authorized to delete this account' });
            }
        }

        await prisma.account.delete({
            where: { id: accountId }
        });
        res.json({ message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
