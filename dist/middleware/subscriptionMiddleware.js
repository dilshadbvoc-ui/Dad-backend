"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPlanLimits = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const checkPlanLimits = (resource) => {
    return async (req, res, next) => {
        try {
            const orgId = req.user.organisationId || req.user.organisation;
            if (!orgId) {
                // If super admin or no org, maybe bypass or error?
                // For safety, error if not super admin
                if (req.user.isSuperAdmin)
                    return next();
                return res.status(403).json({ message: 'No organisation context found for limit check' });
            }
            // Fetch Organisation using Prisma
            const org = await prisma_1.default.organisation.findUnique({
                where: { id: orgId.toString() }
            });
            if (!org || !org.subscription) {
                return res.status(403).json({ message: 'No active subscription found.' });
            }
            const subscription = org.subscription;
            // Check Subscription Status
            if (subscription.status !== 'active' && subscription.status !== 'trial') {
                return res.status(403).json({ message: 'Subscription is not active.' });
            }
            // Fetch Plan
            let plan;
            if (subscription.planId) {
                plan = await prisma_1.default.subscriptionPlan.findUnique({
                    where: { id: subscription.planId }
                });
            }
            // Fallback for trial or missing plan: Use "Starter" defaults
            if (!plan) {
                plan = {
                    maxLeads: 10000, // Generous limit for testing
                    maxContacts: 5000,
                    maxUsers: 100, // Allow more team members
                    maxStorage: 10000
                };
            }
            let currentCount = 0;
            let limit = 0;
            switch (resource) {
                case 'leads':
                    // Verify if Leads are stored in Postgres or Mongo?
                    // Previous logs showed Lead controller using Prisma (Postgres)
                    currentCount = await prisma_1.default.lead.count({ where: { organisationId: orgId.toString(), isDeleted: false } });
                    limit = plan.maxLeads || 100;
                    break;
                case 'contacts':
                    // Contact model in schema does NOT have isDeleted (checked schema.prisma)
                    currentCount = await prisma_1.default.contact.count({ where: { organisationId: orgId.toString() } });
                    limit = plan.maxContacts || 500;
                    break;
                case 'users':
                    // User check is usually done in inviteUser, but good to have middleware too
                    currentCount = await prisma_1.default.user.count({ where: { organisationId: orgId.toString(), isActive: true } });
                    limit = plan.maxUsers || 1;
                    break;
                // Add storage check if needed
            }
            if (currentCount >= limit) {
                console.log(`[Limit Reached] ${resource}: ${currentCount} >= ${limit}`);
                return res.status(403).json({
                    message: `Plan limit reached for ${resource}. Current: ${currentCount}, Max: ${limit}. Please upgrade your plan.`
                });
            }
            next();
        }
        catch (error) {
            console.error('[SubscriptionMiddleware] Error:', error);
            res.status(500).json({ message: 'Error checking subscription limits' });
        }
    };
};
exports.checkPlanLimits = checkPlanLimits;
