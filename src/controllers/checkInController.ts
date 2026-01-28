import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getSubordinateIds, getOrgId } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

export const getCheckIns = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const date = req.query.date as string;
        const skip = (page - 1) * limit;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        const where: Prisma.CheckInWhereInput = { organisationId: orgId as string };

        // 1. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            where.userId = { in: [...subordinateIds, user.id] };
        }

        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            where.createdAt = { gte: startOfDay, lte: endOfDay };
        }

        const checkIns = await prisma.checkIn.findMany({
            where,
            include: {
                user: { select: { firstName: true, lastName: true, email: true } },
                lead: { select: { firstName: true, lastName: true, company: true } },
                contact: { select: { firstName: true, lastName: true } },
                account: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });

        const total = await prisma.checkIn.count({ where });

        res.json({
            checkIns: checkIns.map(c => ({
                ...c,
                // Map polymorphic relatedTo for frontend compatibility if needed, 
                // or frontend can adapt to specific fields. 
                // Legacy frontend likely expects `relatedTo` object.
                relatedTo: c.lead || c.contact || c.account || null,
                onModel: c.lead ? 'Lead' : c.contact ? 'Contact' : c.account ? 'Account' : null
            })),
            page,
            totalPages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        console.error('getCheckIns Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createCheckIn = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        const { type, location, relatedTo, onModel, notes, photoUrl } = req.body;

        const data: Prisma.CheckInCreateInput = {
            type,
            address: location?.address,
            latitude: location?.latitude,
            longitude: location?.longitude,
            notes,
            photoUrl,
            user: { connect: { id: user.id } },
            organisation: { connect: { id: orgId } }
        };

        // Handle Polymorphic Relation
        if (relatedTo && onModel) {
            if (onModel === 'Lead') data.lead = { connect: { id: relatedTo } };
            if (onModel === 'Contact') data.contact = { connect: { id: relatedTo } };
            if (onModel === 'Account') data.account = { connect: { id: relatedTo } };
        }

        const checkIn = await prisma.checkIn.create({
            data,
            include: { user: { select: { firstName: true, lastName: true } } }
        });

        res.status(201).json(checkIn);
    } catch (error) {
        console.error('createCheckIn Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};
