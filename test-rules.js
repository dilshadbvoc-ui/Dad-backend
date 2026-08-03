const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'rajithaworldpassport@gmail.com' }
    });
    console.log('USER:', user);
    if (user) {
        const rules = await prisma.assignmentRule.findMany({
            where: { organisationId: user.organisationId }
        });
        console.log('RULES:', JSON.stringify(rules, null, 2));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
