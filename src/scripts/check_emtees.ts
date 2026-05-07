
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const orgName = 'emtees';
    console.log(`Checking organization: ${orgName}`);
    
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

    console.log('Organization Details:');
    console.log(`ID: ${org.id}`);
    console.log(`Slug: ${org.slug}`);
    console.log(`Name: ${org.name}`);
    console.log('Integrations:', JSON.stringify(org.integrations, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
