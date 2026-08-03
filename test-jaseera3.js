const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'jaseera032@gmail.com' }
    });
    
    const jobs = await prisma.importJob.findMany({
        where: {
            createdById: user.id
        }
    });
    
    console.log(`Found ${jobs.length} import jobs for Jaseera`);
    jobs.forEach(j => {
        console.log(`- ID: ${j.id}, Status: ${j.status}, Date: ${j.createdAt}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
