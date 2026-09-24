const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'priyaedufolio@gmail.com' } });
    const settings = await prisma.callSettings.findUnique({ where: { organisationId: user.organisationId } });
    console.log(settings);
}
main().finally(() => prisma.$disconnect());
