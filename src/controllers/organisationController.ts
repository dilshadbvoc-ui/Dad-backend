import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import bcrypt from 'bcryptjs';

export const createOrganisation = async (req: Request, res: Response) => {
    try {
        if ((req as any).user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to create organisations' });
        }

        const { name, email, password, firstName, lastName } = req.body;

        // 1. Create Organisation
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const org = await prisma.organisation.create({
            data: {
                name,
                slug,
                contactEmail: email,
                status: 'active'
            }
        });

        // 2. Create Admin User for this Organisation
        const tempPassword = password || Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const user = await prisma.user.create({
            data: {
                email,
                firstName,
                lastName,
                password: hashedPassword,
                role: 'admin',
                organisationId: org.id,
                isActive: true
            }
        });

        // Update org with createdBy
        await prisma.organisation.update({
            where: { id: org.id },
            data: { createdBy: user.id }
        });

        res.status(201).json({ organisation: org, adminUser: { ...user, password: undefined }, tempPassword });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getAllOrganisations = async (req: Request, res: Response) => {
    try {
        if ((req as any).user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const organisations = await prisma.organisation.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Get user counts for each organisation
        const orgIds = organisations.map(o => o.id);
        const userCounts = await prisma.user.groupBy({
            by: ['organisationId'],
            where: { organisationId: { in: orgIds }, isActive: true },
            _count: { id: true }
        });

        const countMap = new Map(userCounts.map(u => [u.organisationId, u._count.id]));

        const result = organisations.map(org => ({
            ...org,
            userCount: countMap.get(org.id) || 0
        }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getOrganisation = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        let orgId = getOrgId(user);

        // If super admin and requesting specific org via param
        if (user.role === 'super_admin' && req.params.id) {
            orgId = req.params.id;
        }

        if (!orgId) {
            // Super admin without own org and no id param
            if (user.role === 'super_admin') {
                return res.json({ message: 'Superadmin account', isSuperAdmin: true });
            }
            return res.status(404).json({ message: 'Organisation not found' });
        }

        const org = await prisma.organisation.findUnique({
            where: { id: orgId }
        });
        if (!org) return res.status(404).json({ message: 'Organisation not found' });

        // If super admin requesting specific org, include full details
        if (user.role === 'super_admin' && req.params.id) {
            const [users, leadCount, contactCount, accountCount, opportunityCount, wonOpportunities] = await Promise.all([
                prisma.user.findMany({
                    where: { organisationId: orgId, isActive: true },
                    select: { id: true, firstName: true, lastName: true, email: true, role: true, position: true, createdAt: true, userId: true },
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.lead.count({ where: { organisationId: orgId } }),
                prisma.contact.count({ where: { organisationId: orgId } }),
                prisma.account.count({ where: { organisationId: orgId } }),
                prisma.opportunity.count({ where: { organisationId: orgId } }),
                prisma.opportunity.aggregate({
                    where: { organisationId: orgId, stage: 'closed_won' },
                    _sum: { amount: true }
                })
            ]);

            return res.json({
                organisation: org,
                users,
                stats: {
                    userCount: users.length,
                    leadCount,
                    contactCount,
                    accountCount,
                    opportunityCount,
                    totalRevenue: wonOpportunities._sum.amount || 0
                }
            });
        }

        res.json(org);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateOrganisation = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        let orgId = getOrgId(user);

        if (user.role === 'super_admin' && req.params.id) {
            orgId = req.params.id;
        }

        if (!orgId) return res.status(404).json({ message: 'Organisation not found' });

        const data = { ...req.body };

        // Handle Meta Token Exchange
        if (data.integrations?.meta?.accessToken && data.integrations?.meta?.connected) {
            try {
                const { metaService } = require('../services/MetaService');
                const longLivedToken = await metaService.exchangeForLongLivedToken(data.integrations.meta.accessToken);
                data.integrations.meta.accessToken = longLivedToken;
            } catch (error) {
                console.error('Error exchanging Meta token:', error);
                // Continue with short-lived token if exchange fails
            }
        }

        // Handle Plan Assignment checks
        if (data.planId) {
            const plan = await prisma.subscriptionPlan.findUnique({ where: { id: data.planId } });
            if (!plan) throw new Error('Invalid Plan ID');

            // 1. Update Org Limits based on Plan
            data.userLimit = plan.maxUsers;
            data.status = 'active'; // Activate org if plan assignment happens

            // 2. Legacy Subscription JSON sync
            const existingSubscription = (await prisma.organisation.findUnique({ where: { id: orgId } }))?.subscription as any || {};
            data.subscription = {
                ...existingSubscription,
                status: 'active',
                plan: plan.name,
                planId: plan.id,
                startDate: new Date(),
                endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000)
            };

            // 3. Deactivate old active licenses
            await prisma.license.updateMany({
                where: { organisationId: orgId, status: 'active' },
                data: { status: 'cancelled', cancelledAt: new Date() }
            });

            // 4. Create New License
            await prisma.license.create({
                data: {
                    organisationId: orgId,
                    planId: plan.id,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
                    maxUsers: plan.maxUsers,
                    autoRenew: true
                }
            });

            // Clean up planId from data intended for Organisation model update (if it's not a column)
            delete data.planId;
        }

        const org = await prisma.organisation.update({
            where: { id: orgId },
            data: data
        });

        res.json(org);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteOrganisation = async (req: Request, res: Response) => {
    try {
        if ((req as any).user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const orgId = req.params.id;
        const org = await prisma.organisation.findUnique({
            where: { id: orgId }
        });

        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }

        // Prevent Super Admin from deleting their own organisation
        const userOrgId = getOrgId((req as any).user);
        if (userOrgId === orgId) {
            return res.status(400).json({ message: 'You cannot delete your own organisation' });
        }

        // Delete all users in this org first (due to foreign key constraints)
        await prisma.user.deleteMany({ where: { organisationId: orgId } });

        // Delete the organisation
        await prisma.organisation.delete({ where: { id: orgId } });

        res.json({ message: 'Organisation and associated data deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
