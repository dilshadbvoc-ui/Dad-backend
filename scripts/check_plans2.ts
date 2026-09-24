import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const plans = await prisma.subscriptionPlan.findMany();
    console.log("Plans:", plans.map(p => ({ id: p.id, name: p.name, price: p.price, pricePerUser: p.pricePerUser, billingType: p.billingType })));
    
    // Check License table just in case there's a hardcoded amount
    const licenses = await prisma.license.findMany({ take: 5, select: { amount: true, perUserPrice: true } });
    console.log("Licenses:", licenses);
}

main().catch(console.error).finally(() => prisma.$disconnect());
