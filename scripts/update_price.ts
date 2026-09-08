import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
  // Just showing the current state for licenses
  const allLicenses = await prisma.license.findMany({
    include: {
      plan: true
    }
  });
  
  console.log('Total licenses:', allLicenses.length);
  const withCustomPrice = allLicenses.filter(l => l.customPrice !== null);
  console.log('Licenses with custom price:', withCustomPrice.length);
  if (withCustomPrice.length > 0) {
      console.log('Custom prices found:', [...new Set(withCustomPrice.map(l => l.customPrice))]);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
