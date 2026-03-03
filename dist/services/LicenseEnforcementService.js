"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseEnforcementService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
class LicenseEnforcementService {
    /**
     * Checks if the organisation has reached the limit for a specific resource.
     * @param organisationId
     * @param resourceType 'users' | 'contacts'
     * @returns boolean - true if within limits, throws error if limit reached
     */
    static async checkLimits(organisationId, resourceType) {
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: organisationId },
            select: { userLimit: true, contactLimit: true, status: true }
        });
        if (!org)
            throw new Error('Organisation not found');
        if (org.status === 'suspended') {
            throw new Error('Organisation is suspended. Please renew your subscription.');
        }
        if (resourceType === 'users') {
            const currentUsers = await prisma_1.default.user.count({
                where: {
                    organisationId,
                    isActive: true,
                    // Exclude placeholder users if any?
                    isPlaceholder: false
                }
            });
            // If limit is 0 or -1, maybe it means unlimited? Assuming standard positive integer limit.
            if (currentUsers >= org.userLimit) {
                throw new Error(`User limit reached (${currentUsers}/${org.userLimit}). Please upgrade your plan.`);
            }
        }
        if (resourceType === 'contacts') {
            const currentContacts = await prisma_1.default.contact.count({
                where: { organisationId, isDeleted: false }
            });
            if (currentContacts >= org.contactLimit) {
                throw new Error(`Contact limit reached (${currentContacts}/${org.contactLimit}). Please upgrade your plan.`);
            }
        }
    }
    /**
     * Run daily to expire licenses and suspend organisations
     */
    static async enforceExpiry() {
        console.log('[LicenseEnforcement] Running expiry check...');
        const today = new Date();
        // 1. Find active licenses that have expired
        const expiredLicenses = await prisma_1.default.license.findMany({
            where: {
                status: 'active',
                endDate: { lt: today }
            },
            include: { organisation: true }
        });
        console.log(`[LicenseEnforcement] Found ${expiredLicenses.length} expired licenses.`);
        for (const license of expiredLicenses) {
            try {
                // Transaction: Mark license expired, suspend org (or downgrade)
                await prisma_1.default.$transaction([
                    prisma_1.default.license.update({
                        where: { id: license.id },
                        data: { status: 'expired' }
                    }),
                    prisma_1.default.organisation.update({
                        where: { id: license.organisationId },
                        data: { status: 'suspended' } // OR 'grace_period'
                    })
                ]);
                console.log(`[LicenseEnforcement] Suspended Org ${license.organisation.name} due to expired license.`);
                // Optional: Notify Admin via Email/System Notification
            }
            catch (err) {
                console.error(`[LicenseEnforcement] Failed to update license ${license.id}`, err);
            }
        }
    }
}
exports.LicenseEnforcementService = LicenseEnforcementService;
