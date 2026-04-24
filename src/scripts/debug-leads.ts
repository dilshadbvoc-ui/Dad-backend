
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const name = process.argv.find(arg => arg.startsWith('--name='))?.split('=')[1] || 'dilshadqw';
    console.log(`Searching for lead with name containing: ${name}`);

    const leads = await prisma.lead.findMany({
        where: {
            OR: [
                { firstName: { contains: name, mode: 'insensitive' } },
                { lastName: { contains: name, mode: 'insensitive' } }
            ]
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            stage: true,
            assignedToId: true,
            organisationId: true
        }
    });

    console.log('Results:', JSON.stringify(leads, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
