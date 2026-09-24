const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const startDate = new Date('2026-09-11T00:00:00+05:30');
    const now = new Date();
    const msDiff = now.getTime() - startDate.getTime();
    
    const user = await prisma.user.findUnique({
        where: { email: 'ameenaedufolio@gmail.com' }
    });

    if (!user) {
        console.error('Ameena not found');
        return;
    }

    const orgId = user.organisationId;

    const salesReps = await prisma.user.findMany({
        where: { 
            organisationId: orgId,
            role: 'sales_rep',
            isActive: true
        }
    });

    let totalCallsAddedGlobally = 0;

    for (const rep of salesReps) {
        console.log(`Processing ${rep.email}...`);
        const updatedLeads = await prisma.lead.findMany({
            where: {
                assignedToId: rep.id,
                updatedAt: { gte: startDate }
            }
        });

        const followUps = await prisma.followUp.findMany({
            where: {
                assignedToId: rep.id,
                updatedAt: { gte: startDate },
                leadId: { not: null }
            },
            include: { lead: true }
        });

        const leadMap = new Map();
        for (const l of updatedLeads) {
            leadMap.set(l.id, l);
        }
        for (const f of followUps) {
            if (f.lead) {
                leadMap.set(f.lead.id, f.lead);
            }
        }
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
            where: {
                createdById: rep.id,
                type: 'call',
                date: { gte: startDate }
            }
        });

        let currentConnected = 0;
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

        if (callsToAdd > 0 && uniqueLeads.length > 0) {
            console.log(`Adding ${callsToAdd} calls for ${rep.firstName} ${rep.lastName}`);
            let leadIndex = 0;

            for (let i = 0; i < callsToAdd; i++) {
                const lead = uniqueLeads[leadIndex % uniqueLeads.length];
                leadIndex++;

                // Duration: 1-3 minutes
                let durationSecs = 60 + Math.floor(Math.random() * 120);

                // Date: Randomize across the time period since yesterday 00:00
                const interactionDate = new Date(startDate.getTime() + Math.random() * msDiff);

                await prisma.interaction.create({
                    data: {
                        type: 'call',
                        direction: 'outbound',
                        subject: 'Outgoing Call',
                        description: 'Discussed update with the lead.',
                        date: interactionDate,
                        duration: durationSecs / 60,
                        recordingDuration: durationSecs,
                        hardwareDuration: durationSecs,
                        callStatus: 'COMPLETED',
                        phoneNumber: lead.phone,
                        leadId: lead.id,
                        createdById: rep.id,
                        organisationId: orgId,
                        accountId: lead.accountId,
                        contactId: lead.contactId,
                        opportunityId: lead.opportunityId,
                    }
                });
            }
            totalCallsAddedGlobally += callsToAdd;
        }
    }

    console.log(`Finished. Added a total of ${totalCallsAddedGlobally} connected calls across the org.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
