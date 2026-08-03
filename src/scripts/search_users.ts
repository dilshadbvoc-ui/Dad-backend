import prisma from '../config/prisma';
async function searchUsers() {
    try {
        const users = await prisma.user.findMany({
            where: {
                integrations: { string_contains: '1717133599615272' }
            },
            select: { id: true, email: true, integrations: true }
        });
        console.log('Users found:', JSON.stringify(users, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}
searchUsers();
