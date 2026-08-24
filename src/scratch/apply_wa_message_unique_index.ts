import prisma from '../config/prisma';

async function main() {
    console.log('Creating unique index CONCURRENTLY on WhatsAppMessage(organisationId, waMessageId)...');
    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppMessage_organisationId_waMessageId_key"
        ON "WhatsAppMessage"("organisationId", "waMessageId");
    `);
    console.log('Index created successfully.');

    const check = await prisma.$queryRawUnsafe(`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'WhatsAppMessage' AND indexname = 'WhatsAppMessage_organisationId_waMessageId_key';
    `);
    console.log('Verified index:', JSON.stringify(check, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1); });
