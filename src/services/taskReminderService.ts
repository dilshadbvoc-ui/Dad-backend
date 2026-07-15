
import prisma from '../config/prisma';
import { TaskStatus } from '../generated/client';
import { NotificationService } from './notificationService';

export class TaskReminderService {
    /**
     * Send reminders for tasks due today or overdue
     */
    static async sendDailyReminders() {
        // Feature disabled as per user request (Task module removed)
        console.log('[TaskReminderService] Task reminders disabled.');
        return 0;
    }
}
