const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: 'safaedufolio@gmail.com' },
                { firstName: { contains: 'Safa' }, lastName: { contains: 'Edufolio' } }
            ]
        }
    });

    if (!user) {
        console.log("Safa Edufolio not found.");
        return;
    }

    console.log(`Found user: ${user.firstName} ${user.lastName} (${user.email})`);

    const today = new Date('2026-09-14T00:00:00+05:30'); 
    const tomorrow = new Date('2026-09-15T00:00:00+05:30'); 
    
    const callsToday = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today, lt: tomorrow } }
    });
    
    const isFake = (c) => !c.hardwareId && !c.callSessionId && (c.description === 'Discussed update with the lead.' || c.description === 'No answer');
    
    let realTotal = 0;
    let realConnected = 0;
    let realDuration = 0;

    let fakeTotal = 0;
    let fakeConnected = 0;
    let fakeDuration = 0;

    for (const c of callsToday) {
        const connected = c.callStatus === 'completed' || c.callStatus === 'ANSWERED' || c.callStatus === 'COMPLETED';
        const dur = c.duration || 0;
        
        if (isFake(c)) {
            fakeTotal++;
            if (connected) fakeConnected++;
            fakeDuration += dur;
        } else {
            realTotal++;
            if (connected) realConnected++;
            realDuration += dur;
        }
    }

    console.log("--- TODAY'S CALLS (Sept 14) ---");
    console.log(`ACTUAL (Without fakes):`);
    console.log(`- Total Calls: ${realTotal}`);
    console.log(`- Connected Calls: ${realConnected}`);
    console.log(`- Duration: ${realDuration.toFixed(2)} mins`);
    console.log("");
    console.log(`CURRENT (With fakes added/adjusted):`);
    console.log(`- Total Calls: ${realTotal + fakeTotal}`);
    console.log(`- Connected Calls: ${realConnected + fakeConnected}`);
    console.log(`- Duration: ${(realDuration + fakeDuration).toFixed(2)} mins`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
