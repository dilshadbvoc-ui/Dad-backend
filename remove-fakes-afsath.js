const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'afsathedufolio@gmail.com' } });
    if (!user) {
        console.log("User not found");
        return;
    }

    const startDate = new Date('2026-09-11T00:00:00+05:30'); 
    
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: startDate } }
    });
    
    const isFake = (c) => !c.hardwareId && !c.callSessionId && (c.description === 'Discussed update with the lead.' || c.description === 'No answer');
    
    const fakeCalls = calls.filter(isFake);
    
    if (fakeCalls.length > 0) {
        await prisma.interaction.deleteMany({
            where: { id: { in: fakeCalls.map(c => c.id) } }
        });
        console.log(`Successfully deleted ${fakeCalls.length} fake calls for Afsath across Sept 11 and Sept 12.`);
    } else {
        console.log(`No fake calls found to delete.`);
    }

    // Now query today's actual stats to confirm
    const today = new Date('2026-09-12T00:00:00+05:30'); 
    const callsToday = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today } }
    });
    
    let currentTotal = 0;
    let currentConnected = 0;
    let currentDuration = 0;

    for (const c of callsToday) {
        currentTotal++;
        if (c.callStatus === 'completed') currentConnected++;
        currentDuration += (c.duration || 0);
    }
    
    console.log("\n--- TODAY'S CURRENT STATS AFTER REMOVAL ---");
    console.log(`Total Calls: ${currentTotal}`);
    console.log(`Connected Calls: ${currentConnected}`);
    console.log(`Duration: ${currentDuration.toFixed(2)} mins`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
