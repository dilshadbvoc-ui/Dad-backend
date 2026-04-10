import prisma from '../config/prisma';

async function analyzeHistory() {
    console.log('Analyzing LeadHistory for ALL status values...');
    
    const history = await prisma.leadHistory.findMany({
        where: { fieldName: 'status' },
        select: { oldValue: true, newValue: true }
    });

    const values = new Set<string>();
    history.forEach(h => {
        if (h.oldValue) values.add(h.oldValue);
        if (h.newValue) values.add(h.newValue);
    });

    console.log('Historical status values found:');
    console.log(Array.from(values));

    // Try to find the latest valid status for each lead
    const statusHistory = await prisma.leadHistory.findMany({
        where: { fieldName: 'status' },
        orderBy: { createdAt: 'desc' }
    });

    const lastKnownStatus: Record<string, string> = {};
    statusHistory.forEach(h => {
        if (!lastKnownStatus[h.leadId]) {
            lastKnownStatus[h.leadId] = h.newValue || 'new';
        }
    });

    console.log(`\nFound recoverable status for ${Object.keys(lastKnownStatus).length} leads.`);
}

analyzeHistory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
