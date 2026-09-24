import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const landing = await prisma.landingPage.findMany();
    console.log("Landing Pages:", JSON.stringify(landing, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
