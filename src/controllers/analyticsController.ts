import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getVisibleUserIds, getLeadVisibilityFilter, getOppVisibilityFilter } from '../utils/hierarchyUtils';
import { isSuperAdmin as checkSuperAdmin } from '../utils/roleUtils';
import fs from 'fs';
import path from 'path';

const logDebug = (msg: string) => {
    try {
        const logPath = path.join(__dirname, '../../debug_crash.log');
        fs.appendFileSync(logPath, `${new Date().toISOString()} - ${msg}\n`);
    } catch (e) {
        console.error('Failed to write log', e);
    }
};

// Helper to get branch filter
const getBranchFilter = (req: Request) => {
    const branchId = req.query.branchId as string;
    return branchId ? { branchId } : {};
};

// Helper to get date filter
const getDateFilter = (req: Request, dateField: string) => {
    const month = req.query.month as string; // Expect "YYYY-MM" or "all"
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (month && month !== 'all') {
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const monthIndex = parseInt(monthStr, 10) - 1;

        const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
        start.setMinutes(start.getMinutes() - 330); // Shift to match IST start

        const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
        end.setMinutes(end.getMinutes() - 330); // Shift to match IST end

        return { [dateField]: { gte: start, lt: end } };
    }

    if (startDate || endDate) {
        const filter: any = {};
        if (startDate) {
            const sDate = new Date(String(startDate));
            sDate.setUTCHours(0, 0, 0, 0);
            filter.gte = sDate;
        }
        if (endDate) {
            const eDate = new Date(String(endDate));
            eDate.setUTCHours(23, 59, 59, 999);
            filter.lte = eDate;
        }
        return { [dateField]: filter };
    }

    return null;
};

