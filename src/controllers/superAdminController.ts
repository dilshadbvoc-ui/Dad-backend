import { Request, Response } from 'express';
import prisma from '../config/prisma';

// Get all organisations (Super Admin only)
export const getAllOrganisations = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }

        const organisations = await prisma.organisation.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Get user counts for each org
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

        res.json({ organisations: result });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Create new organisation (Super Admin or Registration)
export const createOrganisation = async (req: Request, res: Response) => {
    try {
        const { name, slug, contactEmail, planId } = req.body;

        // Check if slug is unique
        const existingOrg = await prisma.organisation.findUnique({ where: { slug } });
        if (existingOrg) {
            return res.status(400).json({ message: 'Organisation slug already exists' });
        }

        // Create organisation
        const organisation = await prisma.organisation.create({
            data: {
                name,
                slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
                contactEmail,
                status: 'active',
                subscription: {
                    status: 'trial',
                    startDate: new Date().toISOString(),
                    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                }
            }
        });

        // If plan specified, create license
        if (planId) {
            const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
            if (plan) {
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + plan.durationDays);

                await prisma.license.create({
                    data: {
                        organisation: { connect: { id: organisation.id } },
                        plan: { connect: { id: planId } },
                        status: 'trial',
                        startDate: new Date(),
                        endDate,
                        maxUsers: plan.maxUsers
                    }
                });
            }
        }

        res.status(201).json(organisation);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

// Update organisation
export const updateOrganisationAdmin = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const orgId = req.params.id;
        const data = { ...req.body };

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

            // Clean up planId from data intended for Organisation model update
            delete data.planId;
        }

        const organisation = await prisma.organisation.update({
            where: { id: orgId },
            data: data
        });

        res.json(organisation);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Suspend organisation
export const suspendOrganisation = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const organisation = await prisma.organisation.update({
            where: { id: req.params.id },
            data: {
                status: 'suspended',
                subscription: { status: 'cancelled' }
            }
        });

        // Cancel all licenses
        await prisma.license.updateMany({
            where: { organisationId: organisation.id },
            data: { status: 'cancelled', cancelledAt: new Date() }
        });

        res.json({ message: 'Organisation suspended', organisation });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Get organisation stats (Super Admin)
export const getOrganisationStats = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const [totalOrgs, activeOrgs, suspendedOrgs, totalUsers, totalLicenses] = await Promise.all([
            prisma.organisation.count(),
            prisma.organisation.count({ where: { status: 'active' } }),
            prisma.organisation.count({ where: { status: 'suspended' } }),
            prisma.user.count({ where: { isActive: true } }),
            prisma.license.count({ where: { status: 'active' } })
        ]);

        res.json({
            totalOrganisations: totalOrgs,
            activeOrganisations: activeOrgs,
            trialOrganisations: 0, // Would need JSON query for subscription.status
            suspendedOrganisations: suspendedOrgs,
            totalUsers,
            activeLicenses: totalLicenses
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
