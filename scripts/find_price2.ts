import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.subscriptionPlan.findMany();
  console.log('Subscription Plans Prices:', plans.map(p => ({name: p.name, price: p.price})));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