export const getDashboardStats = async (req: Request, res: Response) => {
    logDebug('Entered getDashboardStats');
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const isSuperAdmin = checkSuperAdmin(user);
        logDebug(`[Analytics] User: ${user?.id}, Org: ${orgId}, SuperAdmin: ${isSuperAdmin}`);

        const branchFilter = getBranchFilter(req);
        
        logDebug('[Analytics] Importing hierarchyUtils...');
        const { getVisibleUserIds } = await import('../utils/hierarchyUtils');

        logDebug('[Analytics] Fetching visibleUserIds...');
        const visibleUserIds = await getVisibleUserIds(user.id);
        logDebug(`[Analytics] Visible users: ${visibleUserIds.length}`);

        if (!orgId && !isSuperAdmin) {
            logDebug('[Analytics] No Org ID');
            return res.status(400).json({ message: 'Organisation not found' });
        }

        // Build org filter - super admin sees all orgs
        const orgFilter = orgId ? { organisationId: orgId } : {};
        const combinedFilter = { ...orgFilter, ...branchFilter };

        // Base filter matching leadController
        const { getLeadVisibilityFilter, getOppVisibilityFilter } = await import('../utils/hierarchyUtils');
        const visibilityFilter = await getLeadVisibilityFilter(user, isSuperAdmin);
        const oppVisibilityFilter = await getOppVisibilityFilter(user, isSuperAdmin);

        // Current Month Dates (Aligned to IST)
        const startOfMonth = new Date();
        startOfMonth.setMinutes(startOfMonth.getMinutes() + 330); // Shift to IST
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        startOfMonth.setMinutes(startOfMonth.getMinutes() - 330); // Shift back to UTC

        const startOfLastMonth = new Date(startOfMonth);
        startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

        // Build Payment Filter
        const paymentFilter: any = {
            ...(orgId ? { organisationId: orgId } : {})
        };
        if (branchFilter.branchId) {
            paymentFilter.opportunity = { branchId: branchFilter.branchId };
        }
        if (Object.keys(oppVisibilityFilter).length > 0) {
            paymentFilter.opportunity = { 
                ...(paymentFilter.opportunity || {}), 
                ...oppVisibilityFilter 
            };
        }

        const oppDateFilter = getDateFilter(req, 'closeDate');
        const paymentDateFilter = getDateFilter(req, 'paymentDate');

        // Follow-up Date Filter (always due today or overdue only, aligned timezone-independently to IST)
        const followUpDueDate = {
            lte: (() => {
                const now = new Date();
                const istTime = now.getTime() + (5.5 * 60 * 60 * 1000);
                const istDate = new Date(istTime);
                const endOfTodayIST = new Date(Date.UTC(
                    istDate.getUTCFullYear(),
                    istDate.getUTCMonth(),
                    istDate.getUTCDate(),
                    23, 59, 59, 999
                ));
                return new Date(endOfTodayIST.getTime() - (5.5 * 60 * 60 * 1000));
            })()
        };

        // Follow-up Branch Filter (checking related entities' branches)
        const followUpBranchFilter = branchFilter.branchId ? {
            OR: [
                { branchId: branchFilter.branchId },
                { lead: { branchId: branchFilter.branchId } },
                { opportunity: { branchId: branchFilter.branchId } },
                { contact: { branchId: branchFilter.branchId } },
                { account: { branchId: branchFilter.branchId } }
            ]
        } : {};

        // Follow-up Visibility Filter matching followUpController.ts
        const followUpVisibilityFilter = !isSuperAdmin && user.role !== 'admin' ? {
            OR: [
                { assignedToId: { in: visibleUserIds } },
                { createdById: { in: visibleUserIds } },
                { lead: { assignedToId: { in: visibleUserIds }, isDeleted: false } },
                { contact: { ownerId: { in: visibleUserIds } } },
                { account: { ownerId: { in: visibleUserIds } } },
                { opportunity: { ownerId: { in: visibleUserIds } } }
            ]
        } : {};

        // Group independent queries to run concurrently
        const [
            totalLeads,
            newLeads,
            convertedLeads,
            revenueResult,
            pipelineResult,
            totalContacts,
            totalAccounts,
            prevLeads,
            prevRevenueResult,
            totalClosedCurrent,
            wonCurrent,
            wonTotal,
            lostTotal,
            activeOpportunitiesCount,
            totalOpportunitiesCount,
            revenueThisMonthResult,
            pendingFollowUpsCount
        ] = await Promise.all([
            // Leads
            prisma.lead.count({ where: { ...combinedFilter, isDeleted: false, ...visibilityFilter } }),
            prisma.lead.count({ where: { ...combinedFilter, isDeleted: false, status: 'new', ...visibilityFilter } }),
            prisma.lead.count({ where: { ...combinedFilter, isDeleted: false, status: { in: ['converted', 'won', 'lost'] }, ...visibilityFilter } }),

            // Revenue calculation and trend (Payments)
            prisma.paymentRecord.aggregate({
                where: {
                    ...paymentFilter,
                    ...(paymentDateFilter ? paymentDateFilter : { paymentDate: { lte: new Date() } })
                },
                _sum: { amount: true }
            }),

            // Pipeline Value
            prisma.opportunity.aggregate({
                where: { 
                    ...combinedFilter, 
                    isDeleted: false, 
                    ...oppVisibilityFilter,
                    ...(oppDateFilter ? oppDateFilter : {})
                },
                _sum: { amount: true }
            }),

            // Contacts/Accounts
            prisma.contact.count({
                where: { ...combinedFilter, isDeleted: false, ...(!isSuperAdmin && user.role !== 'admin' ? { ownerId: { in: visibleUserIds } } : {}) }
            }),
            prisma.account.count({
                where: { ...combinedFilter, isDeleted: false, ...(!isSuperAdmin && user.role !== 'admin' ? { ownerId: { in: visibleUserIds } } : {}) }
            }),

            // Previous Month Stats for Trends (Leads)
            prisma.lead.count({
                where: {
                    ...combinedFilter,
                    isDeleted: false,
                    createdAt: { gte: startOfLastMonth, lt: startOfMonth },
                    ...visibilityFilter
                }
            }),

            // Previous Month Stats for Trends (Revenue - Payments)
            prisma.paymentRecord.aggregate({
                where: {
                    ...paymentFilter,
                    paymentDate: { gte: startOfLastMonth, lt: startOfMonth }
                },
                _sum: { amount: true }
            }),

            // Trending Win Rate (total closed current month)
            prisma.opportunity.count({
                where: {
                    ...combinedFilter,
                    isDeleted: false,
                    stage: { in: ['closed_won', 'closed_lost'] },
                    closeDate: { gte: startOfMonth },
                    ...oppVisibilityFilter
                }
            }),

            // Trending Win Rate (won current month)
            prisma.opportunity.count({
                where: {
                    ...combinedFilter,
                    isDeleted: false,
                    stage: 'closed_won',
                    closeDate: { gte: startOfMonth },
                    ...oppVisibilityFilter
                }
            }),

            // Won/Lost for nested object
            prisma.opportunity.count({
                where: { 
                    ...combinedFilter, 
                    isDeleted: false, 
                    stage: 'closed_won', 
                    ...oppVisibilityFilter,
                    ...(oppDateFilter ? oppDateFilter : {})
                }
            }),
            prisma.opportunity.count({
                where: { 
                    ...combinedFilter, 
                    isDeleted: false, 
                    stage: 'closed_lost', 
                    ...oppVisibilityFilter,
                    ...(oppDateFilter ? oppDateFilter : {})
                }
            }),

            // Active and Total Opportunities
            prisma.opportunity.count({ 
                where: { 
                    ...combinedFilter, 
                    isDeleted: false, 
                    stage: { notIn: ['closed_won', 'closed_lost'] }, 
                    ...oppVisibilityFilter,
                    ...(oppDateFilter ? oppDateFilter : {})
                } 
            }),
            prisma.opportunity.count({ 
                where: { 
                    ...combinedFilter, 
                    isDeleted: false, 
                    ...oppVisibilityFilter,
                    ...(oppDateFilter ? oppDateFilter : {})
                } 
            }),

            // Revenue this month (Payments in current month)
            prisma.paymentRecord.aggregate({
                where: {
                    ...paymentFilter,
                    ...(paymentDateFilter ? paymentDateFilter : { paymentDate: { gte: startOfMonth } })
                },
                _sum: { amount: true }
            }),

            // Pending Follow-ups (due today/selected range, aligned to IST timezone, respecting visibility and branch)
            prisma.followUp.count({
                where: {
                    ...orgFilter,
                    ...followUpBranchFilter,
                    ...followUpVisibilityFilter,
                    isDeleted: false,
                    status: { in: ['not_started', 'in_progress'] },
                    dueDate: followUpDueDate
                }
            })
        ]);

        const totalRevenue = revenueResult._sum.amount || 0;
        const pipelineValue = pipelineResult._sum.amount || 0;
        const prevRevenue = prevRevenueResult._sum.amount || 0;
        const revenueThisMonth = revenueThisMonthResult._sum.amount || 0;
        const currentWinRate = totalClosedCurrent > 0 ? (wonCurrent / totalClosedCurrent) * 100 : 0;

        const calculateTrend = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return Math.round(((curr - prev) / prev) * 100);
        };

        res.json({
            // Flat structure
            totalLeads,
            activeOpportunities: activeOpportunitiesCount,
            pendingFollowUps: pendingFollowUpsCount,
            salesRevenue: totalRevenue,
            revenueThisMonth,
            winRate: Math.round(currentWinRate),

            // Trends
            trends: {
                revenue: calculateTrend(totalRevenue, prevRevenue),
                leads: calculateTrend(totalLeads, prevLeads),
                winRate: 0 // Win rate trend requires more historical data, 0 for now
            },

            // Nested structure
            leads: { total: totalLeads, new: newLeads, converted: convertedLeads },
            opportunities: {
                total: totalOpportunitiesCount,
                value: pipelineValue,
                won: wonTotal,
                lost: lostTotal
            },
            contacts: { total: totalContacts },
            accounts: { total: totalAccounts }
        });
    } catch (error) {
        logDebug(`getDashboardStats CRASHED: ${(error as Error).message}\nStack: ${(error as Error).stack}`);
        console.error('getDashboardStats Error:', error);
        res.status(500).json({
            message: (error as Error).message,
            debug: 'Check debug_crash.log'
        });
    }
};

