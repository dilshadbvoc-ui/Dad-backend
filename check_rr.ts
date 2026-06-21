const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.assignmentRule.findMany({
    where: {
      distributionType: 'campaign_users',
      isActive: true
    },
    select: {
      id: true,
      name: true,
      lastAssignedUserId: true,
      assignTo: true
    }
  });

  for (const r of rules) {
    if (r.assignTo && r.assignTo.users && r.assignTo.users.includes('5803ca9e-918d-4019-9d4e-0b35f6bbe142') || r.assignTo?.users?.includes('27725d08-54e5-4404-ae79-dab9cddf01d9')) {
       console.log(`Rule: ${r.name}`);
       console.log(`Last Assigned: ${r.lastAssignedUserId}`);
       console.log(`Users in rule: ${r.assignTo.users.length}`);

       // Get Prisma's default sort order for these users
       const users = await prisma.user.findMany({
          where: { id: { in: r.assignTo.users } },
          select: { id: true, firstName: true }
       });
       console.log(`Prisma order: `);
       users.forEach((u, i) => console.log(`  ${i}: ${u.firstName}`));
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
