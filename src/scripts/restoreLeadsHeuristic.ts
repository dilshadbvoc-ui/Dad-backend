import prisma from '../config/prisma';

async function restoreLeadsHeuristic() {
    console.log('🚀 Starting Heuristic Lead Status Restoration...');

    // We want to find leads that are currently "new" but have:
    // 1. Interactions
    // 2. Completed Tasks
    // 3. Follow-ups
    
    console.log('Identifying active leads currently set to "new"...');
    
    const leadsToUpdate = await prisma.lead.findMany({
        where: {
            status: 'new',
            OR: [
                { interactions: { some: {} } },
                { tasks: { some: { status: 'completed' } } },
                { followUps: { some: {} } }
            ]
        },
        select: { id: true }
    });

    console.log(`Found ${leadsToUpdate.length} leads to move to "contacted" status.`);

    if (leadsToUpdate.length === 0) {
        console.log('No leads found for heuristic restoration.');
        return;
    }

    const leadIds = leadsToUpdate.map(l => l.id);

    // Perform bulk update
    const result = await prisma.lead.updateMany({
        where: {
            id: { in: leadIds }
        },
        data: {
            status: 'contacted'
        }
    });

    console.log(`\n✅ Successfully restored ${result.count} leads to "contacted".`);
}

restoreLeadsHeuristic()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
