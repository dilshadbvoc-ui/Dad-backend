import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const lead = await prisma.lead.findFirst({
        where: { email: 'dilshad@example.com' },
        orderBy: { createdAt: 'desc' }
    });

    if (lead) {
        console.log(`Lead ID: ${lead.id}`);
        console.log(`Source: ${lead.source}`);
        console.log(`Source Details: ${JSON.stringify(lead.sourceDetails)}`);
        console.log(`Created By ID: ${lead.createdById}`);
        console.log(`Organisation ID: ${lead.organisationId}`);
    }

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
