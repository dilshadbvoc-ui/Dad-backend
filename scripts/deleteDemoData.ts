import prisma from '../src/config/prisma';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};

async function deleteDemoData() {
    try {
        const userEmail = 'demo@crm.com';
        const user = await prisma.user.findUnique({
            where: { email: userEmail }
        });

        if (!user || !user.organisationId) {
            console.log(`User ${userEmail} or organization not found.`);
            rl.close();
            return;
        }

        const orgId = user.organisationId;
        console.log(`\n--- Target Organization ID: ${orgId} ---\n`);

        // ==========================================
        // 1. Analyze and Ask for Leads
        // ==========================================
        const leadCount = await prisma.lead.count({
            where: { organisationId: orgId }
        });

        const ansLeads = await question(`Found ${leadCount} leads in this organization. Shall I delete all of them? (y/n): `);
        
        if (ansLeads.trim().toLowerCase() === 'y') {
            // Because we have cascades and relationships, we can use deleteMany. 
            // Note: If Lead has related records without Cascade delete, they might block this.
            // Assuming standard setup where relationships cascade down or we just want to clear Lead objects.
            const deleteLeadsRes = await prisma.lead.deleteMany({
                where: { organisationId: orgId }
            });
            console.log(`-> Successfully deleted ${deleteLeadsRes.count} leads.`);
        } else {
            console.log('-> Skipped deleting leads.');
        }

        console.log('\n----------------------------------------\n');

        // ==========================================
        // 2. Analyze and Ask for Follow-ups
        // ==========================================
        
        // Find all follow-ups in the org to aggregate by user
        const followUps = await prisma.followUp.findMany({
            where: { 
                OR: [
                    { organisationId: orgId },
                    { assignedTo: { organisationId: orgId } }
                ]
            },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true } }
            }
        });

        const usersWithFollowUps = new Map<string, { name: string, count: number }>();
        for (const fu of followUps) {
            let name = 'Unassigned';
            let userId = 'unassigned';
            
            if (fu.assignedTo) {
                userId = fu.assignedTo.id;
                name = `${fu.assignedTo.firstName} ${fu.assignedTo.lastName || ''}`.trim();
            }

            if (!usersWithFollowUps.has(userId)) {
                usersWithFollowUps.set(userId, { name, count: 0 });
            }
            usersWithFollowUps.get(userId)!.count++;
        }

        console.log(`Found a total of ${followUps.length} follow-ups.`);
        console.log(`These follow-ups belong to the following ${usersWithFollowUps.size} users:\n`);
        
        let i = 1;
        for (const [_, data] of usersWithFollowUps.entries()) {
            console.log(`  ${i++}. ${data.name} -> ${data.count} follow-ups`);
        }

        const ansFollowUps = await question(`\nShall I delete all ${followUps.length} follow-ups from these users? (y/n): `);
        
        if (ansFollowUps.trim().toLowerCase() === 'y') {
            const deleteFollowUpsRes = await prisma.followUp.deleteMany({
                where: { 
                    OR: [
                        { organisationId: orgId },
                        { assignedTo: { organisationId: orgId } }
                    ]
                }
            });
            console.log(`-> Successfully deleted ${deleteFollowUpsRes.count} follow-ups.`);
        } else {
            console.log('-> Skipped deleting follow-ups.');
        }

        console.log('\nAll done!');

    } catch (e) {
        console.error('\nError during deletion process:', e);
    } finally {
        rl.close();
        await prisma.$disconnect();
    }
}

deleteDemoData();
