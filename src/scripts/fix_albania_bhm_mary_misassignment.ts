import prisma from '../config/prisma';

const ORG_ID = 'ac7ea51b-55f1-45dc-8c4d-4ba40fb9ab8e'; // World Passport
const MARY_ID = '61e91eae-6f70-4403-b5ba-7a5eba227c11';
const CAMPAIGN_NAME = 'ALBANIA BHM LEAD POSTER 29/07/26';
const RULE_NAME = 'ALBANIA BHM LEAD POSTER - Tellus';
const SKILL_BRANCH_ID = '1611b3f8-833b-4edf-a70a-f511c37b3cad';
const MEERA_ID = '0b9e6e8f-4e43-4a73-abf6-495b3a2b131f';
const LAKSHMI_ID = 'ee077256-1857-4def-9609-19fa11b5cf32';
const DEAD_USER_ID = '833d04c1-4fa2-4581-a6f6-084b76ec26d5'; // no longer exists

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    // 1. Clean up the rule's assignTo.users so it only contains the two Skill-branch users.
    const rule = await prisma.assignmentRule.findFirst({
        where: { organisationId: ORG_ID, name: RULE_NAME, branchId: SKILL_BRANCH_ID, isDeleted: false }
    });

    if (!rule) {
        console.log('Rule not found, aborting.');
        return;
    }

    const currentUsers: string[] = (rule.assignTo as any)?.users || [];
    console.log('Current assignTo.users:', currentUsers);

    if (dryRun) {
        console.log('[dry-run] Would update rule assignTo.users to', [MEERA_ID, LAKSHMI_ID]);
    } else {
        await prisma.assignmentRule.update({
            where: { id: rule.id },
            data: {
                assignTo: { type: 'user', users: [MEERA_ID, LAKSHMI_ID], value: '' },
                // Reset rotation pointer so the very next lead starts a clean round robin
                lastAssignedUserId: null
            }
        });
        console.log('Rule assignTo.users updated to', [MEERA_ID, LAKSHMI_ID]);
    }

    // 2. Find the 48 leads on Mary that were misassigned by the auto-rule bug
    //    (excludes leads a human explicitly, manually assigned to her afterwards).
    const leads = await prisma.lead.findMany({
        where: { organisationId: ORG_ID, assignedToId: MARY_ID },
        select: { id: true, sourceDetails: true, firstName: true, lastName: true },
        orderBy: { createdAt: 'asc' }
    });

    const campaignLeads = leads.filter(l => (l.sourceDetails as any)?.campaignName === CAMPAIGN_NAME);

    const toReassign: typeof campaignLeads = [];
    for (const l of campaignLeads) {
        const lastAssign = await prisma.leadHistory.findFirst({
            where: { leadId: l.id, newOwnerId: MARY_ID },
            orderBy: { createdAt: 'desc' }
        });
        if (lastAssign?.reason?.startsWith('Auto-assigned via rule')) {
            toReassign.push(l);
        }
    }

    console.log(`\nFound ${toReassign.length} auto-bug leads to reassign (of ${campaignLeads.length} total currently on Mary).`);

    // 3. Round-robin them across Meera and Lakshmi, alternating, in original creation order.
    const rotation = [MEERA_ID, LAKSHMI_ID];
    let rotationIndex = 0;
    const counts: Record<string, number> = { [MEERA_ID]: 0, [LAKSHMI_ID]: 0 };

    for (const lead of toReassign) {
        const newOwnerId = rotation[rotationIndex % rotation.length];
        rotationIndex++;
        counts[newOwnerId]++;

        console.log(`${dryRun ? '[dry-run] ' : ''}Lead ${lead.id} (${lead.firstName} ${lead.lastName || ''}) -> ${newOwnerId}`);

        if (!dryRun) {
            await prisma.lead.update({
                where: { id: lead.id },
                data: { assignedToId: newOwnerId, branchId: SKILL_BRANCH_ID }
            });

            await prisma.leadHistory.create({
                data: {
                    leadId: lead.id,
                    oldOwnerId: MARY_ID,
                    newOwnerId: newOwnerId,
                    changedById: newOwnerId,
                    reason: 'Correction: re-routed from out-of-branch fallback (assignment rule branch-membership bug) to Skill branch round robin'
                }
            });
        }
    }

    // 4. Leave lastAssignedUserId pointing at whoever got the last lead in this batch,
    //    so the live rule's rotation continues smoothly from here.
    if (!dryRun && toReassign.length > 0) {
        const lastAssignedTo = rotation[(rotationIndex - 1) % rotation.length];
        await prisma.assignmentRule.update({
            where: { id: rule.id },
            data: { lastAssignedUserId: lastAssignedTo }
        });
    }

    console.log('\nReassignment counts:', counts);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
