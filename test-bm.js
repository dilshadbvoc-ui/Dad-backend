const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'bm@cdrc.online' }});
    console.log("User:", user ? user.id : "Not found");
    if(user) {
        const users = await prisma.user.findMany({ where: { organisationId: user.organisationId }});
        console.log("Org users:", users.length);
        console.log("Roles:", users.map(u => u.role));
    }
}
main().finally(() => prisma.$disconnect());
