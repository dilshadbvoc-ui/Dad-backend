import cron from 'node-cron';
import { prisma } from '../config/prisma';

export const initCronJobs = () => {
    // Run every day at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
        console.log('[Cron] Running daily lead rollover...');
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // Find leads with nextFollowUp < Today AND status != converted
            const overdueLeads = await prisma.lead.findMany({
                where: {
                    status: { not: 'converted' },
                    nextFollowUp: {
                        lt: today
                    }
                }
            });

            console.log(`[Cron] Found ${overdueLeads.length} leads with overdue follow-ups.`);

            if (overdueLeads.length > 0) {
                // Bulk update to set nextFollowUp to Today
                const updateResult = await prisma.lead.updateMany({
                    where: {
                        status: { not: 'converted' },
                        nextFollowUp: {
                            lt: today
                        }
                    },
                    data: {
                        nextFollowUp: today
                    }
                });

                console.log(`[Cron] Rolled over ${updateResult.count} leads to today.`);
            }
        } catch (error) {
            console.error('[Cron] Error running daily lead rollover:', error);
        }
    });

    console.log('[Cron] Daily lead rollover job scheduled.');
};
