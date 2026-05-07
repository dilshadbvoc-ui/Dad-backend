
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const orgName = 'emtees';
    const org = await prisma.organisation.findFirst({
        where: {
            name: {
                contains: orgName,
                mode: 'insensitive'
            }
        }
    });

    if (!org) {
        console.log(`Organization "${orgName}" not found.`);
        return;
    }

    console.log(`Checking leads for: ${org.name} (${org.id})`);
    
    const leads = await prisma.lead.findMany({
        where: {
            organisationId: org.id
        },
        orderBy: { createdAt: 'desc' },
        take: 20
    });

    console.log(`Total leads found: ${leads.length}`);
    leads.forEach(l => {
        console.log(`- ${l.firstName} ${l.lastName} | Source: ${l.source} | Status: ${l.status} | Created: ${l.createdAt}`);
        if (l.sourceDetails) {
            console.log(`  Source Details: ${JSON.stringify(l.sourceDetails)}`);
        }
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
