const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: ["5803ca9e-918d-4019-9d4e-0b35f6bbe142", "27725d08-54e5-4404-ae79-dab9cddf01d9"]
      }
    },
    select: {
      id: true,
      firstName: true,
      role: true,
      branchId: true,
      organisationId: true
    }
  });
  console.log("Users:", JSON.stringify(users, null, 2));

  if (users.length > 0) {
    const rules = await prisma.assignmentRule.findMany({
      where: {
        organisationId: users[0].organisationId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        distributionType: true,
        targetRole: true,
        branchId: true,
        assignTo: true
      }
    });
    console.log("Rules: ", JSON.stringify(rules, null, 2));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
