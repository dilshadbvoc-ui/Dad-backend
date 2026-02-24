import prisma from '../config/prisma';

export class ReportingService {
    static async getDailyStats(organisationId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // 1. New Leads Today
        const newLeads = await prisma.lead.count({
            where: {
                organisationId,
                createdAt: { gte: today, lt: tomorrow },
                isDeleted: false
            }
        });

        // 2. Opportunities Won Today
        const wonOpps = await prisma.opportunity.findMany({
            where: {
                organisationId,
                stage: 'closed_won',
                updatedAt: { gte: today, lt: tomorrow }
            },
            select: { amount: true }
        });

        const revenueToday = wonOpps.reduce((sum, opp) => sum + (opp.amount || 0), 0);
        const conversionsToday = wonOpps.length;

        // 3. Open Tasks
        const pendingTasks = await prisma.task.count({
            where: {
                organisationId,
                status: { not: 'completed' },
                isDeleted: false
            }
        });

        // 4. Overdue Tasks
        const overdueTasks = await prisma.task.count({
            where: {
                organisationId,
                status: { not: 'completed' },
                dueDate: { lt: today },
                isDeleted: false
            }
        });

        // 5. Overall Pipeline
        const pipelineResult = await prisma.opportunity.aggregate({
            where: {
                organisationId,
                stage: { notIn: ['closed_won', 'closed_lost'] }
            },
            _sum: { amount: true }
        });

        return {
            newLeads,
            revenueToday,
            conversionsToday,
            pendingTasks,
            overdueTasks,
            pipelineValue: pipelineResult._sum.amount || 0,
            date: today.toLocaleDateString()
        };
    }

    static formatWhatsAppReport(stats: any, orgName: string) {
        return `📊 *Daily Report: ${orgName}*
📅 Date: ${stats.date}

📈 *Sales & Leads*
- New Leads: ${stats.newLeads}
- Deals Won: ${stats.conversionsToday}
- Revenue: ₹${stats.revenueToday.toLocaleString()}

📝 *Tasks*
- Pending Tasks: ${stats.pendingTasks}
- Overdue: ${stats.overdueTasks}

💰 *Pipeline*
- Active Pipeline: ₹${stats.pipelineValue.toLocaleString()}

_Powered by CRM Automation_`;
    }
}
