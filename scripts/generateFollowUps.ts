import prisma from '../src/config/prisma';

async function generateFollowUps() {
    try {
        const mainAdmin = await prisma.user.findUnique({ where: { email: 'demo@crm.com' } });
        if (!mainAdmin) return;
        const orgId = mainAdmin.organisationId;
        if (!orgId) {
            console.log("No orgId");
            return;
        }
        
        const leads = await prisma.lead.findMany({
            where: { organisationId: orgId },
            select: { id: true, firstName: true, assignedToId: true, organisationId: true }
        });

        const followUpsToCreate: any[] = [];
        let count = 0;

        for (const lead of leads) {
            if (!lead.assignedToId) continue;
            
            // ~75% chance to create a follow-up
            if (Math.random() < 0.75) {
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 5) + 1); // 1-5 days in future
                
                followUpsToCreate.push({
                    subject: `Follow up with ${lead.firstName || 'Lead'}`,
                    description: 'Auto-generated initial contact follow up.',
                    leadId: lead.id,
                    assignedToId: lead.assignedToId, // Must be assigned to the lead's owner
                    organisationId: lead.organisationId,
                    createdById: mainAdmin.id,
                    dueDate: dueDate,
                    status: 'not_started',
                    priority: 'medium'
                });
                count++;
            }
        }

        console.log(`Preparing to insert ${count} follow-ups...`);

        // Insert in chunks to avoid overwhelming the database
        for (let i = 0; i < followUpsToCreate.length; i += 1000) {
            const chunk = followUpsToCreate.slice(i, i + 1000);
            await prisma.followUp.createMany({ data: chunk });
            console.log(`Inserted chunk ${i / 1000 + 1}`);
        }

        console.log(`Successfully generated ${count} follow-up tasks!`);

    } catch (e) {
        console.error("Error generating follow-ups:", e);
    } finally {
        await prisma.$disconnect();
    }
}
generateFollowUps();
