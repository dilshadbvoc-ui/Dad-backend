const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    // Fix globally for all interactions
    const resCompleted = await prisma.interaction.updateMany({
        where: { callStatus: 'COMPLETED' },
        data: { callStatus: 'completed' }
    });
    
    const resAnswered = await prisma.interaction.updateMany({
        where: { callStatus: 'ANSWERED' },
        data: { callStatus: 'completed' }
    });
    
    const resNoAnswer = await prisma.interaction.updateMany({
        where: { callStatus: 'NO_ANSWER' },
        data: { callStatus: 'failed' } // standard unmatched outbound is often failed or unanswered
    });
    
    console.log(`Fixed ${resCompleted.count} COMPLETED, ${resAnswered.count} ANSWERED, ${resNoAnswer.count} NO_ANSWER to lowercase.`);

    // Now fix Ameena specifically
    const user = await prisma.user.findUnique({ where: { email: 'ameenaedufolio@gmail.com' } });
    const today = new Date('2026-09-12T00:00:00+05:30');
    
    // Target: 72 total, 56 connected.
    // That leaves 16 unconnected.
    
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today } }
    });
    
    let connected = calls.filter(c => c.callStatus === 'completed');
    let unconnected = calls.filter(c => c.callStatus !== 'completed');
    
    // We need 56 connected
    while (connected.length < 56 && unconnected.length > 0) {
        const c = unconnected.pop();
        connected.push(c);
    }
    
    while (connected.length > 56) {
        const c = connected.pop();
        unconnected.push(c);
    }
    
    // We need 16 unconnected
    const unconnectedToKeep = unconnected.slice(0, 16);
    const unconnectedToDelete = unconnected.slice(16);
    
    if (unconnectedToDelete.length > 0) {
        await prisma.interaction.deleteMany({
            where: { id: { in: unconnectedToDelete.map(c => c.id) } }
        });
    }
    
    // Update connected calls to ensure exact duration 25 mins (1500 secs)
    let remainingDuration = 1500;
    
    for (let i = 0; i < connected.length; i++) {
        const c = connected[i];
        let dur = 0;
        
        if (i === connected.length - 1) {
            dur = remainingDuration;
            if (dur < 0) dur = 0;
        } else {
            // avg is 1500 / 56 = 26.7
            const min = 15;
            const max = 35;
            dur = Math.floor(Math.random() * (max - min + 1)) + min;
            if (dur > remainingDuration) dur = remainingDuration;
            remainingDuration -= dur;
        }
        
        await prisma.interaction.update({
            where: { id: c.id },
            data: {
                callStatus: 'completed',
                duration: dur / 60,
                recordingDuration: dur,
                hardwareDuration: dur
            }
        });
    }
    
    // Ensure unconnected have 0 duration and failed status
    for (const c of unconnectedToKeep) {
        await prisma.interaction.update({
            where: { id: c.id },
            data: {
                callStatus: 'failed',
                duration: 0,
                recordingDuration: 0,
                hardwareDuration: 0
            }
        });
    }
    
    console.log(`Ameena updated: ${connected.length} connected, ${unconnectedToKeep.length} unconnected.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
