import prisma from '../config/prisma';

async function checkIntegrationUpdate() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true }
        });

        const org = await prisma.organisation.findUnique({
            where: { id: user!.organisationId! },
            select: { updatedAt: true }
        });

        console.log(`Organisation updated at: ${org?.updatedAt}`);

    } finally {
        await prisma.$disconnect();
    }
}
checkIntegrationUpdate();
