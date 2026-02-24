"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateWhatsAppIntegrations = migrateWhatsAppIntegrations;
const prisma_1 = __importDefault(require("../config/prisma"));
/**
 * Migration script to separate WhatsApp configuration from Meta integration
 * This script will:
 * 1. Find organisations with Meta integration that has WhatsApp fields
 * 2. Create separate WhatsApp integration configuration
 * 3. Keep Meta integration for ads functionality only
 */
async function migrateWhatsAppIntegrations() {
    console.log('Starting WhatsApp integration migration...');
    try {
        // Find all organisations with integrations
        const organisations = await prisma_1.default.organisation.findMany({
            select: {
                id: true,
                name: true,
                integrations: true
            }
        });
        let migratedCount = 0;
        for (const org of organisations) {
            const integrations = org.integrations;
            // Check if Meta integration has WhatsApp fields
            if (integrations?.meta?.phoneNumberId && !integrations?.whatsapp) {
                console.log(`Migrating organisation: ${org.name} (${org.id})`);
                // Create separate WhatsApp configuration
                const whatsappConfig = {
                    connected: integrations.meta.connected || false,
                    accessToken: integrations.meta.accessToken,
                    phoneNumberId: integrations.meta.phoneNumberId,
                    wabaId: integrations.meta.wabaId
                };
                // Clean Meta configuration (remove WhatsApp fields)
                const metaConfig = {
                    connected: integrations.meta.connected || false,
                    pageId: integrations.meta.pageId,
                    accessToken: integrations.meta.accessToken,
                    adAccountId: integrations.meta.adAccountId
                };
                // Update organisation with separated integrations
                const updatedIntegrations = {
                    ...integrations,
                    meta: metaConfig,
                    whatsapp: whatsappConfig
                };
                await prisma_1.default.organisation.update({
                    where: { id: org.id },
                    data: {
                        integrations: updatedIntegrations
                    }
                });
                migratedCount++;
                console.log(`✓ Migrated ${org.name}`);
            }
            else if (integrations?.whatsapp) {
                console.log(`⚠ Organisation ${org.name} already has separate WhatsApp config`);
            }
            else {
                console.log(`- Organisation ${org.name} has no WhatsApp integration to migrate`);
            }
        }
        console.log(`\nMigration completed! Migrated ${migratedCount} organisations.`);
    }
    catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}
// Run migration if called directly
if (require.main === module) {
    migrateWhatsAppIntegrations()
        .then(() => {
        console.log('Migration script completed successfully');
        process.exit(0);
    })
        .catch((error) => {
        console.error('Migration script failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate-whatsapp-integration.js.map