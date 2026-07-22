import prisma from '../src/config/prisma';
import * as bcrypt from 'bcryptjs';

async function setupHierarchy() {
    try {
        const mainAdminEmail = 'demo@crm.com';
        const mainAdmin = await prisma.user.findUnique({
            where: { email: mainAdminEmail }
        });

        if (!mainAdmin || !mainAdmin.organisationId) {
            console.log(`Main admin ${mainAdminEmail} or organisation not found.`);
            return;
        }

        const orgId = mainAdmin.organisationId;
        console.log(`Setting up hierarchy for Organization ID: ${orgId}`);

        // ==========================================
        // 1. Create New Users
        // ==========================================
        const passwordHash = await bcrypt.hash('12345', 10);
        const newUsers = [];

        // Admin: Dilshad
        console.log('Creating Dilshad (Admin/Manager)...');
        let dilshad = await prisma.user.findUnique({ where: { email: 'dilshad@crm.com' } });
        if (!dilshad) {
            dilshad = await prisma.user.create({
                data: {
                    firstName: 'Dilshad', lastName: '',
                    email: 'dilshad@crm.com', password: passwordHash,
                    role: 'admin', position: 'Manager',
                    reportsToId: mainAdmin.id, organisationId: orgId,
                    permissions: []
                }
            });
        }
        newUsers.push(dilshad);

        // Sales Rep: Abheesh
        console.log('Creating Abheesh (Team Leader)...');
        let abheesh = await prisma.user.findUnique({ where: { email: 'abheesh@crm.com' } });
        if (!abheesh) {
            abheesh = await prisma.user.create({
                data: {
                    firstName: 'Abheesh', lastName: '',
                    email: 'abheesh@crm.com', password: passwordHash,
                    role: 'sales_rep', position: 'Team Leader',
                    reportsToId: dilshad.id, organisationId: orgId,
                    permissions: []
                }
            });
        }
        newUsers.push(abheesh);

        // Academy Counselors
        const counselorNames = ['Fathima', 'Adithyan', 'Akhil', 'Rahul', 'Nikhil', 'Sneha', 'Vivek', 'Neha', 'Arjun'];
        const counselors = [];
        console.log('Creating Academy Counselors...');
        for (const name of counselorNames) {
            const email = `${name.toLowerCase()}@crm.com`;
            let c = await prisma.user.findUnique({ where: { email } });
            if (!c) {
                c = await prisma.user.create({
                    data: {
                        firstName: name, lastName: '',
                        email: email, password: passwordHash,
                        role: 'sales_rep', position: 'Academy Counselor',
                        reportsToId: abheesh.id, organisationId: orgId,
                        permissions: []
                    }
                });
            }
            counselors.push(c);
            newUsers.push(c);
        }

        // ==========================================
        // 2. Distribute Leads
        // ==========================================
        console.log('Distributing Leads...');
        const allLeads = await prisma.lead.findMany({ 
            where: { organisationId: orgId },
            select: { id: true, status: true }
        });

        const closedLeads = allLeads.filter(l => l.status === 'converted' || l.status === 'lost');
        const openLeads = allLeads.filter(l => !(l.status === 'converted' || l.status === 'lost'));

        const updateGroups = new Map<string, string[]>();
        const assign = (leadId: string, userId: string) => {
            if (!updateGroups.has(userId)) updateGroups.set(userId, []);
            updateGroups.get(userId)!.push(leadId);
        };

        // Assign some closed leads to Dilshad and Abheesh (max 5 combined)
        let closedIdx = 0;
        for (let i = 0; i < 2 && closedIdx < closedLeads.length; i++, closedIdx++) {
            assign(closedLeads[closedIdx].id, dilshad.id);
        }
        for (let i = 0; i < 3 && closedIdx < closedLeads.length; i++, closedIdx++) {
            assign(closedLeads[closedIdx].id, abheesh.id);
        }

        // Assign rest to counselors in round-robin
        const remainingLeads = [...closedLeads.slice(closedIdx), ...openLeads];
        let cIdx = 0;
        for (const lead of remainingLeads) {
            assign(lead.id, counselors[cIdx].id);
            cIdx = (cIdx + 1) % counselors.length;
        }

        // Execute bulk updates
        for (const [userId, leadIds] of updateGroups.entries()) {
            for (let i = 0; i < leadIds.length; i += 1000) {
                const chunk = leadIds.slice(i, i + 1000);
                await prisma.lead.updateMany({
                    where: { id: { in: chunk } },
                    data: { assignedToId: userId, previousOwnerId: null }
                });
                await prisma.followUp.updateMany({
                    where: { leadId: { in: chunk } },
                    data: { assignedToId: userId }
                });
                await prisma.task.updateMany({
                    where: { leadId: { in: chunk } },
                    data: { assignedToId: userId }
                });
            }
        }
        console.log('Successfully redistributed all leads and their follow-ups.');

        // ==========================================
        // 3. Cleanup Old Users
        // ==========================================
        console.log('Identifying old users for cleanup...');
        const excludeIds = [mainAdmin.id, ...newUsers.map(u => u.id)];
        const oldUsers = await prisma.user.findMany({
            where: {
                organisationId: orgId,
                id: { notIn: excludeIds }
            }
        });

        console.log(`Found ${oldUsers.length} old users to remove.`);

        for (const user of oldUsers) {
            try {
                // Orphan reassignments just in case
                await prisma.lead.updateMany({ where: { createdById: user.id }, data: { createdById: mainAdmin.id } });
                await prisma.followUp.updateMany({ where: { assignedToId: user.id }, data: { assignedToId: mainAdmin.id } });
                await prisma.task.updateMany({ where: { assignedToId: user.id }, data: { assignedToId: mainAdmin.id } });
                await prisma.leadHistory.deleteMany({
                    where: {
                        OR: [
                            { oldOwnerId: user.id },
                            { newOwnerId: user.id },
                            { changedById: user.id }
                        ]
                    }
                });

                await prisma.user.delete({ where: { id: user.id } });
                console.log(`Deleted user: ${user.firstName} ${user.lastName} (${user.email})`);
            } catch (err: any) {
                console.error(`Failed to delete user ${user.email}. Probably due to foreign key constraints.`);
                console.error(err.message);
            }
        }

        console.log('\n--- HIERARCHY SETUP COMPLETE ---');

    } catch (e) {
        console.error('Error during setup:', e);
    } finally {
        await prisma.$disconnect();
    }
}

setupHierarchy();
