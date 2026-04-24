import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const jobs = await prisma.importJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    console.log('Latest Import Jobs:');
    jobs.forEach(job => {
        console.log(`- ID: ${job.id}, Status: ${job.status}, Success: ${job.successCount}, Fail: ${job.failureCount}, Created: ${job.createdAt}`);
        if (job.errors && (job.errors as any).length > 0) {
            console.log('  Errors:', JSON.stringify((job.errors as any).slice(0, 2), null, 2));
        }
    });

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
