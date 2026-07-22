import prisma from './src/config/prisma';

async function main() {
    const org = await prisma.organisation.findFirst({ select: { shufflerConfig: true } });
    console.log(JSON.stringify(org, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
