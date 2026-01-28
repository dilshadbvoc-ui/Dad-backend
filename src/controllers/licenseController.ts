import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getLicenses = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const where: any = {};

        // Super admin can see all, others only their org
        if (!user.isSuperAdmin) {
            const orgId = getOrgId(user);
            if (orgId) where.organisationId = orgId;
        }

        const licenses = await prisma.license.findMany({
            where,
            include: {
                organisation: { select: { id: true, name: true, slug: true } },
                plan: { select: { id: true, name: true, price: true, features: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ licenses });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getCurrentLicense = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId((req as any).user);
        if (!orgId) return res.status(400).json({ message: 'No organisation' });

        const license = await prisma.license.findFirst({
            where: {
                organisationId: orgId,
                status: { in: ['active', 'trial'] }
            },
            include: { plan: true },
            orderBy: { endDate: 'desc' }
        });

        if (!license) {
            return res.status(404).json({ message: 'No active license found' });
        }

        // Get current user count
        const userCount = await prisma.user.count({
            where: { organisationId: orgId, isActive: true }
        });

        res.json({
            license,
            usage: {
                currentUsers: userCount,
                maxUsers: license.maxUsers,
                percentUsed: Math.round((userCount / license.maxUsers) * 100)
            }
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const activateLicense = async (req: Request, res: Response) => {
    try {
        const { planId, organisationId } = req.body;
        const user = (req as any).user;

        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        const orgId = organisationId || getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation' });

        // Create license
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.durationDays);

        const license = await prisma.license.create({
            data: {
                organisation: { connect: { id: orgId } },
                plan: { connect: { id: planId } },
                status: 'active',
                startDate,
                endDate,
                maxUsers: plan.maxUsers,
                activatedBy: { connect: { id: user.id } },
                paymentDetails: req.body.paymentDetails
            }
        });

        // Update organisation subscription
        await prisma.organisation.update({
            where: { id: orgId },
            data: {
                subscription: {
                    plan: planId,
                    status: 'active',
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                },
                userLimit: plan.maxUsers
            }
        });

        res.status(201).json(license);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const cancelLicense = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId((req as any).user);
        if (!orgId) return res.status(400).json({ message: 'No organisation' });

        const license = await prisma.license.updateMany({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: {
                status: 'cancelled',
                cancelledById: (req as any).user.id,
                cancelledAt: new Date(),
                cancellationReason: req.body.reason
            }
        });

        if (license.count === 0) return res.status(404).json({ message: 'License not found' });

        // Update organisation
        await prisma.organisation.update({
            where: { id: orgId },
            data: { subscription: { status: 'cancelled' } }
        });

        res.json({ message: 'License cancelled' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const checkLicenseValidity = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId((req as any).user);
        if (!orgId) return res.status(400).json({ message: 'No organisation' });

        const license = await prisma.license.findFirst({
            where: {
                organisationId: orgId,
                status: { in: ['active', 'trial'] },
                endDate: { gt: new Date() }
            }
        });

        const isValid = !!license;
        const daysRemaining = license
            ? Math.ceil((new Date(license.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 0;

        res.json({
            isValid,
            daysRemaining,
            status: license?.status || 'expired',
            expiresAt: license?.endDate
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
