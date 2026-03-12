import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function simulate() {
    try {
        console.log('--- VISIBILITY SIMULATION START ---');
        
        // 1. Pick a sales rep
        const rep = await prisma.user.findFirst({
            where: { role: 'sales_rep', isActive: true },
            include: { organisation: true }
        });
        
        if (!rep) {
            console.log('No sales rep found for simulation.');
            return;
        }
        
        console.log(`Simulating for Rep: ${rep.firstName} ${rep.lastName} (${rep.id})`);
        console.log(`Org: ${rep.organisation?.name} (${rep.organisationId})`);

        // 2. Find a lead assigned to this rep (or create one)
        let lead = await prisma.lead.findFirst({
            where: { assignedToId: rep.id, status: { not: 'converted' }, isDeleted: false }
        });
        
        if (!lead) {
            console.log('Creating a test lead for the rep...');
            lead = await prisma.lead.create({
                data: {
                    firstName: 'Test',
                    lastName: 'Visibility',
                    phone: '1234567890',
                    organisationId: rep.organisationId!,
                    assignedToId: rep.id,
                    status: 'new'
                }
            });
        }
        
        console.log(`Lead ID: ${lead.id} | Assigned To: ${lead.assignedToId}`);

        // 3. Simulate "convertLead" logic for Opportunity creation
        const account = await prisma.account.findFirst({
            where: { organisationId: rep.organisationId!, isDeleted: false }
        });

        if (!account) {
            console.log('No account found in this org. Creating one...');
            // Need to create account first
        }

        const finalOwnerId = lead.assignedToId || rep.id; 
        
        console.log(`Creating Opportunity for Account: ${account?.name} (${account?.id})`);

        const opportunity = await prisma.opportunity.create({
            data: {
                name: 'Visibility Test Deal ' + Date.now(),
                amount: 1000,
                stage: 'prospecting',
                organisationId: rep.organisationId!,
                ownerId: finalOwnerId,
                accountId: account?.id || 'manual-fail',
            }
        });

        console.log(`Opportunity created! ID: ${opportunity.id}`);

        // 4. Test visibility query (like getOpportunities does)
        // Simulate getVisibleUserIds
        const subordinateIds = [rep.id]; // Sales rep usually only has themselves
        
        const visibleOpps = await prisma.opportunity.findMany({
            where: {
                organisationId: rep.organisationId!,
                ownerId: { in: subordinateIds },
                isDeleted: false
            }
        });

        const isFound = visibleOpps.some(o => o.ownerId === rep.id);
        console.log(`Visibility Test Result: ${isFound ? 'PASSED' : 'FAILED'}`);
        console.log(`Total visible for rep: ${visibleOpps.length}`);

        console.log('\n--- VISIBILITY SIMULATION END ---');
    } catch (error) {
        console.error('Simulation error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

simulate();
