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

        const userWithoutPassword = { ...user } as any;
        delete userWithoutPassword.password;
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
        const updateData = { ...req.body };

        // DEBUG LOGGING
        if (updateData.profileImage) {
            console.log(`[ProfileController] updateUser called with profileImage: ${updateData.profileImage}`);
        } else {
            console.log(`[ProfileController] updateUser called without profileImage`);
        }

        delete updateData.password;
        delete updateData.email;

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        const userWithoutPassword = { ...user } as any;
        delete userWithoutPassword.password;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const changePassword = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Was accepting any string here, including empty/trivial ones —
        // registration enforces PasswordValidator (12+ chars, mixed case,
        // number, special char, no common sequences) via authController.ts,
        // but this endpoint let a user quietly downgrade to a weak password
        // any time after signup. Same check, same response shape (message +
        // errors + suggestions), so the mobile/web change-password forms can
        // render it identically to the signup form's validation.
        const { PasswordValidator } = await import('../utils/passwordValidator');
        const passwordValidation = PasswordValidator.validate(newPassword, [
            user.email || '',
            user.firstName || '',
            user.lastName || ''
        ]);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                message: 'Password does not meet security requirements',
                errors: passwordValidation.errors,
                suggestions: passwordValidation.suggestions
            });
        }

        if (newPassword === currentPassword) {
            return res.status(400).json({ message: 'New password must be different from your current password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword, tokenVersion: { increment: 1 } }
        });

        res.json({ message: 'Password updated successfully. Please log in again.' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
