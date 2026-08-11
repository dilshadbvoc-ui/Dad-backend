import prisma from '../config/prisma';
import { DistributionService } from '../services/distributionService';

const ORG_ID = 'ac7ea51b-55f1-45dc-8c4d-4ba40fb9ab8e'; // World Passport
const CMO_USER_ID = '4b6e9139-fd02-4071-9c2e-280b0b987b16';
const MEERA_ID = '0b9e6e8f-4e43-4a73-abf6-495b3a2b131f';
const LAKSHMI_ID = 'ee077256-1857-4def-9609-19fa11b5cf32';
const BRANCH_ID = '1611b3f8-833b-4edf-a70a-f511c37b3cad';
const CAMPAIGN_NAME = 'DG_HOTELADM_5-8-26_leads';

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    // 1. Create the missing rule for the new campaign, matching the org's existing pattern.
    const activeRules = await prisma.assignmentRule.findMany({
        where: { organisationId: ORG_ID, isActive: true, isDeleted: false }
    });
    const existing = activeRules.find((r) =>
        ((r.criteria as any[]) || []).some(
            (c) => c.field === 'sourceDetails.campaignName' && String(c.value).trim().toLowerCase() === CAMPAIGN_NAME.toLowerCase()
        )
    );

    if (existing) {
        console.log('Rule already exists for', CAMPAIGN_NAME, existing.id);
    } else if (!dryRun) {
        const rule = await prisma.assignmentRule.create({
            data: {
                name: `${CAMPAIGN_NAME} Alok 7`,
                organisationId: ORG_ID,
                isActive: true,
                priority: 1,
                distributionType: 'campaign_users',
                distributionScope: 'organisation',
                branchId: BRANCH_ID,
                criteria: [{ field: 'sourceDetails.campaignName', value: CAMPAIGN_NAME, operator: 'equals' }],
                assignTo: { type: 'user', users: [MEERA_ID, LAKSHMI_ID], value: '' }
            }
        });
        console.log('Created rule', rule.id, 'for campaign', CAMPAIGN_NAME);
    } else {
        console.log('[dry-run] Would create rule for', CAMPAIGN_NAME);
    }

    // 2. Redistribute every Meta lead currently sitting on the CMO fallback user.
    const leads = await prisma.lead.findMany({
        where: { organisationId: ORG_ID, source: 'meta_leadgen', assignedToId: CMO_USER_ID, isDeleted: false },
        orderBy: { createdAt: 'asc' }
    });
    console.log(`\nFound ${leads.length} leads on CMO fallback to redistribute.`);

    if (dryRun) {
        console.log('[dry-run] Would call DistributionService.assignLead for each of the above.');
        return;
    }

    let reassigned = 0;
    let stillUnmatched = 0;
    for (const lead of leads) {
        const newOwner = await DistributionService.assignLead(lead, ORG_ID);
        if (newOwner && newOwner !== CMO_USER_ID) {
            reassigned++;
        } else {
            stillUnmatched++;
            console.log(`  Lead ${lead.id} (${(lead.sourceDetails as any)?.campaignName}) still unmatched -> ${newOwner}`);
        }
    }
    console.log(`\nReassigned: ${reassigned}, still unmatched/on CMO: ${stillUnmatched}`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
