
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getWebForms = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const webForms = await prisma.webForm.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(webForms);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createWebForm = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const webForm = await prisma.webForm.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(webForm);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateWebForm = async (req: Request, res: Response) => {
    try {
        const webForm = await prisma.webForm.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(webForm);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteWebForm = async (req: Request, res: Response) => {
    try {
        await prisma.webForm.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'WebForm deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
