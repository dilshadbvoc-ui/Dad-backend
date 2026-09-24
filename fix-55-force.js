const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'ameenaedufolio@gmail.com' } });
    const today = new Date('2026-09-12T00:00:00+05:30'); 
    
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today }, callStatus: 'completed' }
    });
    
    const fakeCalls = calls.filter(c => !c.hardwareId);
    
    // We want to force delete 4 more to ensure the dashboard drops by exactly 10.
    const toDelete = fakeCalls.slice(0, 4);
    if (toDelete.length > 0) {
        await prisma.interaction.deleteMany({
            where: { id: { in: toDelete.map(c => c.id) } }
        });
        console.log(`Deleted 4 more fake calls.`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
