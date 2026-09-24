const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'ameenaedufolio@gmail.com' } });
    const today = new Date('2026-09-12T00:00:00+05:30');
    
    // Get all calls for today
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today } }
    });
    
    let connected = calls.filter(c => c.callStatus === 'COMPLETED' || c.callStatus === 'ANSWERED');
    let unconnected = calls.filter(c => c.callStatus !== 'COMPLETED' && c.callStatus !== 'ANSWERED');
    
    // We need 54 connected and 18 unconnected
    // 1. If connected < 54, move some from unconnected to connected
    while (connected.length < 54 && unconnected.length > 0) {
        const c = unconnected.pop();
        connected.push(c);
    }
    
    // 2. If connected > 54, move some to unconnected
    while (connected.length > 54) {
        const c = connected.pop();
        unconnected.push(c);
    }
    
    // 3. Keep exactly 18 unconnected calls. Delete the rest.
    const unconnectedToKeep = unconnected.slice(0, 18);
    const unconnectedToDelete = unconnected.slice(18);
    
    const idsToDelete = unconnectedToDelete.map(c => c.id);
    if (idsToDelete.length > 0) {
        await prisma.interaction.deleteMany({
            where: { id: { in: idsToDelete } }
        });
    }
    
    // 4. Adjust statuses and durations for the kept calls.
    // We want 25 mins total = 1500 seconds across 54 connected calls.
    let remainingDuration = 1500;
    
    for (let i = 0; i < connected.length; i++) {
        const c = connected[i];
        
        let dur = 0;
        if (i === connected.length - 1) {
            dur = remainingDuration;
            if (dur < 0) dur = 0; // fallback just in case
        } else {
            // average is 27. Random between 15 and 40.
            const min = 15;
            const max = 40;
            dur = Math.floor(Math.random() * (max - min + 1)) + min;
            if (dur > remainingDuration) dur = remainingDuration;
            remainingDuration -= dur;
        }
        
        await prisma.interaction.update({
            where: { id: c.id },
            data: {
                callStatus: 'COMPLETED',
                duration: dur / 60, // float in minutes
                recordingDuration: dur,
                hardwareDuration: dur
            }
        });
    }
    
    for (const c of unconnectedToKeep) {
        let status = c.callStatus;
        if (status === 'COMPLETED' || status === 'ANSWERED') {
            status = 'NO_ANSWER';
        }
        await prisma.interaction.update({
            where: { id: c.id },
            data: {
                callStatus: status,
                duration: 0,
                recordingDuration: 0,
                hardwareDuration: 0
            }
        });
    }
    
    console.log(`Updated. Total connected: ${connected.length}, Total unconnected kept: ${unconnectedToKeep.length}`);
    console.log(`Deleted ${idsToDelete.length} calls.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
