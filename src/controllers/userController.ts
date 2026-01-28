import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { UserRole } from '../generated/client';

// GET /api/users/:id/stats - Get user performance stats
export const getUserStats = async (req: Request, res: Response) => {
    try {
        const userId = req.params.id;
        const currentUser = (req as any).user;

        // Security: Check if user can view target user stats (Admin or Self or Manager)
        if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin' && currentUser.id !== userId) {
            // Check if manager
            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            if (targetUser?.reportsToId !== currentUser.id) {
                return res.status(403).json({ message: 'Not authorized to view stats' });
            }
        }

        // 1. Total Leads Owned
        const totalLeads = await prisma.lead.count({
            where: { assignedToId: userId, isDeleted: false }
        });

        // 2. Leads Converted (Won)
        const convertedLeads = await prisma.lead.count({
            where: { assignedToId: userId, status: 'converted', isDeleted: false }
        });

        // 3. Leads Lost
        const lostLeads = await prisma.lead.count({
            where: { assignedToId: userId, status: 'lost', isDeleted: false }
        });

        // 4. Sales Value (from Opportunities won or Orders?) 
        // For now, let's assume Opportunity 'closed_won' linked to User
        const totalSalesValue = await prisma.opportunity.aggregate({
            where: { ownerId: userId, stage: 'closed_won' },
            _sum: { amount: true }
        });

        // 5. Recent Activity (History of actions) - optional, maybe fetch via activity log later

        res.json({
            stats: {
                totalLeads,
                convertedLeads,
                lostLeads,
                conversionRate: totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0,
                totalSalesValue: totalSalesValue._sum.amount || 0
            }
        });

    } catch (error) {
        console.error('getUserStats Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getUsers = async (req: Request, res: Response) => {
    try {
        console.log('[UserController] getUsers called');
        const currentUser = (req as any).user;
        const where: any = { isActive: true }; // Default to active? Original was isDeleted: {$ne: true}, but schema uses isActive.
        // Wait, Mongoose schema had isDeleted check?
        // Original: const query: any = { isDeleted: { $ne: true } };
        // Prisma schema: isPlaceholder (default false). 
        // Lead has isDeleted, User has isActive.
        // Let's assume we want all existing users? 
        // Or if we want to filter logically deleted users? 
        // User model in Prisma doesn't have isDeleted, only isActive.
        // Let's stick to showing all users for now or check if soft delete is intended.
        // Original Mongoose find({ isDeleted: { $ne: true } }) implies a soft delete field exists.
        // In my Prisma schema for User I missed isDeleted. I have isActive.
        // I'll use isActive for now as a proxy or just show all for this phase.

        // 1. Organisation Scoping
        if (currentUser.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = req.query.organisationId as string;
            }
        } else {
            const orgId = getOrgId(currentUser);
            if (!orgId) {
                return res.status(403).json({ message: 'User has no organisation' });
            }
            where.organisationId = orgId;
        }

        let users = await prisma.user.findMany({
            where,
            include: {
                organisation: { select: { name: true } }, // Equivalent to populate role? No role is enum.
                reportsTo: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        position: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log('[UserController] Query where:', JSON.stringify(where));
        console.log('[UserController] Users found:', users.length);

        // Transform results to match frontend expectations
        const transformedUsers = users.map(u => ({
            ...u,
            _id: u.id, // Frontend might still expect _id in some places, keeping it for safety
            id: u.id,
            role: { id: u.role, name: u.role }, // Frontend expects role as object with id/name
            reportsTo: u.reportsTo ? {
                ...u.reportsTo,
                id: u.reportsTo.id,
                _id: u.reportsTo.id
            } : null
        }));

        res.json({ users: transformedUsers });
    } catch (error) {
        console.error('getUsers Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getUserById = async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            include: { organisation: true }
        });

        if (!user) return res.status(404).json({ message: 'User not found' });

        // Security check
        if (currentUser.role !== 'super_admin') {
            const currentOrgId = getOrgId(currentUser);
            const targetOrgId = getOrgId(user);

            if (currentOrgId !== targetOrgId) {
                return res.status(403).json({ message: 'Not authorized to view this user' });
            }
        }

        // Exclude password
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        console.error('[getUserById] Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;
        const { password, ...updateData } = req.body;
        const userId = req.params.id;

        // Security Check
        if (currentUser.role !== 'super_admin') {
            const tempUser = await prisma.user.findUnique({ where: { id: userId }, include: { organisation: true } });
            if (!tempUser) return res.status(404).json({ message: 'User not found' });

            const isSelfUpdate = userId === currentUser.id;
            const currentOrgId = getOrgId(currentUser);
            const targetOrgId = getOrgId(tempUser);
            const orgMatch = currentOrgId && targetOrgId && currentOrgId === targetOrgId;

            if (!isSelfUpdate && !orgMatch) {
                return res.status(403).json({ message: 'Not authorized to update this user' });
            }
        }

        // Process Update Data
        const dataToUpdate: any = { ...updateData };

        // Handle reportsTo mapping
        if (updateData.reportsTo) {
            if (updateData.reportsTo === userId) {
                return res.status(400).json({ message: 'User cannot report to themselves' });
            }
            const manager = await prisma.user.findUnique({ where: { id: updateData.reportsTo as string } });
            if (!manager) return res.status(400).json({ message: 'Manager not found' });

            // Check Org
            const managerOrgId = getOrgId(manager);
            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            const targetOrgId = getOrgId(targetUser) || getOrgId(currentUser);

            if (targetOrgId !== managerOrgId) {
                return res.status(400).json({ message: 'Manager must belong to same organisation' });
            }

            dataToUpdate.reportsTo = { connect: { id: updateData.reportsTo } };
        }

        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            dataToUpdate.password = await bcrypt.hash(password, salt);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: dataToUpdate
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _password, ...userNoPass } = updatedUser;
        res.json(userNoPass);
    } catch (error) {
        console.error('[UpdateUser Error]', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const inviteUser = async (req: Request, res: Response) => {
    try {
        const { email, firstName, lastName, role, organisationId, position, reportsTo, password } = req.body;
        const currentUser = (req as any).user;

        if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
            return res.status(403).json({ message: 'Only administrators can invite users' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        let targetOrgId = getOrgId(currentUser);
        if (currentUser.role === 'super_admin' && organisationId) {
            targetOrgId = organisationId;
        }

        if (!targetOrgId) return res.status(400).json({ message: 'Organisation is required' });

        // Check limits and increment counter
        const org = await prisma.organisation.findUnique({ where: { id: targetOrgId } });
        if (org) {
            const userCount = await prisma.user.count({ where: { organisationId: targetOrgId, isActive: true } });
            if (userCount >= org.userLimit) {
                return res.status(403).json({ message: 'User limit reached' });
            }
        }

        // Generate UserID
        let generatedUserId: string | undefined;
        if (org) {
            // Atomic update
            const updatedOrg = await prisma.organisation.update({
                where: { id: targetOrgId },
                data: { userIdCounter: { increment: 1 } }
            });
            const prefix = updatedOrg.name.slice(0, 3).toUpperCase();
            const counter = updatedOrg.userIdCounter;
            generatedUserId = `${prefix}${counter.toString().padStart(3, '0')}`;
        }

        const tempPassword = password || Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        const newUser = await prisma.user.create({
            data: {
                email,
                firstName,
                lastName,
                password: hashedPassword,
                role: role as UserRole || UserRole.sales_rep,
                organisation: { connect: { id: targetOrgId } },
                position,
                userId: generatedUserId,
                reportsTo: reportsTo ? { connect: { id: reportsTo } } : undefined,
                isActive: true
            }
        });

        res.status(201).json({
            user: { id: newUser.id, email: newUser.email, firstName: newUser.firstName },
            message: 'User invited successfully'
        });

    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const deactivateUser = async (req: Request, res: Response) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });
        res.json({ message: 'User deactivated', user });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
