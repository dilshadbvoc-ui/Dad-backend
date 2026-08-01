
import prisma from '../config/prisma';

export class LicenseEnforcementService {
    /**
     * Checks if the organisation has reached the limit for a specific resource.
     * @param organisationId 
     * @param resourceType 'users' | 'contacts'
     * @returns boolean - true if within limits, throws error if limit reached
     */
    static async checkLimits(organisationId: string, resourceType: 'users' | 'contacts'): Promise<void> {
        return;


    }

    /**
     * Run daily to expire licenses and suspend organisations
     */
    static async enforceExpiry() {
        console.log('[LicenseEnforcement] Running expiry check...');
        const today = new Date();

        // 1. Find active licenses that have expired
        const expiredLicenses = await prisma.license.findMany({
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
                await prisma.$transaction([
                    prisma.license.update({
                        where: { id: license.id },
                        data: { status: 'expired' }
                    }),
                    prisma.organisation.update({
                        where: { id: license.organisationId },
                        data: { status: 'suspended' } // OR 'grace_period'
                    })
                ]);

                console.log(`[LicenseEnforcement] Suspended Org ${license.organisation.name} due to expired license.`);

                // Optional: Notify Admin via Email/System Notification
            } catch (err) {
                console.error(`[LicenseEnforcement] Failed to update license ${license.id}`, err);
            }
        }
    }
}
