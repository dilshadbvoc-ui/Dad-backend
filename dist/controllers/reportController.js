"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeamPerformanceReport = exports.exportToExcel = exports.getSalesBook = exports.getUserPerformance = exports.getLeadsReport = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const exceljs_1 = __importDefault(require("exceljs"));
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
        const { stage, status, userId, startDate, endDate } = req.query;
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        // If not admin, restrict to self and subordinates
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            where.assignedToId = { in: [...subordinateIds, user.id] };
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
                assignedTo: { select: { id: true, firstName: true, lastName: true } }
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
        const { startDate, endDate } = req.query;
        const dateFilter = {};
        if (startDate)
            dateFilter.gte = new Date(startDate);
        if (endDate)
            dateFilter.lte = new Date(endDate);
        const users = await prisma_1.default.user.findMany({
            where: {
                id: { in: [...subordinateIds, user.id] },
                organisationId: orgId,
                isActive: true
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                dailyLeadQuota: true
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
                    dailyQuota: user.dailyLeadQuota
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
        const { period = 'month' } = req.query;
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
        // If not admin, restrict to self and subordinates
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            where.ownerId = { in: [...subordinateIds, user.id] };
        }
        // Get won opportunities (sales)
        const sales = await prisma_1.default.opportunity.findMany({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
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
        const { startDate, endDate, branchId, userId, stage, status } = req.query;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return res.status(401).json({ message: 'Organisation not found' });
        }
        const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
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
                where.assignedToId = { in: [...subordinateIds, user.id] };
            }
            else if (userId) {
                where.assignedToId = userId;
            }
            if (stage)
                where.stage = stage;
            if (status)
                where.status = status;
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
                where.ownerId = { in: [...subordinateIds, user.id] };
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
                    id: { in: [...subordinateIds, user.id] },
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
                where: { organisationId: orgId, isDeleted: false },
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
                where: { organisationId: orgId },
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
                where: { organisationId: orgId, isDeleted: false },
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
        const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
        const teamIds = [user.id, ...subordinateIds];
        const teamsData = await prisma_1.default.user.findMany({
            where: { id: { in: teamIds } },
            select: {
                id: true,
                firstName: true,
                lastName: true,
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
