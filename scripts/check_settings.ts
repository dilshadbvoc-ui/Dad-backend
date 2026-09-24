import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.systemSetting.findMany();
    console.log("Settings:", JSON.stringify(settings, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
