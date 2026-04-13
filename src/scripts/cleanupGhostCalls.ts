import { PrismaClient } from '../generated/client';
const prisma = new PrismaClient();

async function cleanup() {
    console.log('Starting cleanup of orphaned "initiated" interactions...');
    
    // Threshold: 24 hours ago
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
        const orphanedCount = await prisma.interaction.count({
            where: {
                callStatus: 'initiated',
                createdAt: {
                    lt: threshold
                }
            }
        });

        console.log(`Found ${orphanedCount} orphaned interactions.`);

        if (orphanedCount > 0) {
            const result = await prisma.interaction.updateMany({
                where: {
                    callStatus: 'initiated',
                    createdAt: {
                        lt: threshold
                    }
                },
                data: {
                    callStatus: 'abandoned',
                    description: {
                        set: 'Automatically marked as abandoned by system cleanup.'
                    }
                }
            });
            console.log(`Successfully updated ${result.count} interactions to "abandoned".`);
        } else {
            console.log('No orphaned interactions to clean up.');
        }

    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
