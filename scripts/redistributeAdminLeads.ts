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

        // Find leads currently assigned to the admin OR leads where assignedToId is null but created by admin
        const adminLeads = await prisma.lead.findMany({
            where: {
                OR: [
                    { assignedToId: adminUser.id },
                    { assignedToId: null, createdById: adminUser.id }
                ],
                isDeleted: false
            }
        });

        console.log(`Found ${adminLeads.length} leads assigned to or created by the admin.`);

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
            select: { id: true, firstName: true, lastName: true, teamId: true, branchId: true }
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
            
            // Reassign lead, update status to shuffled_lead, and sync team/branch
            try {
                await prisma.lead.update({
                    where: { id: lead.id },
                    data: {
                        assignedToId: assignee.id,
                        status: 'shuffled_lead',
                        teamId: assignee.teamId || null,
                        branchId: assignee.branchId || null,
                        previousOwnerId: adminUser.id
                    }
                });

                // Log to history
                await prisma.leadHistory.create({
                    data: {
                        leadId: lead.id,
                        oldOwnerId: lead.assignedToId,
                        newOwnerId: assignee.id,
                        changedById: adminUser.id,
                        reason: 'Redistributed from admin to normal user via manual script',
                        fieldName: 'assignedToId',
                        oldValue: lead.assignedToId || undefined,
                        newValue: assignee.id
                    }
                });
                
                await prisma.leadHistory.create({
                    data: {
                        leadId: lead.id,
                        changedById: adminUser.id,
                        reason: 'Redistributed from admin to normal user via manual script',
                        fieldName: 'status',
                        oldValue: lead.status || undefined,
                        newValue: 'shuffled_lead'
                    }
                });

                redistributedCount++;
            } catch (e: any) {
                if (e.code === 'P2002') {
                    console.log(`Unique constraint failed for lead ${lead.id} on branch reassignment. Reassigning without changing branch.`);
                    try {
                        await prisma.lead.update({
                            where: { id: lead.id },
                            data: {
                                assignedToId: assignee.id,
                                status: 'shuffled_lead',
                                teamId: assignee.teamId || null,
                                previousOwnerId: adminUser.id
                            }
                        });
                        redistributedCount++;
                    } catch(err) {
                        console.error(`Failed to reassign lead ${lead.id}:`, err);
                    }
                } else {
                    console.error(`Failed to reassign lead ${lead.id}:`, e);
                }
            }
            
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
