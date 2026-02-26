import prisma from '../config/prisma';
import { NotificationService } from './notificationService';

export class FollowUpNotificationService {
    static async notifyUpcomingFollowUps() {
        try {
            const now = new Date();
            const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);
            const fortyFiveMinsFromNow = new Date(now.getTime() + 45 * 60 * 1000);

            // Find leads with follow-up in the next 30-45 minutes that haven't been notified
            const leads = await prisma.lead.findMany({
                where: {
                    nextFollowUp: {
                        gte: thirtyMinsFromNow,
                        lte: fortyFiveMinsFromNow
                    },
                    status: { not: 'converted' },
                    isDeleted: false
                },
                include: {
                    assignedTo: { select: { id: true, firstName: true } }
                }
            });

            for (const lead of leads) {
                if (lead.assignedToId) {
                    await NotificationService.send(
                        lead.assignedToId,
                        'Upcoming Follow-up 📞',
                        `You have a follow-up with ${lead.firstName} ${lead.lastName || ''} in ~30 minutes.`,
                        'reminder'
                    );
                }
            }
        } catch (error) {
            console.error('[FollowUpNotificationService] Error:', error);
        }
    }
}
