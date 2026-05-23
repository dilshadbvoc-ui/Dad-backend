import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function profile() {
    console.log("⚡ Starting Query Profiler...");

    // Mimic the most common user in the logs:
    // Org: 85cc3715-7f8d-4f22-b0b0-a40a502bc6fa
    // User role: admin (d86f65fa-bd2b-4083-baa2-516038552d86)
    const orgId = "85cc3715-7f8d-4f22-b0b0-a40a502bc6fa";
    const combinedFilter = { organisationId: orgId };
    
    // Visibility list (15 users from getViolations logs)
    const visibleUserIds = [
        "d86f65fa-bd2b-4083-baa2-516038552d86",
        "c2d7e5d0-62e6-49b3-8a73-ef28e4fc7a1a",
        "53da2bee-1da9-4273-9fe0-288637801d6d",
        "c449e1d9-16c0-4dfc-9a6f-45b840924d9a",
        "de32f640-3438-4145-84b4-c69d59c883d1",
        "ca027094-f249-4f67-9cbf-82d865538036",
        "5711e40b-0fb5-4f86-b8cd-7f3543da1b54",
        "a5e061e5-5541-434d-acf6-a50b1df6c92d",
        "0f77cacf-7d0d-4327-8779-f47048733a9c",
        "a83eeafe-3682-412e-a86d-28799d8e642d",
        "28f1e09a-6b76-4480-af09-4dec0c995f59",
        "64f74066-5d85-4f77-800a-b5acfdbc9c5f",
        "0a0630d9-203e-43a9-836b-2ff7f7ae1922",
        "3f2d8415-3217-4844-adb3-cd3a8643ff94",
        "f37694d5-97f2-42e4-8c8d-f9cb6a710119"
    ];

    const visibilityFilter = { assignedToId: { in: visibleUserIds } };
    const oppVisibilityFilter = { ownerId: { in: visibleUserIds } };

    const startOfMonth = new Date();
    startOfMonth.setMinutes(startOfMonth.getMinutes() + 330);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    startOfMonth.setMinutes(startOfMonth.getMinutes() - 330);

    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

    const paymentFilter: any = { organisationId: orgId };
    paymentFilter.opportunity = { ownerId: oppVisibilityFilter.ownerId };

    const runQuery = async (name: string, fn: () => Promise<any>) => {
        const start = Date.now();
        try {
            await fn();
            const duration = Date.now() - start;
            console.log(`⏱️ [${duration}ms] - ${name}`);
        } catch (e: any) {
            console.log(`❌ [FAILED] - ${name}: ${e.message}`);
        }
    };

    await runQuery("1. totalLeads count", () => 
        prisma.lead.count({ where: { ...combinedFilter, isDeleted: false, ...visibilityFilter } })
    );

    await runQuery("2. newLeads count", () => 
        prisma.lead.count({ where: { ...combinedFilter, isDeleted: false, status: 'new', ...visibilityFilter } })
    );

    await runQuery("3. convertedLeads count", () => 
        prisma.lead.count({ where: { ...combinedFilter, isDeleted: false, status: 'converted', ...visibilityFilter } })
    );

    await runQuery("4. totalRevenue aggregate", () => 
        prisma.paymentRecord.aggregate({
            where: { ...paymentFilter, paymentDate: { lte: new Date() } },
            _sum: { amount: true }
        })
    );

    await runQuery("5. pipelineResult aggregate", () => 
        prisma.opportunity.aggregate({
            where: { ...combinedFilter, isDeleted: false, ...oppVisibilityFilter },
            _sum: { amount: true }
        })
    );

    await runQuery("6. totalContacts count", () => 
        prisma.contact.count({
            where: { ...combinedFilter, isDeleted: false, ownerId: { in: visibleUserIds } }
        })
    );

    await runQuery("7. totalAccounts count", () => 
        prisma.account.count({
            where: { ...combinedFilter, isDeleted: false, ownerId: { in: visibleUserIds } }
        })
    );

    await runQuery("8. prevLeads count", () => 
        prisma.lead.count({
            where: {
                ...combinedFilter,
                isDeleted: false,
                createdAt: { gte: startOfLastMonth, lt: startOfMonth },
                ...visibilityFilter
            }
        })
    );

    await runQuery("9. prevRevenue aggregate", () => 
        prisma.paymentRecord.aggregate({
            where: { ...paymentFilter, paymentDate: { gte: startOfLastMonth, lt: startOfMonth } },
            _sum: { amount: true }
        })
    );

    await runQuery("10. totalClosedCurrent count", () => 
        prisma.opportunity.count({
            where: {
                ...combinedFilter,
                isDeleted: false,
                stage: { in: ['closed_won', 'closed_lost'] },
                closeDate: { gte: startOfMonth },
                ...oppVisibilityFilter
            }
        })
    );

    await runQuery("11. wonCurrent count", () => 
        prisma.opportunity.count({
            where: {
                ...combinedFilter,
                isDeleted: false,
                stage: 'closed_won',
                closeDate: { gte: startOfMonth },
                ...oppVisibilityFilter
            }
        })
    );

    await runQuery("12. wonTotal count", () => 
        prisma.opportunity.count({
            where: { ...combinedFilter, isDeleted: false, stage: 'closed_won', ...oppVisibilityFilter }
        })
    );

    await runQuery("13. lostTotal count", () => 
        prisma.opportunity.count({
            where: { ...combinedFilter, isDeleted: false, stage: 'closed_lost', ...oppVisibilityFilter }
        })
    );

    await runQuery("14. activeOpportunitiesCount", () => 
        prisma.opportunity.count({
            where: { ...combinedFilter, isDeleted: false, stage: { notIn: ['closed_won', 'closed_lost'] }, ...oppVisibilityFilter }
        })
    );

    await runQuery("15. totalOpportunitiesCount", () => 
        prisma.opportunity.count({
            where: { ...combinedFilter, isDeleted: false, ...oppVisibilityFilter }
        })
    );

    await runQuery("16. revenueThisMonth aggregate", () => 
        prisma.paymentRecord.aggregate({
            where: { ...paymentFilter, paymentDate: { gte: startOfMonth } },
            _sum: { amount: true }
        })
    );

    await runQuery("17. pendingFollowUpsCount", () => 
        prisma.followUp.count({
            where: {
                ...combinedFilter,
                isDeleted: false,
                status: { in: ['not_started', 'in_progress'] },
                dueDate: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
                assignedToId: { in: visibleUserIds }
            }
        })
    );

    console.log("🏁 Profiling Complete.");
    process.exit(0);
}

profile();
