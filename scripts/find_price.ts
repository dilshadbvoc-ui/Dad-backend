import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.subscriptionPlan.findMany();
  console.log('Subscription Plans:', plans);

  const products = await prisma.product.findMany();
  console.log('Products:', products);

  const licenses = await prisma.license.findMany();
  console.log('Licenses with customPrice 240:', licenses.filter(l => l.customPrice === 240).length);
  
  // also check if any plan has price 240
  console.log('Plans with price 240:', plans.filter(p => p.price === 240).length);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
