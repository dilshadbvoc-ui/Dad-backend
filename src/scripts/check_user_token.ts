import prisma from '../config/prisma';

async function checkUserToken() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { metaAccessToken: true, metaUserId: true }
        });

        console.log(`User has metaAccessToken: ${!!user?.metaAccessToken}`);
        console.log(`User metaUserId: ${user?.metaUserId}`);
    } finally {
        await prisma.$disconnect();
    }
}
checkUserToken();
