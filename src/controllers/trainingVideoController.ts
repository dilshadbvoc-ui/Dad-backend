import { Request, Response } from 'express';
import prisma from '../config/prisma';

// Get active training videos for the in-app Training page (public — no org context needed)
export const getPublicTrainingVideos = async (req: Request, res: Response) => {
    try {
        const videos = await prisma.trainingVideo.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' }
        });
        res.json({ videos });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Get all training videos (SuperAdmin)
export const getAllTrainingVideos = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const videos = await prisma.trainingVideo.findMany({
            orderBy: { order: 'asc' }
        });
        res.json({ videos });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Create training video (SuperAdmin)
export const createTrainingVideo = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { title, description, videoUrl, thumbnailUrl, category, duration, order, isActive } = req.body;
        const video = await prisma.trainingVideo.create({
            data: {
                title,
                description,
                videoUrl,
                thumbnailUrl,
                category,
                duration,
                order: order || 0,
                isActive: isActive !== undefined ? isActive : true
            }
        });
        res.status(201).json(video);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Update training video (SuperAdmin)
export const updateTrainingVideo = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { id } = req.params;
        const { title, description, videoUrl, thumbnailUrl, category, duration, order, isActive } = req.body;

        const video = await prisma.trainingVideo.update({
            where: { id },
            data: {
                title,
                description,
                videoUrl,
                thumbnailUrl,
                category,
                duration,
                order,
                isActive
            }
        });
        res.json(video);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Delete training video (SuperAdmin)
export const deleteTrainingVideo = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { id } = req.params;
        await prisma.trainingVideo.delete({
            where: { id }
        });
        res.json({ message: 'Training video deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
