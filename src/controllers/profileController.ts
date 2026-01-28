import { Request, Response } from 'express';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';

export const getProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { organisation: true }
        });

        if (!user) return res.status(404).json({ message: 'User not found' });

        const { password, ...userWithoutPassword } = user;
        res.json({
            ...userWithoutPassword,
            role: { id: user.role, name: user.role } // Transform for frontend
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { password, email, ...updateData } = req.body;

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        const { password: pwd, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const changePassword = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { currentPassword, newPassword } = req.body;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
