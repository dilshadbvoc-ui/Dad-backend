"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyReport = exports.getUserPerformanceDetails = exports.getTeamPerformanceReport = exports.exportToExcel = exports.getSalesBook = exports.getUserPerformance = exports.getLeadsReport = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const roleUtils_1 = require("../utils/roleUtils");
const exceljs_1 = __importDefault(require("exceljs"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Get leads report with filters
 * Query params: stage, status, userId, startDate, endDate
 */
const getLeadsReport = async (req, res) => {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ message: 'Unauthorized' });
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
        const { stage, status, userId, startDate, endDate, branchId } = req.query;
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        if (branchId)
            where.branchId = branchId;
        // If not admin, restrict to self and subordinates (or managed branches)
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            where.assignedToId = { in: visibleUserIds };
        }
        if (stage)
            where.stage = stage;
        if (status)
            where.status = status;
        if (userId)
            where.assignedToId = userId;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const leads = await prisma_1.default.lead.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true } },
                branch: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        // Aggregate by stage and status
        const byStage = leads.reduce((acc, lead) => {
            const s = lead.stage || 'Unknown';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
        }, {});
        const byStatus = leads.reduce((acc, lead) => {
            acc[lead.status] = (acc[lead.status] || 0) + 1;
            return acc;
        }, {});
        res.json({
            leads,
            summary: {
                total: leads.length,
                byStage,
                byStatus
            }
        });
    }
    catch (error) {
        console.error('[ReportController] getLeadsReport error:', error);
        res.status(500).json({ message: 'Failed to fetch leads report' });
    }
};
exports.getLeadsReport = getLeadsReport;
/**
 * Get user performance metrics
 */
const getUserPerformance = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
        const { startDate, endDate, branchId } = req.query;
        const dateFilter = {};
        if (startDate)
            dateFilter.gte = new Date(startDate);
        if (endDate)
            dateFilter.lte = new Date(endDate);
        const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
        const where = {
            id: { in: visibleUserIds },
            organisationId: orgId,
            isActive: true
        };
        if (branchId)
            where.branchId = branchId;
        const users = await prisma_1.default.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                dailyLeadQuota: true,
                branch: { select: { name: true } }
            }
        });
        const performance = await Promise.all(users.map(async (user) => {
            const [leadsAssigned, leadsConverted, callsMade, meetingsHeld] = await Promise.all([
                prisma_1.default.lead.count({
                    where: {
                        assignedToId: user.id,
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                }),
                prisma_1.default.lead.count({
                    where: {
                        assignedToId: user.id,
                        status: 'converted',
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { updatedAt: dateFilter } : {})
                    }
                }),
                prisma_1.default.interaction.count({
                    where: {
                        createdById: user.id,
                        type: 'call',
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                }),
                prisma_1.default.calendarEvent.count({
                    where: {
                        createdById: user.id,
                        type: 'meeting',
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                })
            ]);
            const conversionRate = leadsAssigned > 0
                ? ((leadsConverted / leadsAssigned) * 100).toFixed(1)
                : '0';
            return {
                user: {
                    id: user.id,
                    name: `${user.firstName} ${user.lastName}`,
                    role: user.role,
                    dailyQuota: user.dailyLeadQuota,
                    branch: user.branch?.name || 'N/A'
                },
                metrics: {
                    leadsAssigned,
                    leadsConverted,
                    conversionRate: parseFloat(conversionRate),
                    callsMade,
                    meetingsHeld
                }
            };
        }));
        res.json({ performance });
    }
    catch (error) {
        console.error('[ReportController] getUserPerformance error:', error);
        res.status(500).json({ message: 'Failed to fetch user performance' });
    }
};
exports.getUserPerformance = getUserPerformance;
/**
 * Get sales book data with time period filter
 * Query params: period (day|week|month|year)
 */
