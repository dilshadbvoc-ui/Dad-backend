const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'ameenaedufolio@gmail.com' } });
    const today = new Date('2026-09-12T00:00:00+05:30'); // might need to just use today's date logic
    
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today }, callStatus: 'completed' }
    });
    
    console.log(`Currently found ${calls.length} completed calls in DB for today.`);
    
    const fakeCalls = calls.filter(c => !c.hardwareId);
    console.log(`Of which ${fakeCalls.length} are fake (no hardwareId).`);
    
    const excess = calls.length - 55;
    if (excess > 0) {
        const toDelete = fakeCalls.slice(0, excess);
        if (toDelete.length > 0) {
            await prisma.interaction.deleteMany({
                where: { id: { in: toDelete.map(c => c.id) } }
            });
            console.log(`Deleted ${toDelete.length} excess fake calls.`);
        } else {
            console.log(`Not enough fake calls to delete!`);
        }
    } else {
        console.log(`Count is already ${calls.length}, which is <= 55.`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
