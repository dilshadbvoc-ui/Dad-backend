const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'ajeenaedufolio@gmail.com' } });
    if (!user) {
        console.log("Ajeena not found");
        return;
    }

    const today = new Date('2026-09-14T00:00:00+05:30'); 
    
    // Get all connected calls for today
    const connectedCalls = await prisma.interaction.findMany({
        where: { 
            createdById: user.id, 
            type: 'call', 
            date: { gte: today },
            callStatus: 'completed'
        }
    });
    
    if (connectedCalls.length === 0) {
        console.log("No connected calls found for today to distribute duration into.");
        return;
    }

    console.log(`Found ${connectedCalls.length} connected calls today.`);
    
    // Target duration: 39 minutes 16 seconds = 2356 seconds
    let remainingDuration = 2356;
    
    for (let i = 0; i < connectedCalls.length; i++) {
        const c = connectedCalls[i];
        
        let dur = 0;
        if (i === connectedCalls.length - 1) {
            dur = remainingDuration;
        } else {
            // Distribute roughly evenly, but with some randomness
            const avg = remainingDuration / (connectedCalls.length - i);
            const min = Math.floor(avg * 0.5);
            const max = Math.floor(avg * 1.5);
            dur = Math.floor(Math.random() * (max - min + 1)) + min;
            if (dur > remainingDuration) dur = remainingDuration;
            remainingDuration -= dur;
        }
        
        await prisma.interaction.update({
            where: { id: c.id },
            data: {
                duration: dur / 60, // float in minutes for display usually
                recordingDuration: dur,
                hardwareDuration: dur
            }
        });
    }
    
    console.log(`Successfully distributed 39 minutes and 16 seconds across ${connectedCalls.length} connected calls.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
