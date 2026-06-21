const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: 'MAHRIN' } },
        { firstName: { contains: 'NANDHANA' } },
        { email: { contains: 'AM45' } },
        { email: { contains: 'AM08' } }
      ]
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      isOffDuty: true,
      role: true,
      dailyLeadQuota: true,
      leadQuotaTracking: true,
    }
  });
  console.log("Users:", JSON.stringify(users, null, 2));

  if (users.length > 0) {
    const metrics = await prisma.assignmentRuleMetrics.findMany({
      where: {
        userId: { in: users.map(u => u.id) }
      }
    });
    console.log("Metrics:", JSON.stringify(metrics, null, 2));

    const rules = await prisma.assignmentRule.findMany({
      where: {
        users: {
          some: {
            id: { in: users.map(u => u.id) }
          }
        }
      },
      include: {
        users: {
          select: { id: true, firstName: true }
        }
      }
    });
    console.log("Rules:", JSON.stringify(rules, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
