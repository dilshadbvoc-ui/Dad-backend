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
      email: true,
      isOffDuty: true,
      workingHours: true,
      timezone: true
    }
  });
  console.log(JSON.stringify(users, null, 2));

  // Also let's check assignment rules they are a part of (by checking the 'users' relation on AssignmentRule)
  const rules = await prisma.assignmentRule.findMany({
    where: {
      users: {
        some: {
          id: { in: users.map(u => u.id) }
        }
      }
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      distributionType: true,
      targetRole: true,
      branchId: true,
      assignTo: true
    }
  });
  console.log("Rules: ", JSON.stringify(rules, null, 2));

}
main().catch(console.error).finally(() => prisma.$disconnect());
