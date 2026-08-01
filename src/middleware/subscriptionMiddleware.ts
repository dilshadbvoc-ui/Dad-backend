import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware'; // Assuming AuthRequest is exported from authMiddleware
import prisma from '../config/prisma';

export const checkPlanLimits = (resource: 'leads' | 'contacts' | 'users' | 'storage') => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const orgId = req.user.organisationId || req.user.organisation;
            if (!orgId) {
                if (req.user.isSuperAdmin) return next();
                return res.status(403).json({ message: 'No organisation context found' });
            }

            const org = await prisma.organisation.findUnique({
                where: { id: orgId.toString() }
            });

            if (!org) return next();

            const subscription = org.subscription as any;
            if (!subscription) return next();

            if (subscription.status && subscription.status !== 'active' && subscription.status !== 'trial') {
                return res.status(403).json({ message: 'Subscription/Account is not active.' });
            }

            // NOTE: Quantity limits (users, contacts, etc.) have been permanently removed here by request.
            next();
        } catch (error) {
            console.error('[SubscriptionMiddleware] Error:', error);
            res.status(500).json({ message: 'Error checking subscription status' });
        }
    };
};
