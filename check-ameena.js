const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'ameenaedufolio@gmail.com' } });
    const today = new Date('2026-09-12T00:00:00+05:30');
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today } }
    });
    
    let connected = 0;
    let totalDur = 0;
    calls.forEach(c => {
        if (c.callStatus === 'COMPLETED') connected++;
        totalDur += (c.duration || 0);
    });
    
    console.log(`Total calls today: ${calls.length}`);
    console.log(`Connected calls today: ${connected}`);
    console.log(`Total duration today: ${totalDur} minutes`);
}
main().finally(() => prisma.$disconnect());
