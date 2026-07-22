import prisma from '../src/config/prisma';

async function finalCleanup() {
    try {
        const mainAdminEmail = 'demo@crm.com';
        const mainAdmin = await prisma.user.findUnique({
            where: { email: mainAdminEmail }
        });

        if (!mainAdmin) return;
        
        const oldUsers = await prisma.user.findMany({
            where: {
                email: { in: ['fathima@gmail.com', 'adithyan.n.dileep@gmail.com'] }
            }
        });

        for (const user of oldUsers) {
            try {
                // Reassign all possible foreign keys
                await prisma.goal.updateMany({ where: { createdById: user.id }, data: { createdById: mainAdmin.id } });
                await prisma.goal.updateMany({ where: { assignedToId: user.id }, data: { assignedToId: mainAdmin.id } });
                await prisma.document.updateMany({ where: { createdById: user.id }, data: { createdById: mainAdmin.id } });
                
                await prisma.user.delete({ where: { id: user.id } });
                console.log(`Successfully completed deletion of ${user.email}`);
            } catch(e: any) {
                console.log(`Still could not delete ${user.email}:`, e.message);
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}
finalCleanup();
