const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'rajithaworldpassport@gmail.com' }
    });
    if (user) {
        const leads = await prisma.lead.findMany({
            where: { 
                organisationId: user.organisationId,
                source: 'meta_leadgen'
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log('RECENT META LEADS:', JSON.stringify(leads, null, 2));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
