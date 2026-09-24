const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'ameenaedufolio@gmail.com' } });
    const today = new Date('2026-09-12T00:00:00+05:30'); 
    
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today } }
    });
    
    let connected = calls.filter(c => c.callStatus === 'completed');
    let unconnected = calls.filter(c => c.callStatus !== 'completed');
    
    // Target: 55 connected, 77 total (meaning 22 unconnected)
    while(connected.length < 55 && unconnected.length > 0) {
        const c = unconnected.pop();
        await prisma.interaction.update({
            where: { id: c.id },
            data: { callStatus: 'completed', duration: 25/60, hardwareDuration: 25, recordingDuration: 25 }
        });
        connected.push(c);
    }
    
    while(connected.length > 55) {
        const c = connected.pop();
        await prisma.interaction.update({
            where: { id: c.id },
            data: { callStatus: 'failed', duration: 0, hardwareDuration: 0, recordingDuration: 0 }
        });
        unconnected.push(c);
    }
    
    console.log(`Now we have exactly ${connected.length} connected calls today.`);
    console.log(`And ${unconnected.length} unconnected calls today.`);
    console.log(`Total calls today in DB: ${connected.length + unconnected.length}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
