
import prisma from '../config/prisma';
import { TaskStatus } from '../generated/client';
import { NotificationService } from './notificationService';

export class TaskReminderService {
    /**
     * Send reminders for tasks due today or overdue
     */
    static async sendDailyReminders() {
        try {
            console.log('[TaskReminderService] Running daily task reminders...');

            const now = new Date();
            const endOfToday = new Date(now);
            endOfToday.setHours(23, 59, 59, 999);

            // Find pending tasks due today or previously
            const pendingTasks = await prisma.task.findMany({
                where: {
                    status: {
                        in: [TaskStatus.not_started, TaskStatus.in_progress]
                    },
                    isDeleted: false,
                    dueDate: {
                        lte: endOfToday
                    },
                    assignedToId: { not: null }
                },
                include: {
                    assignedTo: {
                        select: { id: true, firstName: true, lastName: true }
                    }
                }
            });

            console.log(`[TaskReminderService] Found ${pendingTasks.length} pending tasks for reminders.`);

            for (const task of pendingTasks) {
                if (!task.assignedToId) continue;

                const isOverdue = task.dueDate! < new Date();
                const title = isOverdue ? '⚠️ Overdue Task' : '📅 Task Due Today';
                const message = `Task: "${task.subject}" is ${isOverdue ? 'overdue' : 'due today'}. Please review.`;

                await NotificationService.send(
                    task.assignedToId,
                    title,
                    message,
                    'reminder'
                ).catch(err => console.error(`[TaskReminderService] Failed to notify user ${task.assignedToId}:`, err));
            }

            return pendingTasks.length;
        } catch (error) {
            console.error('[TaskReminderService] Error:', error);
            throw error;
        }
    }
}
