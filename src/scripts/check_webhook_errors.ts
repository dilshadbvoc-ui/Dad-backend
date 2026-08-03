import prisma from '../config/prisma';
async function checkErrors() {
    try {
        const errors = await prisma.auditLog.findMany({
            where: {
                createdAt: { gte: new Date('2026-07-30T18:30:00.000Z') },
                entity: { contains: 'webhook' }
            }
        });
        console.log('Webhook errors:', errors.length);
    } finally {
        await prisma.$disconnect();
    }
}
checkErrors();
