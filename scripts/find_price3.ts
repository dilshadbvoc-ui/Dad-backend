import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany();
  console.log('Products:', products.map(p => ({name: p.name, basePrice: p.basePrice})));

  const users = await prisma.user.findMany();
  console.log('Users count:', users.length);

  const orgs = await prisma.organisation.findMany();
  console.log('Orgs count:', orgs.length);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
