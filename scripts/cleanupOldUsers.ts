import prisma from '../src/config/prisma';

async function cleanup() {
    try {
        const mainAdminEmail = 'demo@crm.com';
        const mainAdmin = await prisma.user.findUnique({
            where: { email: mainAdminEmail }
        });

        if (!mainAdmin) return;
        const orgId = mainAdmin.organisationId;
        
        // New users to keep
        const newUsers = await prisma.user.findMany({
            where: {
                email: {
                    in: [
                        'dilshad@crm.com', 'abheesh@crm.com',
                        'fathima@crm.com', 'adithyan@crm.com', 'akhil@crm.com',
                        'rahul@crm.com', 'nikhil@crm.com', 'sneha@crm.com',
                        'vivek@crm.com', 'neha@crm.com', 'arjun@crm.com'
                    ]
                }
            }
        });

        const excludeIds = [mainAdmin.id, ...newUsers.map(u => u.id)];

        const oldUsers = await prisma.user.findMany({
            where: {
                organisationId: orgId,
                id: { notIn: excludeIds }
            }
        });

        for (const user of oldUsers) {
            try {
                // Delete notifications which was blocking it
                await prisma.notification.deleteMany({
                    where: { recipientId: user.id }
                });
                
                await prisma.user.delete({ where: { id: user.id } });
                console.log(`Successfully completely deleted ${user.email}`);
            } catch(e: any) {
                console.log(`Could not delete ${user.email} due to:`, e.message);
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}
cleanup();
