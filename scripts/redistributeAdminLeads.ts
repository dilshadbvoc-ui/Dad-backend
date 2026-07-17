import prisma from '../src/config/prisma';

async function redistributeAdminLeads() {
    try {
        const adminEmail = 'manager@edufolio.org';
        const adminUser = await prisma.user.findUnique({
            where: { email: adminEmail }
        });

        if (!adminUser) {
            console.log(`Admin user with email ${adminEmail} not found.`);
            return;
        }

        console.log(`Admin ID: ${adminUser.id}, Org: ${adminUser.organisationId}`);

        // Find leads currently assigned to the admin
        const adminLeads = await prisma.lead.findMany({
            where: {
                assignedToId: adminUser.id,
                isDeleted: false
            }
        });

        console.log(`Found ${adminLeads.length} leads assigned to the admin.`);

        if (adminLeads.length === 0) {
            console.log('No leads to redistribute.');
            return;
        }

        // Find active users in the org to redistribute to
        const activeUsers = await prisma.user.findMany({
            where: {
                organisationId: adminUser.organisationId,
                isActive: true,
                isOffDuty: false,
                role: { notIn: ['super_admin', 'admin'] }
            },
            select: { id: true, firstName: true, lastName: true }
        });

        console.log(`Found ${activeUsers.length} active normal users for redistribution.`);
        if (activeUsers.length === 0) {
            console.log('No active users to receive leads!');
            return;
        }

        // Round robin distribution
        let userIndex = 0;
        let redistributedCount = 0;

        for (const lead of adminLeads) {
            const assignee = activeUsers[userIndex];
            
            // Reassign lead
            await prisma.lead.update({
                where: { id: lead.id },
                data: {
                    assignedToId: assignee.id
                }
            });

            // Log to history
            await prisma.leadHistory.create({
                data: {
                    leadId: lead.id,
                    oldOwnerId: lead.assignedToId,
                    newOwnerId: assignee.id,
                    changedById: adminUser.id,
                    reason: 'Redistributed from admin to normal user (correction)',
                    fieldName: 'assignedToId',
                    oldValue: lead.assignedToId || undefined,
                    newValue: assignee.id
                }
            });

            redistributedCount++;
            userIndex = (userIndex + 1) % activeUsers.length;
        }

        console.log(`Successfully redistributed ${redistributedCount} leads.`);

    } catch (error) {
        console.error('Error redistributing leads:', error);
    } finally {
        await prisma.$disconnect();
    }
}

redistributeAdminLeads();
