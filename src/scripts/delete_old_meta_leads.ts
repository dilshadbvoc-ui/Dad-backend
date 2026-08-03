import prisma from '../config/prisma';

async function deleteOldMetaLeads() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true }
        });

        if (!user || !user.organisationId) return;

        const todayStart = new Date("2026-07-30T18:30:00.000Z"); // July 31st 12 AM IST

        // Find leads to delete to log them
        const leadsToDelete = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId,
                source: { in: ['meta_ads', 'meta_leadgen'] },
                createdAt: { lt: todayStart }
            },
            select: { id: true }
        });

        const ids = leadsToDelete.map(l => l.id);
        console.log(`Found ${ids.length} Meta leads created before today.`);

        if (ids.length > 0) {
            // Delete related records if necessary (e.g. Activity, Note)
            // Prisma might not cascade delete automatically depending on schema, 
            // let's do a direct delete if cascade is set, or delete related first.
            // Let's just try deleting the leads.
            const result = await prisma.lead.deleteMany({
                where: {
                    id: { in: ids }
                }
            });
            console.log(`Successfully deleted ${result.count} old Meta leads from DB.`);
        } else {
            console.log("No old leads to delete.");
        }
    } catch (e: any) {
        console.error("Error deleting leads:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}
deleteOldMetaLeads();
