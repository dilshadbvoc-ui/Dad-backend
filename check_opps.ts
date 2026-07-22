import prisma from './src/config/prisma';

async function main() {
    // Find opportunities that might be duplicates (same name, created closely, or just list all)
    const opps = await prisma.opportunity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20
    });
    
    console.log(`Found ${opps.length} recent opportunities.`);
    opps.forEach(o => {
        console.log(`ID: ${o.id}, Name: ${o.name}, Stage: ${o.stage}, Owner: ${o.ownerId}, Org: ${o.organisationId}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
