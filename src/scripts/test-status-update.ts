import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const lead = await prisma.lead.findFirst({
        where: { email: 'dilshad@example.com' },
        orderBy: { createdAt: 'desc' }
    });

    if (lead) {
        console.log(`Found lead: ${lead.id}, Current Status: ${lead.status}`);
        
        console.log('Attempting to update status to "contacted" via Prisma...');
        const updated = await prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'contacted' }
        });
        console.log(`Prisma Update Result: ${updated.status}`);

        console.log('Attempting to update status to "lost" via RAW SQL...');
        await prisma.$executeRaw`UPDATE leads SET status = 'lost' WHERE id = ${lead.id}`;
        
        const finalLead = await prisma.lead.findUnique({ where: { id: lead.id } });
        console.log(`Final Status in DB: ${finalLead?.status}`);
    }

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