const getSalesBook = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
        const { period = 'month', branchId } = req.query;
        const now = new Date();
        const startDate = new Date();
        switch (period) {
            case 'day':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
        }
        const where = {
            organisationId: orgId,
            stage: 'closed_won',
            isDeleted: false,
            updatedAt: { gte: startDate }
        };
        if (branchId)
            where.branchId = branchId;
        // If not admin, restrict to self and subordinates
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            where.ownerId = { in: visibleUserIds };
        }
        // Get won opportunities (sales)
        const sales = await prisma_1.default.opportunity.findMany({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } },
                branch: { select: { name: true } }
            },
            orderBy: { updatedAt: 'desc' }
        });
        const totalValue = sales.reduce((sum, sale) => sum + sale.amount, 0);
        const averageDealSize = sales.length > 0 ? totalValue / sales.length : 0;
        // Group by user
        const byUser = sales.reduce((acc, sale) => {
            const ownerName = sale.owner ? `${sale.owner.firstName} ${sale.owner.lastName}` : 'Unassigned';
            if (!acc[ownerName]) {
                acc[ownerName] = { count: 0, value: 0 };
            }
            acc[ownerName].count++;
            acc[ownerName].value += sale.amount;
            return acc;
        }, {});
        res.json({
            period,
            startDate,
            endDate: now,
            sales: sales.map(s => ({
                id: s.id,
                name: s.name,
                amount: s.amount,
                account: s.account?.name || 'N/A',
                owner: s.owner ? `${s.owner.firstName} ${s.owner.lastName}` : 'Unassigned',
                branch: s.branch?.name || 'N/A',
                closedAt: s.updatedAt
            })),
            summary: {
                totalDeals: sales.length,
                totalValue,
                averageDealSize,
                byUser
            }
        });
    }
    catch (error) {
        console.error('[ReportController] getSalesBook error:', error);
        res.status(500).json({ message: 'Failed to fetch sales book' });
    }
};
exports.getSalesBook = getSalesBook;
/**
 * Export report data to Excel
 * Params: type (leads|performance|sales)
 */
