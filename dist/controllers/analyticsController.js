"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserWiseSales = exports.getSalesBook = exports.getTopPerformers = exports.getAiInsights = exports.getLeadSourceAnalytics = exports.getSalesForecast = exports.getTopLeads = exports.getSalesChartData = exports.getDashboardStats = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const roleUtils_1 = require("../utils/roleUtils");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logDebug = (msg) => {
    try {
        const logPath = path_1.default.join(__dirname, '../../debug_crash.log');
        fs_1.default.appendFileSync(logPath, `${new Date().toISOString()} - ${msg}\n`);
    }
    catch (e) {
        console.error('Failed to write log', e);
    }
};
// Helper to get branch filter
const getBranchFilter = (req) => {
    const branchId = req.query.branchId;
    return branchId ? { branchId } : {};
};
const getDashboardStats = async (req, res) => {
    logDebug('Entered getDashboardStats');
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        logDebug(`[Analytics] User: ${user?.id}, Org: ${orgId}, SuperAdmin: ${isSuperAdmin}`);
        const branchFilter = getBranchFilter(req);
        // If user is not admin, they might be restricted to their own branch
        // But for now, we trust the query param if valid, or fallback to user's branch if not admin?
        // The requirement is "organisation admin dashboard can see branch vise data"
        // So this is mainly for Admins filtering.
        // If a normal user tries to filter by another branch, they shouldn't see data?
        // For now, let's assume the UI handles visibility validation, and we just filter.
        // But STRICTLY: standard users should default to their own branch if they have one?
        // Existing logic for non-admins filters by `assignedToId` or `ownerId`, which implicitly handles branch (users in branch see their own stuff).
        // So we just add the explicit branch filter.
        logDebug('[Analytics] Importing hierarchyUtils...');
        const { getVisibleUserIds } = await Promise.resolve().then(() => __importStar(require('../utils/hierarchyUtils')));
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
        // Base filter for users who are not admin/super_admin
        const visibilityFilter = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            visibilityFilter.assignedToId = { in: visibleUserIds };
        }
        // Special case for opportunity ownerId vs assignedToId (if schema differs)
        const oppVisibilityFilter = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            oppVisibilityFilter.ownerId = { in: visibleUserIds };
        }
        // Current Month Dates
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfLastMonth = new Date(startOfMonth);
        startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
        // Group independent queries to run concurrently
        const [totalLeads, newLeads, convertedLeads, revenueResult, pipelineResult, totalContacts, totalAccounts, prevLeads, prevRevenueResult, totalClosedCurrent, wonCurrent, wonTotal, lostTotal, activeOpportunitiesCount, totalOpportunitiesCount, revenueThisMonthResult] = await Promise.all([
            // Leads
            prisma_1.default.lead.count({ where: { ...combinedFilter, isDeleted: false, ...visibilityFilter } }),
            prisma_1.default.lead.count({ where: { ...combinedFilter, isDeleted: false, status: 'new', ...visibilityFilter } }),
            prisma_1.default.lead.count({ where: { ...combinedFilter, isDeleted: false, status: 'converted', ...visibilityFilter } }),
            // Revenue calculation and trend
            prisma_1.default.opportunity.aggregate({
                where: {
                    ...combinedFilter,
                    stage: 'closed_won',
                    isDeleted: false,
                    ...oppVisibilityFilter
                },
                _sum: { amount: true }
            }),
            // Pipeline Value
            prisma_1.default.opportunity.aggregate({
                where: { ...combinedFilter, isDeleted: false, ...oppVisibilityFilter },
                _sum: { amount: true }
            }),
            // Contacts/Accounts
            prisma_1.default.contact.count({
                where: { ...combinedFilter, isDeleted: false, ...(!isSuperAdmin && user.role !== 'admin' ? { ownerId: { in: visibleUserIds } } : {}) }
            }),
            prisma_1.default.account.count({
                where: { ...combinedFilter, isDeleted: false, ...(!isSuperAdmin && user.role !== 'admin' ? { ownerId: { in: visibleUserIds } } : {}) }
            }),
            // Previous Month Stats for Trends (Leads)
            prisma_1.default.lead.count({
                where: {
                    ...combinedFilter,
                    isDeleted: false,
                    createdAt: { gte: startOfLastMonth, lt: startOfMonth },
                    ...visibilityFilter
                }
            }),
            // Previous Month Stats for Trends (Revenue)
            prisma_1.default.opportunity.aggregate({
                where: {
                    ...combinedFilter,
                    stage: 'closed_won',
                    isDeleted: false,
                    closeDate: { gte: startOfLastMonth, lt: startOfMonth },
                    ...oppVisibilityFilter
                },
                _sum: { amount: true }
            }),
            // Trending Win Rate (total closed current month)
            prisma_1.default.opportunity.count({
                where: {
                    ...combinedFilter,
                    isDeleted: false,
                    stage: { in: ['closed_won', 'closed_lost'] },
                    closeDate: { gte: startOfMonth },
                    ...oppVisibilityFilter
                }
            }),
            // Trending Win Rate (won current month)
            prisma_1.default.opportunity.count({
                where: {
                    ...combinedFilter,
                    isDeleted: false,
                    stage: 'closed_won',
                    closeDate: { gte: startOfMonth },
                    ...oppVisibilityFilter
                }
            }),
            // Won/Lost for nested object
            prisma_1.default.opportunity.count({
                where: { ...combinedFilter, isDeleted: false, stage: 'closed_won', ...oppVisibilityFilter }
            }),
            prisma_1.default.opportunity.count({
                where: { ...combinedFilter, isDeleted: false, stage: 'closed_lost', ...oppVisibilityFilter }
            }),
            // Active and Total Opportunities
            prisma_1.default.opportunity.count({ where: { ...combinedFilter, isDeleted: false, stage: { notIn: ['closed_won', 'closed_lost'] }, ...oppVisibilityFilter } }),
            prisma_1.default.opportunity.count({ where: { ...combinedFilter, isDeleted: false, ...oppVisibilityFilter } }),
            // Revenue this month (closed_won in current month)
            prisma_1.default.opportunity.aggregate({
                where: {
                    ...combinedFilter,
                    stage: 'closed_won',
                    isDeleted: false,
                    closeDate: { gte: startOfMonth },
                    ...oppVisibilityFilter
                },
                _sum: { amount: true }
            })
        ]);
        const totalRevenue = revenueResult._sum.amount || 0;
        const pipelineValue = pipelineResult._sum.amount || 0;
        const prevRevenue = prevRevenueResult._sum.amount || 0;
        const revenueThisMonth = revenueThisMonthResult._sum.amount || 0;
        const currentWinRate = totalClosedCurrent > 0 ? (wonCurrent / totalClosedCurrent) * 100 : 0;
        const calculateTrend = (curr, prev) => {
            if (prev === 0)
                return curr > 0 ? 100 : 0;
            return Math.round(((curr - prev) / prev) * 100);
        };
        res.json({
            // Flat structure
            totalLeads,
            activeOpportunities: activeOpportunitiesCount,
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
    }
    catch (error) {
        logDebug(`getDashboardStats CRASHED: ${error.message}\nStack: ${error.stack}`);
        console.error('getDashboardStats Error:', error);
        res.status(500).json({
            message: error.message,
            debug: 'Check debug_crash.log'
        });
    }
};
exports.getDashboardStats = getDashboardStats;
const getSalesChartData = async (req, res) => {
    try {
        console.log('[Analytics] Requesting Sales Chart Data');
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        if (!orgId && !isSuperAdmin) {
            console.error('[Analytics] Org ID missing for user:', user.id);
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // Go back 5 months to include current month = 6 total
        sixMonthsAgo.setDate(1); // Start of that month
        sixMonthsAgo.setHours(0, 0, 0, 0);
        // Base filter for visibility
        const visibilityFilter = {};
        if (user.role !== 'admin' && !isSuperAdmin) {
            const { getVisibleUserIds } = await Promise.resolve().then(() => __importStar(require('../utils/hierarchyUtils')));
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.ownerId = { in: visibleUserIds };
        }
        // Fetch closed_won opportunities
        const wonOpportunities = await prisma_1.default.opportunity.findMany({
            where: {
                ...combinedFilter,
                stage: 'closed_won',
                isDeleted: false,
                ...visibilityFilter,
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
        const monthlyData = new Map();
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
            const [, monthIndex] = key.split('-').map(Number);
            return {
                name: monthNames[monthIndex],
                total,
                fullDate: key // helpful validation
            };
        });
        console.log(`[Analytics] Sales Chart returning ${formattedData.length} points.`);
        res.json(formattedData);
    }
    catch (error) {
        console.error('getSalesChartData Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getSalesChartData = getSalesChartData;
const getTopLeads = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        // Visibility
        const visibilityFilter = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await Promise.resolve().then(() => __importStar(require('../utils/hierarchyUtils')));
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.assignedToId = { in: visibleUserIds };
        }
        const topLeads = await prisma_1.default.lead.findMany({
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
    }
    catch (error) {
        console.error('getTopLeads Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getTopLeads = getTopLeads;
const getSalesForecast = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        // Visibility
        const visibilityFilter = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await Promise.resolve().then(() => __importStar(require('../utils/hierarchyUtils')));
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.ownerId = { in: visibleUserIds };
        }
        // Get open opportunities (not closed_won or closed_lost)
        const openOpportunities = await prisma_1.default.opportunity.findMany({
            where: {
                ...combinedFilter,
                stage: { notIn: ['closed_won', 'closed_lost'] },
                isDeleted: false,
                ...visibilityFilter
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
    }
    catch (error) {
        console.error('getSalesForecast Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getSalesForecast = getSalesForecast;
const getLeadSourceAnalytics = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        // Prisma groupBy for lead sources
        const sourceStats = await prisma_1.default.lead.groupBy({
            by: ['source'],
            where: {
                ...combinedFilter,
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
    }
    catch (error) {
        console.error('getLeadSourceAnalytics Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getLeadSourceAnalytics = getLeadSourceAnalytics;
const getAiInsights = async (req, res) => {
    try {
        console.log('[Analytics] Requesting AI Insights');
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        const insights = [];
        // 1. Top Lead Source Analysis
        const topSource = await prisma_1.default.lead.groupBy({
            by: ['source'],
            where: { ...combinedFilter, isDeleted: false },
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
        const stagnantDeals = await prisma_1.default.opportunity.count({
            where: {
                ...combinedFilter,
                stage: { in: ['prospecting', 'qualified'] },
                isDeleted: false,
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
        // 3. High Value Deal Alert - Calculate dynamic threshold based on average deal size
        const avgDealResult = await prisma_1.default.opportunity.aggregate({
            where: {
                ...combinedFilter,
                stage: { notIn: ['closed_won', 'closed_lost'] },
                isDeleted: false,
                amount: { gt: 0 }
            },
            _avg: { amount: true }
        });
        const avgDealSize = avgDealResult._avg?.amount || 5000;
        const highValueThreshold = avgDealSize * 2; // Deals worth 2x average are considered high value
        const highValueDeals = await prisma_1.default.opportunity.findMany({
            where: {
                ...combinedFilter,
                stage: { notIn: ['closed_won', 'closed_lost'] },
                isDeleted: false,
                amount: { gt: highValueThreshold }
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
    }
    catch (error) {
        console.error('getAiInsights Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getAiInsights = getAiInsights;
const getTopPerformers = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
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
        const topUsers = await prisma_1.default.user.findMany({
            where: {
                ...userCombinedFilter,
                ...activeFilter
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profileImage: true,
                ownedOpportunities: {
                    where: { stage: 'closed_won', isDeleted: false },
                    select: { amount: true }
                }
            }
        });
        const leaderboard = topUsers.map(u => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`,
            email: u.email,
            image: u.profileImage,
            totalRevenue: u.ownedOpportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0),
            dealsWon: u.ownedOpportunities.length
        }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 5);
        res.json(leaderboard);
    }
    catch (error) {
        console.error('getTopPerformers Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getTopPerformers = getTopPerformers;
const getSalesBook = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        const { startDate, endDate } = req.query;
        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const orgFilter = orgId ? { organisationId: orgId } : {};
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        // Visibility
        const visibilityFilter = {};
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await Promise.resolve().then(() => __importStar(require('../utils/hierarchyUtils')));
            const visibleUserIds = await getVisibleUserIds(user.id);
            visibilityFilter.ownerId = { in: visibleUserIds };
        }
        // Date Filter
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.closeDate = {
                gte: new Date(String(startDate)),
                lte: new Date(String(endDate))
            };
        }
        const sales = await prisma_1.default.opportunity.findMany({
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
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } } // Assuming 'owner' relation exists or 'assignedTo'
            },
            orderBy: { closeDate: 'desc' }
        });
        const formattedSales = sales.map(s => ({
            id: s.id,
            opportunityName: s.name,
            customerName: s.account?.name || 'N/A',
            amount: s.amount,
            closeDate: s.closeDate,
            ownerName: s.owner ? `${s.owner.firstName} ${s.owner.lastName}` : 'Unknown'
        }));
        res.json(formattedSales);
    }
    catch (error) {
        console.error('getSalesBook Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getSalesBook = getSalesBook;
const getUserWiseSales = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const isSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        const { startDate, endDate } = req.query;
        if (!orgId && !isSuperAdmin) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const orgFilter = orgId ? { organisationId: orgId } : {};
        // Branch filter is optional here, usually user-wise report might be global for admin, but let's respect it if passed
        const branchFilter = getBranchFilter(req);
        const combinedFilter = { ...orgFilter, ...branchFilter };
        // Determine scope of users to report on
        let userIdsToReport = [];
        if (!isSuperAdmin && user.role !== 'admin') {
            const { getVisibleUserIds } = await Promise.resolve().then(() => __importStar(require('../utils/hierarchyUtils')));
            userIdsToReport = await getVisibleUserIds(user.id);
        }
        else {
            // Admin sees all active users in org (and optional branch)
            const users = await prisma_1.default.user.findMany({
                where: { ...combinedFilter, isActive: true },
                select: { id: true }
            });
            userIdsToReport = users.map(u => u.id);
        }
        // Date Filter for OPPORTUNITIES
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.closeDate = {
                gte: new Date(String(startDate)),
                lte: new Date(String(endDate))
            };
        }
        // Aggregate per user
        const userStats = await Promise.all(userIdsToReport.map(async (uid) => {
            const userDetails = await prisma_1.default.user.findUnique({
                where: { id: uid },
                select: { firstName: true, lastName: true, email: true }
            });
            if (!userDetails)
                return null;
            const aggregates = await prisma_1.default.opportunity.aggregate({
                where: {
                    ownerId: uid, // Sales credited to owner
                    stage: 'closed_won',
                    isDeleted: false,
                    ...orgFilter, // Safety check
                    ...dateFilter
                },
                _sum: { amount: true },
                _count: { id: true },
                _avg: { amount: true }
            });
            return {
                userId: uid,
                name: `${userDetails.firstName} ${userDetails.lastName}`,
                email: userDetails.email,
                totalRevenue: aggregates._sum.amount || 0,
                dealsCount: aggregates._count.id || 0,
                avgDealSize: Math.round(aggregates._avg.amount || 0)
            };
        }));
        const cleanStats = userStats.filter(s => s !== null).sort((a, b) => (b?.totalRevenue || 0) - (a?.totalRevenue || 0));
        res.json(cleanStats);
    }
    catch (error) {
        console.error('getUserWiseSales Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getUserWiseSales = getUserWiseSales;
