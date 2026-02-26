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

    static async getManagerDailyStats(managerId: string, organisationId: string) {
        const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
        const userIds = await getVisibleUserIds(managerId);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // 1. New Leads by User
        const leads = await prisma.lead.findMany({
            where: {
                organisationId,
                assignedToId: { in: userIds },
                createdAt: { gte: today, lt: tomorrow },
                isDeleted: false
            },
            select: { assignedToId: true, stage: true }
        });

        // 2. Won Opportunities by User
        const wonOpps = await prisma.opportunity.findMany({
            where: {
                organisationId,
                ownerId: { in: userIds },
                stage: 'closed_won',
                updatedAt: { gte: today, lt: tomorrow }
            },
            select: { ownerId: true, amount: true }
        });

        // Grouping logic
        const userStats: Record<string, any> = {};
        for (const id of userIds) {
            userStats[id] = { leads: 0, revenue: 0, stages: {} };
        }

        leads.forEach(l => {
            if (l.assignedToId) {
                userStats[l.assignedToId].leads++;
                const stage = l.stage || 'new';
                userStats[l.assignedToId].stages[stage] = (userStats[l.assignedToId].stages[stage] || 0) + 1;
            }
        });

        wonOpps.forEach(o => {
            if (o.ownerId) {
                userStats[o.ownerId].revenue += (o.amount || 0);
            }
        });

        // Get user names
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true }
        });

        const formattedStats = users.map(u => ({
            name: `${u.firstName} ${u.lastName}`,
            leads: userStats[u.id].leads,
            revenue: userStats[u.id].revenue,
            stages: userStats[u.id].stages
        })).filter(s => s.leads > 0 || s.revenue > 0);

        return {
            teamStats: formattedStats,
            totalLeads: leads.length,
            totalRevenue: wonOpps.reduce((sum, o) => sum + (o.amount || 0), 0),
            date: today.toLocaleDateString()
        };
    }

    static formatManagerReport(stats: any, managerName: string) {
        let report = `👔 *Manager Daily Report: ${managerName}*\n📅 Date: ${stats.date}\n\n`;

        if (stats.teamStats.length === 0) {
            report += "No business activity recorded for the team today.\n";
        } else {
            stats.teamStats.forEach((user: any) => {
                report += `👤 *${user.name}*\n`;
                report += `- New Leads: ${user.leads}\n`;
                report += `- Revenue: ₹${user.revenue.toLocaleString()}\n`;
                if (Object.keys(user.stages).length > 0) {
                    const stages = Object.entries(user.stages).map(([s, c]) => `${s}: ${c}`).join(', ');
                    report += `- Stages: ${stages}\n`;
                }
                report += '\n';
            });

            report += `📊 *Team Totals*\n`;
            report += `- Total Leads: ${stats.totalLeads}\n`;
            report += `- Total Revenue: ₹${stats.totalRevenue.toLocaleString()}\n`;
        }

        report += `\n_Generated by Sales Intelligence_`;
        return report;
    }
}
