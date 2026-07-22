import prisma from './src/config/prisma';

async function main() {
    const opps = await prisma.opportunity.findMany({
        where: { isDeleted: false },
        include: {
            account: { select: { name: true } },
            owner: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
            branch: { select: { name: true } },
            emiSchedule: { select: { id: true, status: true } },
            lead: { select: { id: true, firstName: true, lastName: true, status: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
    
    console.log(`Fetched ${opps.length} opportunities`);
    
    // Check for duplicates
    const idMap = new Map();
    const nameMap = new Map();
    let duplicates = 0;
    
    opps.forEach(o => {
        if (idMap.has(o.id)) {
            console.log(`DUPLICATE ID FOUND: ${o.id}`);
            duplicates++;
        }
        idMap.set(o.id, true);
        
        if (nameMap.has(o.name)) {
            console.log(`Possible duplicate by name: ${o.name} (IDs: ${o.id} and ${nameMap.get(o.name)})`);
        }
        nameMap.set(o.name, o.id);
    });
    
    console.log(`Duplicate IDs: ${duplicates}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
