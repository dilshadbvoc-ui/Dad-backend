import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
    const job = await prisma.importJob.findFirst({
        orderBy: { createdAt: 'desc' }
    });

    if (job) {
        console.log(`Job ID: ${job.id}`);
        console.log(`Status: ${job.status}`);
        console.log(`Success: ${job.successCount}, Failure: ${job.failureCount}`);
        if (job.errors && (job.errors as any).length > 0) {
            console.log('Errors:', JSON.stringify(job.errors, null, 2));
        }
        console.log(`Mapping: ${JSON.stringify(job.mapping, null, 2)}`);
    }

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
