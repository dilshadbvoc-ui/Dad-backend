import prisma from '../config/prisma';

async function restoreLeadStatusesOptimized() {
    console.log('🚀 Starting Optimized Lead Status Restoration...');

    // 1. Bulk Restore Conversions
    console.log('Restoring Converted leads...');
    const conversionResult = await prisma.lead.updateMany({
        where: {
            status: 'new',
            OR: [
                { convertedAccounts: { some: {} } },
                { convertedOpportunities: { some: {} } }
            ]
        },
        data: { status: 'converted' }
    });
    console.log(`✅ Restored ${conversionResult.count} leads to "converted".`);

    // 2. Bulk Restore Re-Enquiries
    console.log('Restoring Re-Enquiry leads...');
    const reEnquiryResult = await prisma.lead.updateMany({
        where: {
            status: 'new',
            isReEnquiry: true
        },
        data: { status: 're_enquiry' }
    });
    console.log(`✅ Restored ${reEnquiryResult.count} leads to "re_enquiry".`);

    // 3. History-based Restoration (Remaining)
    console.log('Restoring from Audit History (Batching)...');
    const leadsWithHistory = await prisma.lead.findMany({
        where: { status: 'new' },
        select: { id: true }
    });

    console.log(`Checking history for ${leadsWithHistory.length} remaining leads...`);
    
    // Process in batches of 100 to avoid memory issues
    const batchSize = 100;
    let historyRestored = 0;

    for (let i = 0; i < leadsWithHistory.length; i += batchSize) {
        const batch = leadsWithHistory.slice(i, i + batchSize);
        const leadIds = batch.map(l => l.id);

        // Fetch latest history for these leads in one query
        // Note: For complex multi-lead "latest" we'd need a raw query or loop. 
        // Loops are actually okay here since we've reduced the lead count significantly.
        
        await Promise.all(batch.map(async (lead) => {
            const latestHistory = await prisma.leadHistory.findFirst({
                where: { 
                    leadId: lead.id,
                    fieldName: 'status',
                    newValue: { not: 'new' }
                },
                orderBy: { createdAt: 'desc' }
            });

            if (latestHistory && latestHistory.newValue) {
                await prisma.lead.update({
                    where: { id: lead.id },
                    data: { status: latestHistory.newValue }
                });
                historyRestored++;
            }
        }));

        if (i % 500 === 0 && i > 0) {
            console.log(`  Processed ${i} leads...`);
        }
    }

    console.log(`✅ Restored ${historyRestored} leads from Audit History.`);
    console.log('\n🌟 Restoration process finished.');
}

restoreLeadStatusesOptimized()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
