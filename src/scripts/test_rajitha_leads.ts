import { PrismaClient, LeadSource, Prisma } from '../generated/client';
import { getVisibleUserIds } from '../utils/hierarchyUtils';

const prisma = new PrismaClient();

async function main() {
    const rajitha = await prisma.user.findFirst({ where: { firstName: { contains: 'Rajitha' } } });
    if (!rajitha) {
        console.log("Rajitha not found");
        return;
    }
    console.log("Rajitha ID:", rajitha.id, "Role:", rajitha.role);

    const visibleUserIds = await getVisibleUserIds(rajitha.id);
    console.log("Visible User IDs:", visibleUserIds.length);

    // 1. Simulate getLeadSourceAnalytics
    const analyticsWhere: Prisma.LeadWhereInput = {
        isDeleted: false,
        assignedToId: { in: visibleUserIds },
        organisationId: rajitha.organisationId!
    };
    
    const sourceStats = await prisma.lead.groupBy({
        by: ['source'],
        where: analyticsWhere,
        _count: { source: true },
        orderBy: { _count: { source: 'desc' } }
    });
    console.log("Analytics sourceStats:", sourceStats);

    // 2. Simulate getLeads
    const orConditions: any[] = [
        { assignedToId: { in: visibleUserIds } },
        { createdById: rajitha.id },
        {
            AND: [
                { createdById: { in: visibleUserIds } },
                { assignedToId: null }
            ]
        }
    ];

    if (rajitha.role === 'admin') {
        orConditions.push({ assignedToId: null });
    } else if (rajitha.role === 'manager') {
        orConditions.push({
            AND: [
                { assignedToId: null },
                {
                    OR: [
                        { branchId: null },
                        { branchId: rajitha.branchId || undefined }
                    ]
                }
            ]
        });
    }

    const leadsWhere: Prisma.LeadWhereInput = {
        isDeleted: false,
        organisationId: rajitha.organisationId!,
        source: 'meta_leadgen',
        AND: [{ OR: orConditions }]
    };

    const leads = await prisma.lead.findMany({
        where: leadsWhere,
        select: { id: true, source: true, assignedToId: true, branchId: true }
    });

    console.log("Leads from getLeads with source=meta_leadgen:", leads.length);
    if (leads.length > 0) {
        console.log(leads);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
