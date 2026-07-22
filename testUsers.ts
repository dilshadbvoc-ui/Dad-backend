import prisma from './src/config/prisma';

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, email: true, reportsToId: true, role: true }
    });
    console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
