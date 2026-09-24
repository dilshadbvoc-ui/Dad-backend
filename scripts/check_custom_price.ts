import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const orgs = await prisma.organisation.findMany({
        where: { OR: [{ customPrice: 240 }, { customPrice: 299 }] }
    });
    console.log("Orgs with customPrice:", orgs.length, orgs.map(o => o.name));
}

main().catch(console.error).finally(() => prisma.$disconnect());
