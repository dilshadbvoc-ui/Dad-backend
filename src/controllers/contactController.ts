import { Request, Response } from 'express';
import prisma from '../config/prisma'; // Use the configured instance with adapter
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils'; // Use existing utils
import { Prisma } from '../generated/client';

// GET /api/contacts
export const getContacts = async (req: Request, res: Response) => {
    try {
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = (req as any).user;
        const where: Prisma.ContactWhereInput = {};

        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        } else {
            const orgId = getOrgId(user);
            if (orgId) {
                where.organisationId = orgId;
            }
        }

        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            // In Prisma: ownerId IN [...]
            where.ownerId = { in: subordinateIds };
        }

        // Filter: Account
        if (req.query.account) {
            where.accountId = String(req.query.account);
        }

        // Filter: Search (OR condition)
        if (req.query.search) {
            const search = String(req.query.search);
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { jobTitle: { contains: search, mode: 'insensitive' } },
            ];
        }

        const count = await prisma.contact.count({ where });
        const contacts = await prisma.contact.findMany({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ contacts, page, pages: Math.ceil(count / pageSize), total: count });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// POST /api/contacts
export const createContact = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'Organisation context required' });

        if (email) {
            const existingContact = await prisma.contact.findFirst({
                where: {
                    email: email,
                    organisationId: orgId
                }
            });
            if (existingContact) {
                return res.status(409).json({ message: 'Contact with this email already exists' });
            }
        }

        const contactData: Prisma.ContactCreateInput = {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email,
            phones: req.body.phones,
            jobTitle: req.body.jobTitle,
            department: req.body.department,
            address: req.body.address,
            socialProfiles: req.body.socialProfiles,
            customFields: req.body.customFields,
            tags: req.body.tags,

            // Relations
            organisation: { connect: { id: orgId } },
            owner: req.body.owner ? { connect: { id: req.body.owner } } : { connect: { id: user.id } },
        };

        if (req.body.account) {
            // Can be accountId string
            contactData.account = { connect: { id: req.body.account } };
        }

        const contact = await prisma.contact.create({
            data: contactData
        });

        res.status(201).json(contact);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getContactById = async (req: Request, res: Response) => {
    try {
        const contact = await prisma.contact.findUnique({
            where: { id: req.params.id },
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
            }
        });

        if (!contact) return res.status(404).json({ message: 'Contact not found' });
        res.json(contact);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateContact = async (req: Request, res: Response) => {
    try {
        const updates = { ...req.body };
        const contactId = req.params.id;

        // Handle Relation Updates if IDs are passed as strings
        if (updates.account && typeof updates.account === 'string') {
            updates.account = { connect: { id: updates.account } };
        }
        if (updates.owner && typeof updates.owner === 'string') {
            updates.owner = { connect: { id: updates.owner } };
        }

        // Remove helper fields that might confusing Prisma if they are not in schema as scalars?
        // Actually Prisma update accepts `account: { connect: ... }`. 
        // If updates.account is "ID_STRING", passing it as `account: "ID_STRING"` to Prisma Update will fail.
        // So the remapping above is correct.

        const contact = await prisma.contact.update({
            where: { id: contactId },
            data: updates,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
            }
        });

        res.json(contact);
    } catch (error) {
        // Prisma error handling (e.g. RecordNotFound)
        res.status(400).json({ message: (error as Error).message });
    }
};

export const deleteContact = async (req: Request, res: Response) => {
    try {
        await prisma.contact.delete({
            where: { id: req.params.id }
        });
        res.json({ message: 'Contact deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
