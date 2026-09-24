import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const licenses = await prisma.license.findMany({
        where: { customPrice: 240 }
    });
    console.log("Licenses with customPrice 240:", licenses.length);
    
    const allLicenses = await prisma.license.findMany({ take: 5, select: { customPrice: true } });
    console.log("All licenses customPrices:", allLicenses);
}

main().catch(console.error).finally(() => prisma.$disconnect());
