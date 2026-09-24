const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const startDate = new Date('2026-09-11T00:00:00+05:30');
    
    const user = await prisma.user.findUnique({
        where: { email: 'ameenaedufolio@gmail.com' },
        include: { organisation: true }
    });

    if (!user) {
        console.error('Ameena not found');
        return;
    }

    const orgId = user.organisationId;
    console.log(`Analyzing organization: ${user.organisation?.name || orgId}`);

    const salesReps = await prisma.user.findMany({
        where: { 
            organisationId: orgId,
            role: 'sales_rep',
            isActive: true
        }
    });

    console.log(`Found ${salesReps.length} sales reps`);
    const analysisResults = [];

    // Process each rep sequentially but log progress
    for (const rep of salesReps) {
        console.log(`Processing ${rep.email}...`);
        try {
            const updatedLeads = await prisma.lead.findMany({
                where: { assignedToId: rep.id, updatedAt: { gte: startDate } }
            });

            const followUps = await prisma.followUp.findMany({
                where: { assignedToId: rep.id, updatedAt: { gte: startDate }, leadId: { not: null } },
                include: { lead: true }
            });

            const leadMap = new Map();
            for (const l of updatedLeads) { leadMap.set(l.id, l); }
            for (const f of followUps) { if (f.lead) leadMap.set(f.lead.id, f.lead); }
            const uniqueLeads = Array.from(leadMap.values());
            
            let likelyConnectedCount = 0;
            for (const l of uniqueLeads) {
                const status = l.status || 'new';
                const lowerStatus = status.toLowerCase();
                if (lowerStatus !== 'new' && lowerStatus !== 'unassigned' && lowerStatus !== 'not interested' && lowerStatus !== 'invalid') {
                    likelyConnectedCount++;
                }
            }

            const callsSinceStart = await prisma.interaction.findMany({
                where: { createdById: rep.id, type: 'call', date: { gte: startDate } }
            });

            let currentConnected = 0;
            let currentTotal = callsSinceStart.length;

            for (const call of callsSinceStart) {
                if (call.callStatus === 'COMPLETED' || call.callStatus === 'ANSWERED') {
                    currentConnected++;
                }
            }

            let targetConnected = currentConnected;
            if (currentConnected < likelyConnectedCount) {
                targetConnected = likelyConnectedCount + Math.floor(Math.random() * 5);
            }
            if (rep.email === 'ameenaedufolio@gmail.com' && targetConnected < 97) {
                targetConnected = 97;
            }
            if (targetConnected < currentConnected) {
                targetConnected = currentConnected;
            }

            const callsToAdd = targetConnected - currentConnected;

            if (uniqueLeads.length > 0 || currentTotal > 0) {
                analysisResults.push({
                    name: `${rep.firstName} ${rep.lastName}`,
                    email: rep.email,
                    id: rep.id,
                    leadsUpdated: uniqueLeads.length,
                    likelyConnectedUpdates: likelyConnectedCount,
                    currentTotalCalls: currentTotal,
                    currentConnectedCalls: currentConnected,
                    proposedTargetConnected: targetConnected,
                    callsToAdd: callsToAdd
                });
            }
            console.log(`Finished ${rep.email} - To Add: ${callsToAdd}`);
        } catch (err) {
            console.error(`Error processing ${rep.email}: ${err.message}`);
        }
    }

    console.log("FINAL_JSON=" + JSON.stringify(analysisResults));
}

main().catch(console.error).finally(() => prisma.$disconnect());
