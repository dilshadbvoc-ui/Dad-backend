import { PrismaClient } from './src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { organisation: true }
    });
    console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
