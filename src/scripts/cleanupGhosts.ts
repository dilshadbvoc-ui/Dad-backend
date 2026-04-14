import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function cleanup() {
    console.log('--- Starting Ghost Call Cleanup ---');
    
    // 1. Find all 0-duration completed outbound calls from today
    const ghostCandidates = await prisma.interaction.findMany({
        where: {
            type: 'call',
            direction: 'outbound',
            duration: 0,
            callStatus: 'completed',
            isDeleted: false,
            date: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)) // Today only to be safe
            }
        },
        orderBy: { date: 'desc' }
    });

    console.log(`Found ${ghostCandidates.length} potential ghost candidates today.`);

    let deletedCount = 0;

    for (const ghost of ghostCandidates) {
        if (!ghost.phoneNumber) continue;

        const phoneSuffix = ghost.phoneNumber.replace(/[^0-9]/g, '').slice(-10);
        if (phoneSuffix.length < 10) continue;

        // 2. UNCONDITIONAL PURGE (v3.0): Delete ANY 0-duration outbound today.
        // There is no scenario where a 0-sec outbound without audio is useful in the CRM.
        console.log(`Deleting isolated ghost ${ghost.id} (at ${ghost.date.toISOString()}) for phone ${ghost.phoneNumber}`);
        await prisma.interaction.update({
            where: { id: ghost.id },
            data: { isDeleted: true }
        });
        deletedCount++;
    }

    console.log(`--- Cleanup Complete: ${deletedCount} duplicates removed ---`);
}

cleanup()
    .catch(err => console.error('Cleanup error:', err))
    .finally(() => prisma.$disconnect());