const exportToExcel = async (req, res) => {
    try {
        const { type } = req.params;
        const { startDate, endDate, branchId, userId, stage, status, source } = req.query;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return res.status(401).json({ message: 'Organisation not found' });
        }
        const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
        // Branch filter
        const branchFilter = branchId ? { branchId: branchId } : {};
        const workbook = new exceljs_1.default.Workbook();
        workbook.creator = 'CRM Reports';
        workbook.created = new Date();
        if (type === 'leads') {
            const where = {
                organisationId: orgId,
                isDeleted: false,
                ...branchFilter
            };
            // Hierarchy restrictions
            if (user.role !== 'admin' && user.role !== 'super_admin') {
                where.assignedToId = { in: visibleUserIds };
            }
            else if (userId) {
                where.assignedToId = userId;
            }
            if (stage)
                where.stage = stage;
            if (status)
                where.status = status;
            if (source)
                where.source = source;
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate)
                    where.createdAt.gte = new Date(startDate);
                if (endDate)
                    where.createdAt.lte = new Date(endDate);
            }
            const leads = await prisma_1.default.lead.findMany({
                where,
                include: {
                    assignedTo: { select: { firstName: true, lastName: true } }
                }
            });
            const sheet = workbook.addWorksheet('Leads Report');
            sheet.columns = [
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Phone', key: 'phone', width: 15 },
                { header: 'Company', key: 'company', width: 20 },
                { header: 'Status', key: 'status', width: 12 },
                { header: 'Stage', key: 'stage', width: 15 },
                { header: 'Score', key: 'score', width: 8 },
                { header: 'Assigned To', key: 'assignedTo', width: 20 },
                { header: 'Created', key: 'createdAt', width: 15 }
            ];
            leads.forEach(lead => {
                sheet.addRow({
                    name: `${lead.firstName} ${lead.lastName}`,
                    email: lead.email || '',
                    phone: lead.phone,
                    company: lead.company || '',
                    status: lead.status,
                    stage: lead.stage || '',
                    score: lead.leadScore,
                    assignedTo: lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '',
                    createdAt: lead.createdAt.toLocaleDateString()
                });
            });
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }
        else if (type === 'sales') {
            const where = {
                organisationId: orgId,
                stage: 'closed_won',
                isDeleted: false,
                ...branchFilter
            };
            if (user.role !== 'admin' && user.role !== 'super_admin') {
                where.ownerId = { in: visibleUserIds };
            }
            if (startDate || endDate) {
                where.updatedAt = {};
                if (startDate)
                    where.updatedAt.gte = new Date(startDate);
                if (endDate)
                    where.updatedAt.lte = new Date(endDate);
            }
            const sales = await prisma_1.default.opportunity.findMany({
                where,
                include: {
                    account: { select: { name: true } },
                    owner: { select: { firstName: true, lastName: true } }
                }
            });
            const sheet = workbook.addWorksheet('Sales Book');
            sheet.columns = [
                { header: 'Deal Name', key: 'name', width: 30 },
                { header: 'Account', key: 'account', width: 25 },
                { header: 'Amount', key: 'amount', width: 15 },
                { header: 'Owner', key: 'owner', width: 20 },
                { header: 'Closed Date', key: 'closedAt', width: 15 }
            ];
            sales.forEach(sale => {
                sheet.addRow({
                    name: sale.name,
                    account: sale.account?.name || 'N/A',
                    amount: sale.amount,
                    owner: sale.owner ? `${sale.owner.firstName} ${sale.owner.lastName}` : 'Unassigned',
                    closedAt: sale.updatedAt.toLocaleDateString()
                });
            });
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }
        else if (type === 'user-sales') {
            const users = await prisma_1.default.user.findMany({
                where: {
                    id: { in: visibleUserIds },
                    organisationId: orgId,
                    isActive: true,
                    ...branchFilter
                },
                select: { id: true, firstName: true, lastName: true, email: true }
            });
            const oppDateFilter = {};
            if (startDate || endDate) {
                oppDateFilter.updatedAt = {};
                if (startDate)
                    oppDateFilter.updatedAt.gte = new Date(startDate);
                if (endDate)
                    oppDateFilter.updatedAt.lte = new Date(endDate);
            }
            const sheet = workbook.addWorksheet('User Sales Performance');
            sheet.columns = [
                { header: 'Sales Rep', key: 'name', width: 25 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Total Revenue', key: 'revenue', width: 15 },
                { header: 'Deals Won', key: 'deals', width: 12 },
                { header: 'Avg Deal Size', key: 'avgDeal', width: 15 }
            ];
            for (const u of users) {
                const sales = await prisma_1.default.opportunity.findMany({
                    where: {
                        ownerId: u.id,
                        organisationId: orgId,
                        stage: 'closed_won',
                        isDeleted: false,
                        ...oppDateFilter
                    },
                    select: { amount: true }
                });
                const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);
                const avgDealSize = sales.length > 0 ? totalRevenue / sales.length : 0;
                sheet.addRow({
                    name: `${u.firstName} ${u.lastName}`,
                    email: u.email,
                    revenue: totalRevenue,
                    deals: sales.length,
                    avgDeal: avgDealSize
                });
            }
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }
        else if (type === 'campaigns') {
            const campaigns = await prisma_1.default.campaign.findMany({
                where: {
                    organisationId: orgId,
                    isDeleted: false,
                    ...(branchId ? { createdBy: { branchId: branchId } } : {})
                },
                orderBy: { createdAt: 'desc' }
            });
            const sheet = workbook.addWorksheet('Email Campaigns');
            sheet.columns = [
                { header: 'Campaign Name', key: 'name', width: 30 },
                { header: 'Subject', key: 'subject', width: 40 },
                { header: 'Status', key: 'status', width: 12 },
                { header: 'Date Created', key: 'createdAt', width: 15 }
            ];
            campaigns.forEach((c) => {
                sheet.addRow({
                    name: c.name,
                    subject: c.subject,
                    status: c.status,
                    createdAt: c.createdAt.toLocaleDateString()
                });
            });
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }
        else if (type === 'check-ins') {
            const checkIns = await prisma_1.default.checkIn.findMany({
                where: {
                    organisationId: orgId,
                    ...(branchId ? { user: { branchId: branchId } } : {})
                },
                include: {
                    user: { select: { firstName: true, lastName: true } },
                    lead: { select: { firstName: true, lastName: true } },
                    account: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
            const sheet = workbook.addWorksheet('Field Force Activity');
            sheet.columns = [
                { header: 'Agent', key: 'agent', width: 25 },
                { header: 'Type', key: 'type', width: 15 },
                { header: 'Related To', key: 'related', width: 30 },
                { header: 'Address', key: 'address', width: 40 },
                { header: 'Time', key: 'time', width: 20 },
                { header: 'Notes', key: 'notes', width: 40 }
            ];
            checkIns.forEach((c) => {
                const related = c.lead ? `Lead: ${c.lead.firstName} ${c.lead.lastName}` : (c.account ? `Account: ${c.account.name}` : '');
                sheet.addRow({
                    agent: c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Unknown',
                    type: c.type,
                    related,
                    address: c.address || '',
                    time: c.createdAt.toLocaleString(),
                    notes: c.notes || ''
                });
            });
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }
        else if (type === 'tasks') {
            const tasks = await prisma_1.default.task.findMany({
                where: {
                    organisationId: orgId,
                    isDeleted: false,
                    ...(branchId ? { branchId: branchId } : {})
                },
                include: {
                    assignedTo: { select: { firstName: true, lastName: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
            const sheet = workbook.addWorksheet('Follow Ups');
            sheet.columns = [
                { header: 'Subject', key: 'subject', width: 30 },
                { header: 'Status', key: 'status', width: 12 },
                { header: 'Priority', key: 'priority', width: 12 },
                { header: 'Due Date', key: 'dueDate', width: 15 },
                { header: 'Assigned To', key: 'assignedTo', width: 20 }
            ];
            tasks.forEach((t) => {
                sheet.addRow({
                    subject: t.subject,
                    status: t.status,
                    priority: t.priority,
                    dueDate: t.dueDate ? t.dueDate.toLocaleDateString() : 'N/A',
                    assignedTo: t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : 'Unassigned'
                });
            });
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${type}_report_${Date.now()}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    }
    catch (error) {
        console.error('[ReportController] exportToExcel error:', error);
        res.status(500).json({ message: 'Failed to export report' });
    }
};
exports.exportToExcel = exportToExcel;
const getTeamPerformanceReport = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(403).json({ message: 'No org' });
        const { branchId } = req.query;
        const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
        const teamIds = visibleUserIds;
        const where = {
            id: { in: teamIds },
            organisationId: orgId,
            isActive: true
        };
        if (branchId)
            where.branchId = branchId;
        const teamsData = await prisma_1.default.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                branch: { select: { name: true } },
                _count: {
                    select: {
                        assignedLeads: true,
                        ownedOpportunities: true
                    }
                }
            }
        });
        // Detailed stats per user
        const report = await Promise.all(teamsData.map(async (u) => {
            const leadStats = await prisma_1.default.lead.groupBy({
                by: ['status'],
                where: { assignedToId: u.id, organisationId: orgId, isDeleted: false },
                _count: true
            });
            const saleStats = await prisma_1.default.opportunity.aggregate({
                where: { ownerId: u.id, organisationId: orgId, stage: 'closed_won', isDeleted: false },
                _sum: { amount: true },
                _count: true
            });
            const wonStats = await prisma_1.default.opportunity.count({
                where: { ownerId: u.id, organisationId: orgId, stage: 'closed_won', isDeleted: false },
            });
            const lostStats = await prisma_1.default.lead.count({
                where: { assignedToId: u.id, organisationId: orgId, status: 'lost', isDeleted: false }
            });
            return {
                userId: u.id,
                name: `${u.firstName} ${u.lastName || ''}`.trim(),
                branch: u.branch?.name || 'N/A',
                totalLeads: u._count.assignedLeads,
                totalSales: saleStats._sum.amount || 0,
                salesCount: saleStats._count,
                lostLeads: lostStats,
                statusBreakdown: leadStats.map(s => ({ status: s.status, count: s._count }))
            };
        }));
        res.json(report);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTeamPerformanceReport = getTeamPerformanceReport;
/**
 * Detailed user performance for the "User Total Report"
 * Metrics: Leads, Calls, Status Changes, Unattended, Revenue, Performance Index
 */
const getUserPerformanceDetails = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { startDate, endDate, branchId } = req.query;
        const dateFilter = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            dateFilter.gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.lte = end;
        }
        const thresholdDate = new Date();
        thresholdDate.setHours(thresholdDate.getHours() - 48);
        const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
        const where = {
            id: { in: visibleUserIds },
            organisationId: orgId,
            isActive: true
        };
        if (branchId)
            where.branchId = branchId;
        const users = await prisma_1.default.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profileImage: true,
                branch: { select: { name: true } }
            }
        });
        const report = await Promise.all(users.map(async (u) => {
            const [periodLeads, activeLeads, callsMade, statusChanges, attendedLeads, wonDeals, meetings, revenueData, talkTimeData, strictlyNewLeads] = await Promise.all([
                // 1. Total Leads Assigned/Active in Period
                prisma_1.default.lead.count({
                    where: {
                        assignedToId: u.id,
                        organisationId: orgId,
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                }),
                // 2. Total Active Leads (any time, but must be in an active status)
                prisma_1.default.lead.count({
                    where: {
                        assignedToId: u.id,
                        organisationId: orgId,
                        isDeleted: false,
                        status: { in: ['new', 'contacted', 'interested', 'qualified', 'nurturing', 'call_not_connected', 're_enquiry'] }
                    }
                }),
                // 3. Total Calls Made
                prisma_1.default.interaction.count({
                    where: {
                        createdById: u.id,
                        type: 'call',
                        organisationId: orgId,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                }),
                // 4. Status Changes (History)
                prisma_1.default.leadHistory.count({
                    where: {
                        changedById: u.id,
                        fieldName: 'status',
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                }),
                // 5. Attended Leads (Interacted with in period)
                prisma_1.default.lead.count({
                    where: {
                        assignedToId: u.id,
                        organisationId: orgId,
                        isDeleted: false,
                        interactions: {
                            some: {
                                createdAt: dateFilter
                            }
                        }
                    }
                }),
                // 6. Won Deals in Period
                prisma_1.default.opportunity.count({
                    where: {
                        ownerId: u.id,
                        stage: 'closed_won',
                        organisationId: orgId,
                        ...(Object.keys(dateFilter).length ? { updatedAt: dateFilter } : {})
                    }
                }),
                // 7. Meetings
                prisma_1.default.calendarEvent.count({
                    where: {
                        createdById: u.id,
                        type: 'meeting',
                        organisationId: orgId,
                        ...(Object.keys(dateFilter).length ? { startTime: dateFilter } : {})
                    }
                }),
                // 8. Revenue in Period
                prisma_1.default.opportunity.aggregate({
                    where: {
                        ownerId: u.id,
                        stage: 'closed_won',
                        organisationId: orgId,
                        ...(Object.keys(dateFilter).length ? { updatedAt: dateFilter } : {})
                    },
                    _sum: { amount: true }
                }),
                // 9. Total Talk Time (Prioritize hardwareDuration) in Period
                prisma_1.default.interaction.findMany({
                    where: {
                        createdById: u.id,
                        type: 'call',
                        callStatus: 'completed',
                        organisationId: orgId,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    },
                    select: { duration: true, recordingDuration: true, hardwareDuration: true }
                }),
                // 10. Strictly New Leads (Unattended Backdrop)
                prisma_1.default.lead.count({
                    where: {
                        assignedToId: u.id,
                        organisationId: orgId,
                        isDeleted: false,
                        status: 'new'
                    }
                })
            ]);
            let totalTalkTimeSecs = 0;
            talkTimeData.forEach(i => {
                if (i.hardwareDuration && i.hardwareDuration > 0) {
                    totalTalkTimeSecs += i.hardwareDuration;
                }
                else if (i.recordingDuration && i.recordingDuration > 0) {
                    totalTalkTimeSecs += i.recordingDuration;
                }
                else if (i.duration && i.duration > 0) {
                    totalTalkTimeSecs += Math.round(i.duration * 60);
                }
            });
            const unattendedLeads = strictlyNewLeads;
            const revenue = revenueData._sum.amount || 0;
            // Performance Index Calculation (0-100)
            // Weighting: 40% Conversion, 25% Talk Time, 15% Call Count, 15% Activity, 5% Promptness
            const conversionRate = periodLeads > 0 ? (wonDeals / periodLeads) : 0;
            // Talk Time Score: 60 mins (3600s) = perfect
            const talkTimeScore = Math.min((totalTalkTimeSecs / 3600) * 100, 100);
            // Call Count Score: 50 calls = perfect
            const callScore = Math.min((callsMade / 50) * 100, 100);
            const activityScore = Math.min((statusChanges / 30) * 100, 100);
            const promptnessScore = activeLeads > 0 ? ((attendedLeads / activeLeads) * 100) : 100;
            const performanceIndex = ((conversionRate * 100 * 0.4) +
                (talkTimeScore * 0.25) +
                (callScore * 0.15) +
                (activityScore * 0.15) +
                (promptnessScore * 0.05)).toFixed(1);
            return {
                userId: u.id,
                name: `${u.firstName} ${u.lastName || ''}`.trim(),
                role: u.role,
                profileImage: u.profileImage,
                branch: u.branch?.name || 'N/A',
                metrics: {
                    totalLeads: periodLeads,
                    activeLeads,
                    callsMade,
                    totalTalkTime: Math.round(totalTalkTimeSecs / 60), // In minutes
                    totalTalkTimeSeconds: totalTalkTimeSecs,
                    statusChanges,
                    unattendedLeads,
                    wonDeals,
                    meetings,
                    revenue,
                    performanceIndex: parseFloat(performanceIndex),
                    conversionRate: parseFloat((conversionRate * 100).toFixed(1))
                }
            };
        }));
        // Sort by Performance Index
        report.sort((a, b) => b.metrics.performanceIndex - a.metrics.performanceIndex);
        res.json(report);
    }
    catch (error) {
        console.error('[ReportController] getUserPerformanceDetails error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getUserPerformanceDetails = getUserPerformanceDetails;
/**
 * Daily Report - Exact metrics for the current day
 * Columns: User Name, Total Calls, Total Connected, Total Unconnected, Total Converted, Total Lost
 */
const getDailyReport = async (req, res) => {
    console.log('@@@DAILY_REPORT_EXECUTION_STARTED@@@');
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            logger_1.default.warn(`getDailyReport: Organisation ID missing for user ${user.email}`, 'ReportController');
            return res.status(400).json({ message: 'Organisation ID is required' });
        }
        const { branchId } = req.query;
        // Calculate IST "today" boundaries
        // IST is UTC + 5:30
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(now.getTime() + istOffset);
        const istStartOfDay = new Date(istNow);
        istStartOfDay.setUTCHours(0, 0, 0, 0);
        const istEndOfDay = new Date(istNow);
        istEndOfDay.setUTCHours(23, 59, 59, 999);
        // Convert back to UTC for Prisma query
        const startOfDay = new Date(istStartOfDay.getTime() - istOffset);
        const endOfDay = new Date(istEndOfDay.getTime() - istOffset);
        const isUserAdmin = (0, roleUtils_1.isOrgAdmin)(user);
        console.log(`[DEBUG] getDailyReport: user=${user.email}, isOrgAdmin=${isUserAdmin}, orgId=${orgId}`);
        const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
        console.log(`[DEBUG] getDailyReport: visibleUserIds count=${visibleUserIds.length}`);
        const where = {
            organisationId: orgId,
            isActive: true
        };
        if (!isUserAdmin) {
            logger_1.default.info(`getDailyReport: restricting to ${visibleUserIds.length} visible users`, 'ReportController');
            where.id = { in: visibleUserIds };
        }
        if (branchId)
            where.branchId = branchId;
        const users = await prisma_1.default.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                branch: { select: { name: true } }
            }
        });
        logger_1.default.info(`getDailyReport: found ${users.length} users for report`, 'ReportController');
        const report = await Promise.all(users.map(async (u) => {
            const [totalCalls, connectedCalls, convertedLeads, lostLeads] = await Promise.all([
                // Total Calls
                prisma_1.default.interaction.count({
                    where: {
                        createdById: u.id,
                        type: 'call',
                        date: { gte: startOfDay, lte: endOfDay },
                        isDeleted: false
                    }
                }),
                // Total Connected
                prisma_1.default.interaction.count({
                    where: {
                        createdById: u.id,
                        type: 'call',
                        callStatus: 'completed',
                        date: { gte: startOfDay, lte: endOfDay },
                        isDeleted: false
                    }
                }),
                // Total Converted (Status became 'converted' today)
                prisma_1.default.leadHistory.count({
                    where: {
                        changedById: u.id,
                        fieldName: 'status',
                        newValue: 'converted',
                        createdAt: { gte: startOfDay, lte: endOfDay }
                    }
                }),
                // Total Lost (Status became 'lost' or 'dead' today)
                prisma_1.default.leadHistory.count({
                    where: {
                        changedById: u.id,
                        fieldName: 'status',
                        newValue: { in: ['lost', 'dead'] },
                        createdAt: { gte: startOfDay, lte: endOfDay }
                    }
                })
            ]);
            return {
                id: u.id,
                userName: `${u.firstName} ${u.lastName || ''}`.trim(),
                branch: u.branch?.name || 'N/A',
                totalCalls,
                totalConnected: connectedCalls,
                totalUnconnected: totalCalls - connectedCalls,
                totalConverted: convertedLeads,
                totalLost: lostLeads
            };
        }));
        // Calculate Organization-wide Summary (Respecting branch filter and visibility)
        const summaryWhere = {
            organisationId: orgId,
            type: 'call',
            date: { gte: startOfDay, lte: endOfDay },
            isDeleted: false
        };
        if (!isUserAdmin) {
            summaryWhere.createdById = { in: visibleUserIds };
        }
        if (branchId) {
            summaryWhere.createdBy = { branchId: branchId };
        }
        const totalStats = await prisma_1.default.interaction.findMany({
            where: summaryWhere
        });
        const summary = {
            totalCalls: totalStats.length,
            incoming: totalStats.filter(c => c.direction === 'inbound').length,
            outgoing: totalStats.filter(c => c.direction === 'outbound').length,
            missed: totalStats.filter(c => c.direction === 'inbound' && c.callStatus === 'missed').length,
            rejected: totalStats.filter(c => c.direction === 'inbound' && c.callStatus === 'rejected').length,
            neverAttended: totalStats.filter(c => c.direction === 'inbound' && ['missed', 'rejected'].includes(c.callStatus || '')).length,
            notPickedUp: totalStats.filter(c => c.direction === 'outbound' && (c.duration === 0 || c.callStatus === 'failed')).length,
            unique: new Set(totalStats.map(c => c.phoneNumber).filter(Boolean)).size,
            totalDuration: totalStats.reduce((sum, c) => sum + (c.recordingDuration || 0), 0),
            incomingDuration: totalStats.filter(c => c.direction === 'inbound').reduce((sum, c) => sum + (c.recordingDuration || 0), 0),
            outgoingDuration: totalStats.filter(c => c.direction === 'outbound').reduce((sum, c) => sum + (c.recordingDuration || 0), 0),
        };
        // Sort by total calls descending as a default
        report.sort((a, b) => b.totalCalls - a.totalCalls);
        res.json({
            table: report,
            summary
        });
    }
    catch (error) {
        console.error('[ReportController] getDailyReport error:', error);
        res.status(500).json({ message: 'Failed to fetch daily report' });
    }
};
exports.getDailyReport = getDailyReport;
