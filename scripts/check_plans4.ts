import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const plans = await prisma.subscriptionPlan.findMany();
    console.log("Plans detailed:", JSON.stringify(plans, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
