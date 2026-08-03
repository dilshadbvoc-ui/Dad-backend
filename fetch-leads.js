const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const leads1 = await prisma.lead.findMany({
        where: {
            OR: [
                { phone: { contains: '9846388335' } },
                { phone: { contains: '8086351383' } }
            ]
        },
        select: {
            id: true,
            firstName: true,
            phone: true,
            source: true,
            createdAt: true
        }
    });
    console.log('LEADS:', JSON.stringify(leads1, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
