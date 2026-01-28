
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getCommissions = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const commissions = await prisma.commission.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(commissions);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createCommission = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const commission = await prisma.commission.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(commission);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateCommission = async (req: Request, res: Response) => {
    try {
        const commission = await prisma.commission.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(commission);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteCommission = async (req: Request, res: Response) => {
    try {
        await prisma.commission.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Commission deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
