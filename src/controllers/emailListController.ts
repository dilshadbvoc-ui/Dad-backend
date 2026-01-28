import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getEmailLists = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(403).json({ message: 'User not associated with an organisation' });

        // Strict Organisation Scoping
        const where: any = {
            isDeleted: false,
            organisationId: orgId
        };
        // If super_admin allows override? 
        if (user.role === 'super_admin' && req.query.organisationId) {
            where.organisationId = String(req.query.organisationId);
        }

        const lists = await prisma.emailList.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json(lists);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createEmailList = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const list = await prisma.emailList.create({
            data: {
                name: req.body.name,
                description: req.body.description,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        res.status(201).json(list);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getEmailListById = async (req: Request, res: Response) => {
    try {
        const list = await prisma.emailList.findFirst({
            where: { id: req.params.id, isDeleted: false }
        });
        if (!list) return res.status(404).json({ message: 'List not found' });
        res.json(list);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteEmailList = async (req: Request, res: Response) => {
    try {
        await prisma.emailList.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'List deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
