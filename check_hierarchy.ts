import { PrismaClient } from './src/generated/client';
const prisma = new PrismaClient();

async function checkHierarchy() {
  const users = await prisma.user.findMany({
    where: { 
        OR: [
            { email: 'rinsna@gmail.com' },
            { email: 'tim@prohostix.com' },
            { role: 'admin' },
            { role: 'super_admin' }
        ]
    },
    select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        reportsToId: true,
        organisationId: true
    }
  });

  console.log('User Hierarchy Info:', JSON.stringify(users, null, 2));
}

checkHierarchy()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
