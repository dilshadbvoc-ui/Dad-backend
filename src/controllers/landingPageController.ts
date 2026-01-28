
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getLandingPages = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const pages = await prisma.landingPage.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(pages);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createLandingPage = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const page = await prisma.landingPage.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(page);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateLandingPage = async (req: Request, res: Response) => {
    try {
        const page = await prisma.landingPage.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(page);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteLandingPage = async (req: Request, res: Response) => {
    try {
        await prisma.landingPage.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Landing Page deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
