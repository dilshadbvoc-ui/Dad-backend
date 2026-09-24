import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const plans = await prisma.subscriptionPlan.findMany();
    console.log("Plans:", plans.map(p => ({ id: p.id, name: p.name, price: p.price, interval: p.interval })));
    
    // Check if there's any other pricing logic
    const licenses = await prisma.license.findMany({ take: 5 });
    console.log("Licenses count:", licenses.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
