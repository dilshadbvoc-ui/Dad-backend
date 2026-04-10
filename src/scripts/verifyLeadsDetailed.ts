import prisma from '../config/prisma';

async function verifyLeadsDetailed() {
    console.log('Fetching lead status counts per organisation...');
    
    const orgs = await prisma.organisation.findMany({
        select: { id: true, name: true }
    });

    for (const org of orgs) {
        const counts = await prisma.lead.groupBy({
            by: ['status'],
            where: { organisationId: org.id },
            _count: { id: true }
        });
        
        console.log(`\nOrganisation: ${org.name} (${org.id})`);
        if (counts.length === 0) {
            console.log('  No leads found.');
        } else {
            counts.forEach(c => {
                console.log(`  - Status "${c.status}": ${c._count.id} leads`);
            });
        }
    }
}

verifyLeadsDetailed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
