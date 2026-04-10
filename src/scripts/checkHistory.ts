import prisma from '../config/prisma';

async function checkHistory() {
    console.log('Checking LeadHistory for status changes...');
    
    // Find some leads that are "new"
    const leads = await prisma.lead.findMany({
        where: { status: 'new' },
        take: 20,
        select: { id: true, organisationId: true }
    });

    for (const lead of leads) {
        const history = await prisma.leadHistory.findMany({
            where: { leadId: lead.id },
            orderBy: { createdAt: 'desc' }
        });
        
        if (history.length > 0) {
            console.log(`\nLead ID: ${lead.id}`);
            history.forEach(h => {
                console.log(`  - ${h.createdAt}: ${h.fieldName} changed from "${h.oldValue}" to "${h.newValue}"`);
            });
        }
    }
}

checkHistory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
