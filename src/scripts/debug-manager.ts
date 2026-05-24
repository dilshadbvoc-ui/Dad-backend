import prisma from '../config/prisma';

async function main() {
    try {
        const roles = await prisma.role.findMany();
        console.log('Roles in Role table:');
        roles.forEach(r => {
            console.log(`- ID: ${r.id} | Key: ${r.roleKey} | Name: ${r.name}`);
        });

        const users = await prisma.user.findMany({
            select: { id: true, email: true, role: true }
        });

        console.log('\nUser Role Values (First 15):');
        users.slice(0, 15).forEach(u => {
            console.log(`- User: ${u.email} | Role value: ${u.role}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
