import prisma from './src/config/prisma';

async function getVisibleUserIds(userId: string): Promise<string[]> {
    const visibleIds = new Set<string>();
    visibleIds.add(userId);

    let currentIds = [userId];
    while (currentIds.length > 0) {
        const subordinates = await prisma.user.findMany({
            where: { reportsToId: { in: currentIds }, isDeleted: false },
            select: { id: true }
        });

        const subIds = subordinates.map(s => s.id);
        subIds.forEach(id => visibleIds.add(id));
        currentIds = subIds;
    }

    return Array.from(visibleIds);
}

async function cleanDuplicatesForEmail(email: string) {
    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log(`User not found with email: ${email}`);
        return;
    }

    const visibleIds = await getVisibleUserIds(user.id);
    
    const opps = await prisma.opportunity.findMany({
        where: { ownerId: { in: visibleIds }, isDeleted: false },
        orderBy: { createdAt: 'desc' }
    });
    
    console.log(`\n=== Checking user ${email} (Visible Opportunities: ${opps.length}) ===`);
    
    const nameMap = new Map<string, any[]>();
    for (const opp of opps) {
        if (!nameMap.has(opp.name)) {
            nameMap.set(opp.name, []);
        }
        nameMap.get(opp.name)!.push(opp);
    }

    let found = false;
    for (const [name, oppGroup] of nameMap.entries()) {
        if (oppGroup.length > 1) {
            const closed = oppGroup.filter(o => o.stage === 'closed_won' || o.stage === 'closed_lost');
            const expected = oppGroup.filter(o => ['prospecting', 'qualification', 'proposal', 'negotiation', 'pre_qualified_lead', 'qualified_lead'].includes(o.stage));
            if (closed.length > 0 && expected.length > 0) {
                found = true;
                console.log(`DUPLICATE FOUND for name: ${name}`);
                for (const o of closed) console.log(`  [CLOSED] ID: ${o.id}, owner: ${o.ownerId}`);
                for (const o of expected) {
                    console.log(`  [EXPECTED] ID: ${o.id}, owner: ${o.ownerId}`);
                    // Let's delete the expected one
                    await prisma.opportunity.update({
                        where: { id: o.id },
                        data: { isDeleted: true, deletedAt: new Date() }
                    });
                    console.log(`  -> DELETED expected opportunity ${o.id}`);
                }
            }
        }
    }
    
    if (!found) console.log('No duplicates found in visible opportunities.');
}

async function main() {
    const emails = ['tims@gmail.com', 'bct001.tims@gmail.com'];
    for (const email of emails) {
        await cleanDuplicatesForEmail(email);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
