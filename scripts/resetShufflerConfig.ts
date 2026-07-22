import prisma from '../src/config/prisma';

async function main() {
    const org = await prisma.organisation.findFirst();
    if (!org) return console.log('No org found');

    const config = org.shufflerConfig as any || {};
    config.users = [];
    config.branches = [];
    config.lastAssignedUserId = null;
    config.selectAllUsers = true;
    config.selectAllBranches = true;

    await prisma.organisation.update({
        where: { id: org.id },
        data: { shufflerConfig: config }
    });

    console.log('Successfully cleared old users and branches from shufflerConfig');
}

main().catch(console.error).finally(() => prisma.$disconnect());
