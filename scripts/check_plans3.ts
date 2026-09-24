import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const plans = await prisma.subscriptionPlan.findMany();
    console.log("Plans:", plans.map(p => ({ id: p.id, name: p.name, price: p.price, pricePerUser: p.pricePerUser, billingType: p.billingType })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
