import prisma from './src/config/prisma';

async function main() {
    const opps = await prisma.opportunity.findMany({
        where: { name: 'alan - Deal' }
    });
    
    console.log(`Found ${opps.length} opportunities named 'alan - Deal'`);
    opps.forEach(o => console.log(`ID: ${o.id}, Stage: ${o.stage}, CreatedAt: ${o.createdAt}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
