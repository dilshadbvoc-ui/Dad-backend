import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const lead = await prisma.lead.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
            history: true
        }
    });

    if (lead) {
        console.log(`Lead: ${lead.firstName} ${lead.lastName}`);
        console.log(`Status: ${lead.status}, Stage: ${lead.stage}`);
        console.log('History:');
        lead.history.forEach(h => {
            console.log(`- Field: ${h.fieldName}, Old: ${h.oldValue}, New: ${h.newValue}, Reason: ${h.reason}, Date: ${h.createdAt}`);
        });
    }

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
