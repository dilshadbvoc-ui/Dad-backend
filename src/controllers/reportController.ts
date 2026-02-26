import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import ExcelJS from 'exceljs';

/**
 * Get leads report with filters
 * Query params: stage, status, userId, startDate, endDate
 */
export const getLeadsReport = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ message: 'Unauthorized' });

        const orgId = getOrgId(user);
        const subordinateIds = await getSubordinateIds(user.id);

        const { stage, status, userId, startDate, endDate } = req.query;

        const where: any = {
            organisationId: orgId,
            isDeleted: false
        };

        // If not admin, restrict to self and subordinates
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            where.assignedToId = { in: [...subordinateIds, user.id] };
        }

        if (stage) where.stage = stage as string;
        if (status) where.status = status as string;
        if (userId) where.assignedToId = userId as string;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate as string);
            if (endDate) where.createdAt.lte = new Date(endDate as string);
        }

        const leads = await prisma.lead.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Aggregate by stage and status
        const byStage = leads.reduce((acc: any, lead) => {
            const s = lead.stage || 'Unknown';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
        }, {});

        const byStatus = leads.reduce((acc: any, lead) => {
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
    } catch (error) {
        console.error('[ReportController] getLeadsReport error:', error);
        res.status(500).json({ message: 'Failed to fetch leads report' });
    }
};

/**
 * Get user performance metrics
 */
export const getUserPerformance = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const subordinateIds = await getSubordinateIds(user.id);

        const { startDate, endDate } = req.query;

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate as string);
        if (endDate) dateFilter.lte = new Date(endDate as string);

        const users = await prisma.user.findMany({
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
                prisma.lead.count({
                    where: {
                        assignedToId: user.id,
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                }),
                prisma.lead.count({
                    where: {
                        assignedToId: user.id,
                        status: 'converted',
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { updatedAt: dateFilter } : {})
                    }
                }),
                prisma.interaction.count({
                    where: {
                        createdById: user.id,
                        type: 'call',
                        isDeleted: false,
                        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
                    }
                }),
                prisma.calendarEvent.count({
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
    } catch (error) {
        console.error('[ReportController] getUserPerformance error:', error);
        res.status(500).json({ message: 'Failed to fetch user performance' });
    }
};

/**
 * Get sales book data with time period filter
 * Query params: period (day|week|month|year)
 */
export const getSalesBook = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const subordinateIds = await getSubordinateIds(user.id);
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

        const where: any = {
            organisationId: orgId as string,
            stage: 'closed_won',
            isDeleted: false,
            updatedAt: { gte: startDate }
        };

        // If not admin, restrict to self and subordinates
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            where.ownerId = { in: [...subordinateIds, user.id] };
        }

        // Get won opportunities (sales)
        const sales = await prisma.opportunity.findMany({
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
        const byUser = sales.reduce((acc: any, sale) => {
            const ownerName = (sale as any).owner ? `${(sale as any).owner.firstName} ${(sale as any).owner.lastName}` : 'Unassigned';
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
                account: (s as any).account?.name || 'N/A',
                owner: (s as any).owner ? `${(s as any).owner.firstName} ${(s as any).owner.lastName}` : 'Unassigned',
                closedAt: s.updatedAt
            })),
            summary: {
                totalDeals: sales.length,
                totalValue,
                averageDealSize,
                byUser
            }
        });
    } catch (error) {
        console.error('[ReportController] getSalesBook error:', error);
        res.status(500).json({ message: 'Failed to fetch sales book' });
    }
};

/**
 * Export report data to Excel
 * Params: type (leads|performance|sales)
 */
export const exportToExcel = async (req: Request, res: Response) => {
    try {
        const { type } = req.params;
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const subordinateIds = await getSubordinateIds(user.id);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CRM Reports';
        workbook.created = new Date();

        if (type === 'leads') {
            const leads = await prisma.lead.findMany({
                where: {
                    organisationId: orgId as string,
                    assignedToId: { in: [...subordinateIds, user.id] },
                    isDeleted: false
                },
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
                    assignedTo: (lead as any).assignedTo ? `${(lead as any).assignedTo.firstName} ${(lead as any).assignedTo.lastName}` : '',
                    createdAt: lead.createdAt.toLocaleDateString()
                });
            });

            // Style header
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

        } else if (type === 'sales') {
            const where: any = {
                organisationId: orgId as string,
                stage: 'closed_won',
                isDeleted: false
            };
            if (user.role !== 'admin' && user.role !== 'super_admin') {
                where.ownerId = { in: [...subordinateIds, user.id] };
            }

            const sales = await prisma.opportunity.findMany({
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
                    account: (sale as any).account?.name || 'N/A',
                    amount: sale.amount,
                    owner: (sale as any).owner ? `${(sale as any).owner.firstName} ${(sale as any).owner.lastName}` : 'Unassigned',
                    closedAt: sale.updatedAt.toLocaleDateString()
                });
            });

            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${type}_report_${Date.now()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('[ReportController] exportToExcel error:', error);
        res.status(500).json({ message: 'Failed to export report' });
    }
};

export const getTeamPerformanceReport = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(403).json({ message: 'No org' });

        const subordinateIds = await getSubordinateIds(user.id);
        const teamIds = [user.id, ...subordinateIds];

        const teamsData = await prisma.user.findMany({
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
            const leadStats = await prisma.lead.groupBy({
                by: ['status'],
                where: { assignedToId: u.id, organisationId: orgId, isDeleted: false },
                _count: true
            });

            const saleStats = await prisma.opportunity.aggregate({
                where: { ownerId: u.id, organisationId: orgId, stage: 'closed_won', isDeleted: false },
                _sum: { amount: true },
                _count: true
            });

            const lostStats = await prisma.lead.count({
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
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
