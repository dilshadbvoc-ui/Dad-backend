import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        // Leads
        const totalLeads = await prisma.lead.count({
            where: { organisationId: orgId, isDeleted: false }
        });
        const newLeads = await prisma.lead.count({
            where: { organisationId: orgId, isDeleted: false, status: 'new' }
        });
        const convertedLeads = await prisma.lead.count({
            where: { organisationId: orgId, isDeleted: false, status: 'converted' }
        });

        // Opportunities
        const totalOpportunities = await prisma.opportunity.count({
            where: { organisationId: orgId }
        });
        const wonOpportunities = await prisma.opportunity.count({
            where: { organisationId: orgId, stage: 'closed_won' }
        });

        // Pipeline Value (Sum of amount) - Prisma aggregate
        const pipelineResult = await prisma.opportunity.aggregate({
            where: { organisationId: orgId },
            _sum: { amount: true }
        });
        const pipelineValue = pipelineResult._sum.amount || 0;

        // Contacts
        const totalContacts = await prisma.contact.count({
            where: { organisationId: orgId }
        });

        // Accounts
        const totalAccounts = await prisma.account.count({
            where: { organisationId: orgId }
        });

        res.json({
            // Flat structure
            totalLeads,
            activeOpportunities: totalOpportunities,
            salesRevenue: pipelineValue,
            winRate: totalOpportunities > 0 ? Math.round((wonOpportunities / totalOpportunities) * 100) : 0,

            // Nested structure
            leads: { total: totalLeads, new: newLeads, converted: convertedLeads },
            opportunities: { total: totalOpportunities, value: pipelineValue, won: wonOpportunities },
            contacts: { total: totalContacts },
            accounts: { total: totalAccounts }
        });
    } catch (error) {
        console.error('getDashboardStats Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getSalesChartData = async (req: Request, res: Response) => {
    try {
        console.log('[Analytics] Requesting Sales Chart Data');
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            console.error('[Analytics] Org ID missing for user:', user.id);
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // Go back 5 months to include current month = 6 total
        sixMonthsAgo.setDate(1); // Start of that month
        sixMonthsAgo.setHours(0, 0, 0, 0);

        // Fetch closed_won opportunities
        const wonOpportunities = await prisma.opportunity.findMany({
            where: {
                organisationId: orgId,
                stage: 'closed_won',
                OR: [
                    { closeDate: { gte: sixMonthsAgo } },
                    { updatedAt: { gte: sixMonthsAgo } }
                ]
            },
            select: {
                amount: true,
                closeDate: true,
                updatedAt: true
            }
        });

        // Initialize last 6 months buckets
        const monthlyData = new Map<string, number>();
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        for (let i = 0; i < 6; i++) {
            const d = new Date(sixMonthsAgo);
            d.setMonth(d.getMonth() + i);
            const key = `${d.getFullYear()}-${d.getMonth()}`; // Unique key per month-year
            monthlyData.set(key, 0);
        }

        // Fill data
        for (const opp of wonOpportunities) {
            const date = new Date(opp.closeDate || opp.updatedAt);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (monthlyData.has(key)) {
                monthlyData.set(key, (monthlyData.get(key) || 0) + (opp.amount || 0));
            }
        }

        // Format for frontend
        const formattedData = Array.from(monthlyData.entries()).map(([key, total]) => {
            const [year, monthIndex] = key.split('-').map(Number);
            return {
                name: monthNames[monthIndex],
                total,
                fullDate: key // helpful validation
            };
        });

        console.log(`[Analytics] Sales Chart returning ${formattedData.length} points.`);
        res.json(formattedData);
    } catch (error) {
        console.error('getSalesChartData Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getTopLeads = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const topLeads = await prisma.lead.findMany({
            where: {
                organisationId: orgId,
                isDeleted: false
            },
            orderBy: { leadScore: 'desc' },
            take: 5,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                company: true,
                email: true,
                leadScore: true
            }
        });

        res.json(topLeads);
    } catch (error) {
        console.error('getTopLeads Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getSalesForecast = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        // Get open opportunities (not closed_won or closed_lost)
        const openOpportunities = await prisma.opportunity.findMany({
            where: {
                organisationId: orgId,
                stage: { notIn: ['closed_won', 'closed_lost'] }
            },
            select: {
                amount: true,
                probability: true
            }
        });

        let totalPipeline = 0;
        let weightedForecast = 0;

        for (const opp of openOpportunities) {
            const amount = opp.amount || 0;
            const probability = opp.probability || 0;
            totalPipeline += amount;
            weightedForecast += amount * (probability / 100);
        }

        res.json({
            weightedForecast: Math.round(weightedForecast),
            totalPipeline
        });
    } catch (error) {
        console.error('getSalesForecast Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getLeadSourceAnalytics = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        // Prisma groupBy for lead sources
        const sourceStats = await prisma.lead.groupBy({
            by: ['source'],
            where: {
                organisationId: orgId,
                isDeleted: false
            },
            _count: { source: true },
            orderBy: { _count: { source: 'desc' } }
        });

        const formattedStats = sourceStats.map(stat => ({
            source: stat.source || 'Unknown',
            count: stat._count.source
        }));

        res.json(formattedStats);
    } catch (error) {
        console.error('getLeadSourceAnalytics Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getAiInsights = async (req: Request, res: Response) => {
    try {
        console.log('[Analytics] Requesting AI Insights');
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const insights = [];

        // 1. Top Lead Source Analysis
        const topSource = await prisma.lead.groupBy({
            by: ['source'],
            where: { organisationId: orgId, isDeleted: false },
            _count: { source: true },
            orderBy: { _count: { source: 'desc' } },
            take: 1
        });

        if (topSource.length > 0) {
            insights.push({
                type: 'positive',
                title: `Focus on '${topSource[0].source}' Leads`,
                description: `Leads from ${topSource[0].source} are your top volume source (${topSource[0]._count.source} leads). Consider increasing budget here.`,
                icon: 'Target'
            });
        }

        // 2. Stagnation Check (Deals in 'prospecting' or 'qualified' for > 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const stagnantDeals = await prisma.opportunity.count({
            where: {
                organisationId: orgId,
                stage: { in: ['prospecting', 'qualified'] },
                updatedAt: { lt: thirtyDaysAgo }
            }
        });

        if (stagnantDeals > 0) {
            insights.push({
                type: 'warning',
                title: 'Pipeline Stagnation',
                description: `You have ${stagnantDeals} deals that haven't moved in 30 days. Follow up to unblock revenue.`,
                icon: 'AlertCircle'
            });
        }

        // 3. High Value Deal Alert
        const highValueDeals = await prisma.opportunity.findMany({
            where: {
                organisationId: orgId,
                stage: { notIn: ['closed_won', 'closed_lost'] },
                amount: { gt: 10000 } // Arbitrary threshold, could be dynamic based on avg
            },
            take: 2,
            orderBy: { amount: 'desc' },
            select: { name: true, amount: true }
        });

        if (highValueDeals.length > 0) {
            const dealNames = highValueDeals.map(d => d.name).join(', ');
            insights.push({
                type: 'info',
                title: 'High Value Opportunities',
                description: `Key focuses: ${dealNames}. Closing these acts as a major revenue booster.`,
                icon: 'TrendingUp'
            });
        }

        // Fallback if no data
        if (insights.length === 0) {
            insights.push({
                type: 'info',
                title: 'Gathering Data',
                description: 'Add more leads and opportunities to generate smart insights.',
                icon: 'Brain'
            });
        }

        res.json(insights);
    } catch (error) {
        console.error('getAiInsights Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};