import prisma from './src/config/prisma';

async function main() {
    const opps = await prisma.opportunity.findMany({
        where: { name: 'MOHAMMED RAMEEZ.M - Deal', isDeleted: false }
    });
    
    console.log(`Found ${opps.length} opportunities named 'MOHAMMED RAMEEZ.M - Deal'`);
    opps.forEach(o => {
        console.log(`ID: ${o.id}, Stage: ${o.stage}, OwnerID: ${o.ownerId}, isDeleted: ${o.isDeleted}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
