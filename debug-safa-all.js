const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findFirst({ where: { email: 'safaedufolio@gmail.com' } });
    const today = new Date('2026-09-14T00:00:00+05:30'); 
    
    const ints = await prisma.interaction.groupBy({
        by: ['type'],
        where: { createdById: user.id, date: { gte: today } },
        _count: { _all: true }
    });
    console.log(ints);
}
main().finally(() => prisma.$disconnect());
