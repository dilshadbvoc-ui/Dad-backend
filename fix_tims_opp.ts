import prisma from './src/config/prisma';

async function main() {
    const email = 'tims.teammanageredpl@gmail.com';
    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log(`User not found with email: ${email}`);
        return;
    }
    console.log(`Found user: ${user.firstName} ${user.lastName} (ID: ${user.id})`);

    // Get all opportunities for this user
    const opps = await prisma.opportunity.findMany({
        where: { ownerId: user.id, isDeleted: false },
        orderBy: { createdAt: 'desc' }
    });

    // Group by name
    const nameMap = new Map<string, any[]>();
    for (const opp of opps) {
        if (!nameMap.has(opp.name)) {
            nameMap.set(opp.name, []);
        }
        nameMap.get(opp.name)!.push(opp);
    }

    const expectedStages = ["prospecting", "qualification", "proposal", "negotiation", "pre_qualified_lead", "qualified_lead"];

    // Find duplicates where one is closed and one is expected
    let found = false;
    for (const [name, oppGroup] of nameMap.entries()) {
        if (oppGroup.length > 1) {
            const closedOpps = oppGroup.filter(o => o.stage === 'closed_won' || o.stage === 'closed_lost');
            const expectedOpps = oppGroup.filter(o => expectedStages.includes(o.stage));
            
            if (closedOpps.length > 0 && expectedOpps.length > 0) {
                found = true;
                console.log(`Found duplicate for '${name}':`);
                console.log(`  Closed: ${closedOpps.map(o => o.id).join(', ')}`);
                console.log(`  Expected: ${expectedOpps.map(o => o.id).join(', ')}`);
                
                // Let's delete the expected one
                for (const expectedOpp of expectedOpps) {
                    console.log(`Deleting expected opportunity: ${expectedOpp.id}`);
                    await prisma.opportunity.update({
                        where: { id: expectedOpp.id },
                        data: { isDeleted: true, deletedAt: new Date() }
                    });
                    console.log(`Deleted successfully.`);
                }
            }
        }
    }
    
    if (!found) {
        console.log("No such duplicates found for this user.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
