import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const subs = await prisma.subscription.findMany({
        where: { customPrice: 240 }
    });
    console.log("Subscriptions with customPrice 240:", subs.length);
    
    const allSubs = await prisma.subscription.findMany();
    console.log("All subs count:", allSubs.length);
    if (allSubs.length > 0) {
        console.log("Sample sub customPrice:", allSubs[0].customPrice);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
