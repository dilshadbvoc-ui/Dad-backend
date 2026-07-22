import prisma from '../src/config/prisma';

async function verifyUsers() {
    try {
        const mainAdmin = await prisma.user.findUnique({ where: { email: 'demo@crm.com' } });
        if (!mainAdmin) return;
        
        const users = await prisma.user.findMany({
            where: { organisationId: mainAdmin.organisationId },
            select: { email: true, role: true, position: true }
        });
        
        console.table(users);
    } finally {
        await prisma.$disconnect();
    }
}
verifyUsers();
