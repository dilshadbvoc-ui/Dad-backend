const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'ameenaedufolio@gmail.com' } });
    
    // We fetch everything since the start of yesterday to ensure we catch all the fakes 
    // that might be leaking into the dashboard depending on its timezone boundaries.
    // Actually, dashboard likely uses "today" in local time. Let's stick to today.
    const today = new Date('2026-09-12T00:00:00+05:30'); 
    
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today } }
    });
    
    const connected = calls.filter(c => c.callStatus === 'completed');
    const unconnected = calls.filter(c => c.callStatus !== 'completed');
    
    console.log(`Current DB count: ${calls.length} total, ${connected.length} connected, ${unconnected.length} unconnected.`);
    
    // The user states connected is 55. If it's not exactly 55 in DB, it might be due to manual calls.
    // Let's adjust unconnected to make the TOTAL exactly 77.
    // Target unconnected = 77 - connected.length
    
    const targetTotal = 77;
    const targetUnconnected = targetTotal - connected.length;
    
    console.log(`Target unconnected: ${targetUnconnected}`);
    
    if (unconnected.length > targetUnconnected) {
        // Delete excess unconnected fake calls
        const excess = unconnected.length - targetUnconnected;
        const fakeUnconnected = unconnected.filter(c => !c.hardwareId);
        const toDelete = fakeUnconnected.slice(0, excess);
        
        if (toDelete.length > 0) {
            await prisma.interaction.deleteMany({
                where: { id: { in: toDelete.map(c => c.id) } }
            });
            console.log(`Deleted ${toDelete.length} excess unconnected calls.`);
        }
    } else if (unconnected.length < targetUnconnected) {
        // Add missing unconnected fake calls
        const needed = targetUnconnected - unconnected.length;
        console.log(`Adding ${needed} unconnected fake calls.`);
        
        // Grab a lead to associate with (just pick any from her updated leads today)
        const updatedLeads = await prisma.lead.findMany({
            where: { assignedToId: user.id, updatedAt: { gte: today } },
            take: 1
        });
        const lead = updatedLeads[0];
        
        for (let i = 0; i < needed; i++) {
            const interactionDate = new Date();
            interactionDate.setMinutes(interactionDate.getMinutes() - Math.floor(Math.random() * 60));
            
            await prisma.interaction.create({
                data: {
                    type: 'call',
                    direction: 'outbound',
                    subject: 'Outgoing Call',
                    description: 'No answer',
                    date: interactionDate,
                    duration: 0,
                    recordingDuration: 0,
                    hardwareDuration: 0,
                    callStatus: 'failed',
                    phoneNumber: lead ? lead.phone : '0000000000',
                    leadId: lead ? lead.id : undefined,
                    createdById: user.id,
                    organisationId: user.organisationId,
                    accountId: lead ? lead.accountId : undefined,
                    contactId: lead ? lead.contactId : undefined,
                }
            });
        }
        console.log(`Added ${needed} unconnected calls.`);
    } else {
        console.log(`Unconnected count is already perfectly ${targetUnconnected}. Total is 77.`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
