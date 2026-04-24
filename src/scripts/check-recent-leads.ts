import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const leads = await prisma.lead.findMany({
        where: {
            createdAt: { gte: oneHourAgo }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    console.log(`Leads created in the last hour: ${leads.length}`);
    leads.forEach(l => {
        console.log(`- ${l.firstName} ${l.lastName} (${l.email}) | Status: ${l.status} | Stage: ${l.stage} | Created: ${l.createdAt}`);
    });

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
