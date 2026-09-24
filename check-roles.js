const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
    const refUser = await prisma.user.findUnique({ where: { email: 'bm@cdrc.online' } });
    const users = await prisma.user.findMany({ where: { organisationId: refUser.organisationId } });
    const roles = new Set(users.map(u => u.role));
    console.log("Roles in CDRC:", Array.from(roles));
}
main().finally(() => prisma.$disconnect());