export const getSalesChartData = async (req: Request, res: Response) => {
    try {
        console.log('[Analytics] Requesting Sales Chart Data');
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const isSuperAdmin = checkSuperAdmin(user);

        if (!orgId && !isSuperAdmin) {
            console.error('[Analytics] Org ID missing for user:', user.id);
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        const requestedUserId = req.query.userId as string;

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMinutes(sixMonthsAgo.getMinutes() + 330); // Shift to IST
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); 
        sixMonthsAgo.setDate(1); 
        sixMonthsAgo.setHours(0, 0, 0, 0);
        sixMonthsAgo.setMinutes(sixMonthsAgo.getMinutes() - 330); // Shift back to UTC

        // Visibility & User Filtering
        const visibilityFilter: any = {};
        if (user.role !== 'admin' && !isSuperAdmin) {
            const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
            const visibleUserIds = await getVisibleUserIds(user.id);
            
            if (requestedUserId && typeof requestedUserId === 'string') {
                // If specific user requested, verify they are in visibility scope
                if (visibleUserIds.includes(requestedUserId)) {
                    visibilityFilter.ownerId = requestedUserId;
                } else {
                    // Not authorized to see this user's data
                    return res.status(403).json({ message: 'Unauthorized access to user data' });
                }
            } else {
                visibilityFilter.ownerId = { in: visibleUserIds };
            }
        } else if (requestedUserId) {
            // Admin can see any user
            visibilityFilter.ownerId = requestedUserId;
        }

        // Fetch PaymentRecords
        const payments = await prisma.paymentRecord.findMany({
            where: {
                ...(orgId ? { organisationId: orgId as string } : {}),
                paymentDate: { gte: sixMonthsAgo },
                opportunity: {
                    ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
                    ...(visibilityFilter.ownerId ? { ownerId: visibilityFilter.ownerId } : {}),
                    isDeleted: false
                }
            },
            select: {
                amount: true,
                paymentDate: true
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
        for (const payment of payments) {
            const date = new Date(payment.paymentDate);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (monthlyData.has(key)) {
                monthlyData.set(key, (monthlyData.get(key) || 0) + (payment.amount || 0));
            }
        }

        // Format for frontend
        const formattedData = Array.from(monthlyData.entries()).map(([key, total]) => {
            const [, monthIndex] = key.split('-').map(Number);
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
        const isSuperAdmin = checkSuperAdmin(user);

        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };

        // Visibility
        const visibilityFilter: any = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.assignedToId = { in: visibleUserIds };
        }

        const topLeads = await prisma.lead.findMany({
            where: {
                ...combinedFilter,
                isDeleted: false,
                ...visibilityFilter
            },
            orderBy: { potentialValue: 'desc' },
            take: 10,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                company: true,
                email: true,
                leadScore: true,
                potentialValue: true
            }
        });

        // Format data for frontend chart (name and value)
        const formattedLeads = topLeads.map(lead => ({
            name: `${lead.firstName} ${lead.lastName || ''}`.trim() || lead.company || lead.email || 'Unknown',
            value: lead.potentialValue || 0,
            leadScore: lead.leadScore
        }));

        res.json(formattedLeads);
    } catch (error) {
        console.error('getTopLeads Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getSalesForecast = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const isSuperAdmin = checkSuperAdmin(user);

        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };

        // Visibility
        const visibilityFilter: any = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.ownerId = { in: visibleUserIds };
        }

        const oppDateFilter = getDateFilter(req, 'closeDate');

        // Get open opportunities (not closed_won or closed_lost)
        const openOpportunities = await prisma.opportunity.findMany({
            where: {
                ...combinedFilter,
                stage: { notIn: ['closed_won', 'closed_lost'] },
                isDeleted: false,
                ...visibilityFilter,
                ...(oppDateFilter ? oppDateFilter : {})
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
            weightedForecast: totalPipeline,
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
        const isSuperAdmin = checkSuperAdmin(user);

        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };

        // Hierarchy Visibility matches leadController
        const { getLeadVisibilityFilter } = await import('../utils/hierarchyUtils');
        const visibilityFilter = await getLeadVisibilityFilter(user, isSuperAdmin);

        // Prisma groupBy for lead sources
        const sourceStats = await prisma.lead.groupBy({
            by: ['source'],
            where: {
                ...combinedFilter,
                isDeleted: false,
                ...visibilityFilter
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
        const isSuperAdmin = checkSuperAdmin(user);

        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };

        // Visibility Filters for Insights
        const visibilityFilter: any = {};
        const oppVisibilityFilter: any = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.assignedToId = { in: visibleUserIds };
            oppVisibilityFilter.ownerId = { in: visibleUserIds };
        }

        const insights = [];

        // 1. Top Lead Source Analysis
        const topSource = await prisma.lead.groupBy({
            by: ['source'],
            where: { ...combinedFilter, isDeleted: false, ...visibilityFilter },
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
                ...combinedFilter,
                stage: { in: ['prospecting', 'qualified'] },
                isDeleted: false,
                updatedAt: { lt: thirtyDaysAgo },
                ...oppVisibilityFilter
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

        // 3. High Value Deal Alert - Calculate dynamic threshold based on average deal size
        const avgDealResult = await prisma.opportunity.aggregate({
            where: {
                ...combinedFilter,
                stage: { notIn: ['closed_won', 'closed_lost'] },
                isDeleted: false,
                amount: { gt: 0 },
                ...oppVisibilityFilter
            },
            _avg: { amount: true }
        });

        const avgDealSize = avgDealResult._avg?.amount || 5000;
        const highValueThreshold = avgDealSize * 2; // Deals worth 2x average are considered high value

        const highValueDeals = await prisma.opportunity.findMany({
            where: {
                ...combinedFilter,
                stage: { notIn: ['closed_won', 'closed_lost'] },
                isDeleted: false,
                amount: { gt: highValueThreshold },
                ...oppVisibilityFilter
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

export const getTopPerformers = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const isSuperAdmin = checkSuperAdmin(user);

        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        // User filter needs to be applied to `User` model, but filtered by branch?
        // Users belong to a branch. So we can filter users by branchID.
        const userCombinedFilter = { ...orgFilter, ...branchFilter };
        // For Active users
        const activeFilter = { isActive: true };

        // Hierarchy Visibility for Top Performers
        const visibilityFilter: any = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.id = { in: visibleUserIds };
        }

        const topUsers = await prisma.user.findMany({
            where: {
                ...userCombinedFilter,
                ...activeFilter,
                ...visibilityFilter
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profileImage: true,
                ownedOpportunities: {
                    where: { isDeleted: false },
                    select: {
                        paymentRecords: {
                            select: { amount: true }
                        }
                    }
                }
            }
        });

        const leaderboard = topUsers.map(u => {
            const totalRevenue = u.ownedOpportunities.reduce((sum: number, opp: any) => {
                const oppTotal = opp.paymentRecords.reduce((pSum: number, pay: any) => pSum + (pay.amount || 0), 0);
                return sum + oppTotal;
            }, 0);

            const paymentsCount = u.ownedOpportunities.reduce((count: number, opp: any) => count + opp.paymentRecords.length, 0);

            return {
                id: u.id,
                name: `${u.firstName} ${u.lastName}`,
                email: u.email,
                image: u.profileImage,
                totalRevenue,
                dealsWon: paymentsCount // Number of payments
            };
        })
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 5);

        res.json(leaderboard);
    } catch (error) {
        console.error('getTopPerformers Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getSalesBook = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const isSuperAdmin = checkSuperAdmin(user);
        const { startDate, endDate } = req.query;

        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };

        // Visibility
        const visibilityFilter: any = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.ownerId = { in: visibleUserIds };
        }

        // Date Filter
        const dateFilter: any = {};
        if (startDate || endDate) {
            dateFilter.closeDate = {};
            if (startDate) {
                const sDate = new Date(String(startDate));
                sDate.setUTCHours(0, 0, 0, 0);
                dateFilter.closeDate.gte = sDate;
            }
            if (endDate) {
                const eDate = new Date(String(endDate));
                eDate.setUTCHours(23, 59, 59, 999);
                dateFilter.closeDate.lte = eDate;
            }
        }

        const sales = await prisma.opportunity.findMany({
            where: {
                ...combinedFilter,
                stage: 'closed_won',
                isDeleted: false,
                ...visibilityFilter,
                ...dateFilter
            },
            select: {
                id: true,
                name: true,
                amount: true,
                closeDate: true,
                paymentStatus: true,
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } },
                branch: { select: { name: true } },
                emiSchedule: {
                    select: {
                        id: true,
                        totalAmount: true,
                        paidAmount: true,
                        remainingAmount: true,
                        status: true
                    }
                },
                paymentRecords: {
                    select: {
                        amount: true
                    }
                }
            },
            orderBy: { closeDate: 'desc' }
        });

        const formattedSales = sales.map(s => {
            const paymentRecordsSum = s.paymentRecords?.reduce((sum, record) => sum + record.amount, 0) || 0;

            // For EMI deals: use the HIGHER of paymentRecords sum vs emiSchedule.paidAmount.
            //
            // Why both sources exist and can diverge:
            //   Case A: Lead converted with upfront advance (partial) + EMI for remainder →
            //     PaymentRecord has the advance (e.g. ₹5000), emiSchedule.paidAmount = 0 (no installments marked yet)
            //     → paymentRecordsSum wins
            //
            //   Case B: Pure EMI deal, installment marked paid via markInstallmentPaid →
            //     emiSchedule.paidAmount updated (e.g. ₹5000), but if PaymentRecord creation failed silently →
            //     paymentRecordsSum = 0, emiSchedule.paidAmount wins
            //
            // Taking the max covers both cases safely.
            const totalPaid = s.emiSchedule
                ? Math.max(paymentRecordsSum, s.emiSchedule.paidAmount || 0)
                : paymentRecordsSum;

            // For totalDue:
            // - EMI deals: use emiSchedule.remainingAmount (tracks pending installments)
            // - Non-EMI: simple difference
            const totalDue = s.emiSchedule
                ? (s.emiSchedule.remainingAmount || 0)
                : Math.max(0, s.amount - totalPaid);

            return {
                id: s.id,
                opportunityName: s.name,
                customerName: s.account?.name || 'N/A',
                amount: s.amount,
                closeDate: s.closeDate,
                paymentStatus: s.paymentStatus || 'pending',
                totalPaid,
                totalDue,
                ownerName: s.owner ? `${s.owner.firstName} ${s.owner.lastName}` : 'Unknown',
                branchName: (s as any).branch?.name || 'N/A',
                hasEmi: !!s.emiSchedule,
                emiDetails: s.emiSchedule ? {
                    totalAmount: s.emiSchedule.totalAmount,
                    paidAmount: s.emiSchedule.paidAmount,
                    remainingAmount: s.emiSchedule.remainingAmount,
                    status: s.emiSchedule.status
                } : null
            };
        });

        res.json(formattedSales);
    } catch (error) {
        console.error('getSalesBook Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getUserWiseSales = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const isSuperAdmin = checkSuperAdmin(user);
        const { startDate, endDate } = req.query;

        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const orgFilter = orgId ? { organisationId: orgId } : {};
        // Branch filter is optional here, usually user-wise report might be global for admin, but let's respect it if passed
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };

        // Determine scope of users to report on
        let userIdsToReport: string[] = [];
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
            userIdsToReport = await getVisibleUserIds(user.id);
        } else {
            // Admin sees all active users in org (and optional branch)
            const users = await prisma.user.findMany({
                where: { ...combinedFilter, isActive: true },
                select: { id: true }
            });
            userIdsToReport = users.map(u => u.id);
        }

        // Date Filter for OPPORTUNITIES
        const dateFilter: any = {};
        if (startDate && endDate) {
            dateFilter.closeDate = {
                gte: new Date(String(startDate)),
                lte: new Date(String(endDate))
            };
        }

        // Aggregate per user
        const userStats = await Promise.all(userIdsToReport.map(async (uid) => {
            const userDetails = await prisma.user.findUnique({
                where: { id: uid },
                select: { firstName: true, lastName: true, email: true }
            });

            if (!userDetails) return null;

            const aggregates = await prisma.opportunity.aggregate({
                where: {
                    ownerId: uid,
                    stage: 'closed_won',
                    isDeleted: false,
                    ...dateFilter
                },
                _sum: { amount: true },
                _count: { id: true }
            });

            return {
                name: `${userDetails.firstName} ${userDetails.lastName}`,
                email: userDetails.email,
                totalRevenue: aggregates._sum.amount || 0,
                dealsWon: aggregates._count.id || 0
            };
        }));

        res.json(userStats.filter(Boolean));
    } catch (error) {
        console.error('getUserWiseSales Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
// Default lead-stage config used when an org hasn't configured Organisation.leadStatuses.
// Mirrors DEFAULT_LEAD_STATUSES in the frontend's useLeadStatuses hook, kept in sync manually.
const DEFAULT_LEAD_STAGES = [
    { id: 'new', label: 'New', color: '#3b82f6', order: 0 },
    { id: 'contacted', label: 'Contacted', color: '#f59e0b', order: 1 },
    { id: 'interested', label: 'Interested', color: '#10b981', order: 2 },
    { id: 'pre_qualified', label: 'Pre-qualified Lead', color: '#6366f1', order: 3 },
    { id: 'qualified', label: 'Qualified Lead', color: '#8b5cf6', order: 4 },
    { id: 'nurturing', label: 'Nurturing', color: '#ec4899', order: 5 },
    { id: 'converted', label: 'Converted', color: '#059669', order: 6 },
    { id: 'lost', label: 'Lost', color: '#6b7280', order: 7 },
    { id: 'not_interested', label: 'Not Interested', color: '#ef4444', order: 8 },
    { id: 're_enquiry', label: 'Re-Enquiry', color: '#f97316', order: 9 },
];

// GET /api/analytics/leads-by-stage
// Returns lead counts grouped by the organisation's configured pipeline stages
// (Organisation.leadStatuses), optionally filtered by branch, campaign and date range.
export const getLeadsByStage = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const { branchId, campaignId } = req.query as { branchId?: string; campaignId?: string };
        const isSuperAdmin = checkSuperAdmin(user);
        const visibilityFilter = await getLeadVisibilityFilter(user, isSuperAdmin);
        const dateFilter = getDateFilter(req, 'createdAt');

        const where: any = {
            organisationId: orgId,
            isDeleted: false,
            ...visibilityFilter,
            ...(dateFilter || {}),
        };
        if (branchId && branchId !== 'all') where.branchId = branchId;
        if (campaignId && campaignId !== 'all') {
            where.sourceDetails = { path: ['campaignName'], equals: campaignId };
        }

        const grouped = await prisma.lead.groupBy({
            by: ['status'],
            where,
            _count: { _all: true },
        });
        const countsByStatus: Record<string, number> = {};
        grouped.forEach(g => { countsByStatus[g.status] = g._count._all; });

        const org = await prisma.organisation.findUnique({
            where: { id: orgId },
            select: { leadStatuses: true },
        });
        const configuredStages = Array.isArray(org?.leadStatuses) && (org!.leadStatuses as any[]).length > 0
            ? (org!.leadStatuses as any[])
            : DEFAULT_LEAD_STAGES;

        const stages = [...configuredStages]
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
            .map((s: any) => ({
                id: s.id,
                label: s.label,
                color: s.color || '#6b7280',
                count: countsByStatus[s.id] || 0,
            }));

        const knownIds = new Set(stages.map(s => s.id));
        const untracked = Object.entries(countsByStatus)
            .filter(([id]) => !knownIds.has(id))
            .reduce((sum, [, count]) => sum + count, 0);
        if (untracked > 0) {
            stages.push({ id: 'other', label: 'Other', color: '#94a3b8', count: untracked });
        }

        const total = stages.reduce((sum, s) => sum + s.count, 0);

        res.json({ stages, total });
    } catch (error) {
        console.error('getLeadsByStage error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// GET /api/analytics/lead-campaigns
// Distinct campaign names found in Lead.sourceDetails.campaignName for this org,
// used to populate the campaign filter dropdown (no separate Campaign model is linked to Lead).
export const getLeadCampaigns = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const leads = await prisma.lead.findMany({
            where: { organisationId: orgId, isDeleted: false, sourceDetails: { not: null as any } },
            select: { sourceDetails: true },
            take: 2000,
            orderBy: { createdAt: 'desc' },
        });

        const names = new Set<string>();
        leads.forEach(l => {
            const details = l.sourceDetails as any;
            const name = details?.campaignName;
            if (typeof name === 'string' && name.trim()) names.add(name.trim());
        });

        res.json(Array.from(names).sort());
    } catch (error) {
        console.error('getLeadCampaigns error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// Resolves the same period vocabulary used by the Dashboard II date-range dropdown
// (today/yesterday/week/last30/thisMonth/custom) into a Prisma date-comparison object.
const resolvePeriodRange = (req: Request): { gte: Date; lt?: Date } => {
    const { period = 'week', startDate, endDate } = req.query as { period?: string; startDate?: string; endDate?: string };
    const now = new Date();

    switch (period) {
        case 'today':
            return { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
        case 'yesterday':
            return {
                gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
                lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            };
        case 'thisMonth':
            return { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
        case 'last30':
            return { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        case 'custom': {
            const gte = startDate ? new Date(String(startDate)) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            let lt: Date | undefined;
            if (endDate) {
                lt = new Date(String(endDate));
                lt.setHours(23, 59, 59, 999);
            }
            return { gte, lt };
        }
        case 'week':
        default:
            return { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    }
};

// GET /api/analytics/call-activity-trend
// Daily total vs connected call counts for the selected date range — powers the
// Dashboard II call-activity line chart.
export const getCallActivityTrend = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const range = resolvePeriodRange(req);
        const branchFilter = getBranchFilter(req);
        const isSuperAdmin = checkSuperAdmin(user);

        const where: any = {
            organisationId: orgId,
            type: 'call',
            callStatus: { not: 'initiated' },
            isDeleted: false,
            date: range.lt ? { gte: range.gte, lt: range.lt } : { gte: range.gte },
            ...(branchFilter.branchId ? { lead: { branchId: branchFilter.branchId } } : {}),
        };

        if (!isSuperAdmin && user.role !== 'admin') {
            const visibleUserIds = await getVisibleUserIds(user.id);
            where.OR = [
                { createdById: { in: visibleUserIds } },
                { lead: { assignedToId: { in: visibleUserIds } } },
            ];
        }

        const calls = await prisma.interaction.findMany({
            where,
            select: { date: true, callStatus: true },
        });

        const byDay = new Map<string, { total: number; connected: number }>();
        calls.forEach((c) => {
            const key = c.date.toISOString().slice(0, 10);
            const bucket = byDay.get(key) || { total: 0, connected: 0 };
            bucket.total += 1;
            if (c.callStatus === 'completed') bucket.connected += 1;
            byDay.set(key, bucket);
        });

        const trend = Array.from(byDay.entries())
            .map(([date, v]) => ({ date, total: v.total, connected: v.connected }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.json(trend);
    } catch (error) {
        console.error('getCallActivityTrend error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// GET /api/analytics/task-followup-completion
// Merged Task + FollowUp status counts (both share the same status vocabulary),
// respecting the same visibility rules as their own controllers.
export const getTaskFollowUpCompletion = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const isSuperAdmin = checkSuperAdmin(user);
        const branchFilter = getBranchFilter(req);
        const visibleUserIds = !isSuperAdmin && user.role !== 'admin' ? await getVisibleUserIds(user.id) : null;

        const visibilityWhere = visibleUserIds
            ? { OR: [{ assignedToId: { in: visibleUserIds } }, { createdById: { in: visibleUserIds } }] }
            : {};

        const [taskGroups, followUpGroups] = await Promise.all([
            prisma.task.groupBy({
                by: ['status'],
                where: { organisationId: orgId, isDeleted: false, ...branchFilter, ...visibilityWhere },
                _count: { _all: true },
            }),
            prisma.followUp.groupBy({
                by: ['status'],
                where: { organisationId: orgId, isDeleted: false, ...branchFilter, ...visibilityWhere },
                _count: { _all: true },
            }),
        ]);

        const STATUS_LABELS: Record<string, string> = {
            not_started: 'Not Started',
            in_progress: 'In Progress',
            completed: 'Completed',
            deferred: 'Deferred',
        };

        const merged: Record<string, { tasks: number; followUps: number }> = {};
        taskGroups.forEach((g) => {
            merged[g.status] = merged[g.status] || { tasks: 0, followUps: 0 };
            merged[g.status].tasks = g._count._all;
        });
        followUpGroups.forEach((g) => {
            merged[g.status] = merged[g.status] || { tasks: 0, followUps: 0 };
            merged[g.status].followUps = g._count._all;
        });

        const result = Object.entries(merged).map(([status, counts]) => ({
            status,
            label: STATUS_LABELS[status] || status,
            tasks: counts.tasks,
            followUps: counts.followUps,
            total: counts.tasks + counts.followUps,
        }));

        res.json(result);
    } catch (error) {
        console.error('getTaskFollowUpCompletion error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// GET /api/analytics/opportunity-pipeline-value
// Sum of Opportunity.amount bucketed into the same Expected / Closed Won / Closed
// Lost groups the Opportunities Kanban board uses (see KanbanBoard.tsx's STAGES).
const CLOSED_WON_STAGES = new Set(['closed_won']);
const CLOSED_LOST_STAGES = new Set(['closed_lost']);

export const getOpportunityPipelineValue = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const isSuperAdmin = checkSuperAdmin(user);
        const branchFilter = getBranchFilter(req);
        const visibilityFilter = await getOppVisibilityFilter(user, isSuperAdmin);

        const grouped = await prisma.opportunity.groupBy({
            by: ['stage'],
            where: { organisationId: orgId, isDeleted: false, ...branchFilter, ...visibilityFilter },
            _sum: { amount: true },
            _count: { _all: true },
        });

        const buckets = {
            expected: { label: 'Expected', value: 0, count: 0 },
            closed_won: { label: 'Closed Won', value: 0, count: 0 },
            closed_lost: { label: 'Closed Lost', value: 0, count: 0 },
        };

        grouped.forEach((g) => {
            const key = CLOSED_WON_STAGES.has(g.stage) ? 'closed_won' : CLOSED_LOST_STAGES.has(g.stage) ? 'closed_lost' : 'expected';
            buckets[key].value += g._sum.amount || 0;
            buckets[key].count += g._count._all;
        });

        res.json(Object.entries(buckets).map(([id, b]) => ({ id, ...b })));
    } catch (error) {
        console.error('getOpportunityPipelineValue error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// GET /api/analytics/branch-performance
// Per-branch lead volume vs conversion, for orgs with multiple branches.
export const getBranchPerformance = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const isSuperAdmin = checkSuperAdmin(user);
        const visibilityFilter = await getLeadVisibilityFilter(user, isSuperAdmin);

        const branches = await prisma.branch.findMany({
            where: { organisationId: orgId, isDeleted: false },
            select: { id: true, name: true },
        });

        const results = await Promise.all(
            branches.map(async (branch) => {
                const [totalLeads, convertedLeads] = await Promise.all([
                    prisma.lead.count({ where: { organisationId: orgId, branchId: branch.id, isDeleted: false, ...visibilityFilter } }),
                    prisma.lead.count({ where: { organisationId: orgId, branchId: branch.id, isDeleted: false, status: 'converted', ...visibilityFilter } }),
                ]);
                return { id: branch.id, name: branch.name, totalLeads, convertedLeads };
            })
        );

        res.json(results.filter((r) => r.totalLeads > 0));
    } catch (error) {
        console.error('getBranchPerformance error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
