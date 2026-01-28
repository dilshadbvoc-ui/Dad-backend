
import dotenv from 'dotenv';
import path from 'path';
import prisma from '../config/prisma';
import { DistributionService } from '../services/DistributionService';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const debugDistribution = async () => {
    try {
        console.log('--- Debugging Lead Distribution ---');

        // 1. Get the admin user (uploader)
        const adminEmail = 'superadmin@crm.com'; // Adjust if user is different
        const admin = await prisma.user.findFirst({
            where: { email: adminEmail },
            include: { organisation: true }
        });

        if (!admin) {
            console.error(`Admin user ${adminEmail} not found.`);
            // Fallback: Find ANY admin
            const anyAdmin = await prisma.user.findFirst({
                where: { role: 'super_admin' },
                include: { organisation: true }
            });
            if (anyAdmin) {
                console.log(`Fallback: Found admin ${anyAdmin.email} instead.`);
                // Use this admin
                // Re-declare const not possible, so assume we continue with this logic? 
                // Easiest to just restart the logic block or use 'anyAdmin' if needed.
                // Let's just fix the initial query to be more robust or check active orgs.
            }
        }

        // Improved Org ID extraction (mimic hierarchyUtils)
        let orgId = admin?.organisationId;
        if (!orgId && admin?.organisation) {
            orgId = admin.organisation.id;
        }

        if (!orgId) {
            console.warn(`Admin has no Linked Organisation. Checking for Organisation created by this user...`);
            const ownedOrg = await prisma.organisation.findFirst({
                where: { createdBy: admin?.id }
            });
            if (ownedOrg) {
                orgId = ownedOrg.id;
                console.log(`Found owned organisation: ${ownedOrg.name} (${orgId})`);
            } else {
                console.warn('Still no org found. Fetching FIRST active organisation for debugging...');
                const firstOrg = await prisma.organisation.findFirst();
                if (firstOrg) {
                    orgId = firstOrg.id;
                    console.log(`Using first available organisation: ${firstOrg.name} (${orgId})`);
                } else {
                    console.error('No organisations exist in the database.');
                    return;
                }
            }
        }

        console.log(`Target Organisation ID: ${orgId}`);

        // 2. Fetch Active Rules
        const rules = await prisma.assignmentRule.findMany({
            where: {
                organisationId: orgId,
                isActive: true,
                isDeleted: false
            },
            orderBy: { priority: 'asc' }
        });

        console.log(`\nFound ${rules.length} active assignment rules:`);
        rules.forEach(r => {
            console.log(`- [${r.id}] Name: "${r.name}", Type: ${r.distributionType}, Priority: ${r.priority}`);
            console.log(`  Criteria:`, JSON.stringify(r.criteria, null, 2));
            console.log(`  AssignTo:`, JSON.stringify(r.assignTo, null, 2)); // Added detailed logging
        });

        if (rules.length === 0) {
            console.warn('!! NO ACTIVE RULES FOUND !! - This is why leads assigned to admin.');
            return;
        }

        // 3. Simulate a Mock Lead (Test "Import" Scenario)
        const mockLead = {
            id: 'mock-lead-id',
            firstName: 'Test',
            lastName: 'Lead',
            source: 'import', // Start with 'import' as this is the real scenario
            status: 'new',
            leadScore: 0,
            city: 'New York', // Common criteria
            country: 'USA'
        };

        console.log('\n--- Simulating Distribution for Mock Lead ---');
        console.log('Mock Lead:', JSON.stringify(mockLead, null, 2));

        for (const rule of rules) {
            console.log(`\nChecking Rule: "${rule.name}"...`);
            const isMatch = DistributionService.matchesRule(rule, mockLead);
            console.log(`Match Result: ${isMatch}`);

            if (isMatch) {
                console.log('  -> Attempting to find eligible users...');
                const eligibleUsers = await DistributionService.getEligibleUsers(rule, orgId);
                console.log(`  -> Found ${eligibleUsers.length} eligible users:`);
                eligibleUsers.forEach(u => console.log(`     - ${u.firstName} ${u.lastName} (Quota: ${u.dailyLeadQuota || 'Unlimited'})`));
            }
        }

    } catch (error) {
        console.error('Debug Error:', error);
    } finally {
        await prisma.$disconnect();
    }
};

debugDistribution();
