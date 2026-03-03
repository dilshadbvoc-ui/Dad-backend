"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../generated/client");
const prisma = new client_1.PrismaClient();
async function createDefaultRule() {
    try {
        // 1. Get the first organization (or specific one if known, but let's target the user's org context)
        // For this script, we'll fetch the first active organisation found.
        const org = await prisma.organisation.findFirst({
            where: { status: 'active' }
        });
        if (!org) {
            console.error("No active organisation found.");
            return;
        }
        console.log(`Creating default rule for Organisation: ${org.name} (${org.id})`);
        // 2. Create Round Robin Rule
        const rule = await prisma.assignmentRule.create({
            data: {
                name: 'Default Round Robin',
                description: 'Automatically created default rule to distribute leads among sales reps',
                organisationId: org.id,
                entity: 'Lead',
                distributionType: 'round_robin_role', // Using the type supported by DistributionService
                targetRole: 'sales_rep',
                isActive: true,
                priority: 1,
                enableRotation: true,
                distributionScope: 'organisation', // Distribute among all sales reps in org
                criteria: [] // Apply to all leads
            }
        });
        console.log("Created Assignment Rule:", rule);
    }
    catch (error) {
        console.error("Error creating rule:", error);
    }
    finally {
        await prisma.$disconnect();
    }
}
createDefaultRule();
