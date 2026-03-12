import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function diagnose() {
    try {
        console.log('--- DIAGNOSTIC START ---');
        
        // 1. Get recent opportunities
        const recentOpps = await prisma.opportunity.findMany({
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
                owner: { select: { id: true, firstName: true, lastName: true, role: true, branchId: true } },
                account: { select: { name: true } }
            }
        });

        console.log(`Found ${recentOpps.length} active opportunities.`);
        
        recentOpps.forEach((opp, i) => {
            console.log(`\n[${i+1}] ${opp.name}`);
            console.log(`  ID: ${opp.id}`);
            console.log(`  Owner: ${opp.owner?.firstName} ${opp.owner?.lastName} (${opp.owner?.id})`);
            console.log(`  Role: ${opp.owner?.role}`);
            console.log(`  OrgID: ${opp.organisationId}`);
            console.log(`  BranchID: ${opp.branchId}`);
            console.log(`  Stage: ${opp.stage}`);
            console.log(`  IsDeleted: ${opp.isDeleted}`);
            console.log(`  Created: ${opp.createdAt}`);
        });

        // 2. Sample User check
        if (recentOpps.length > 0) {
            const ownerId = recentOpps[0].ownerId;
            if (ownerId) {
                const owner = await prisma.user.findUnique({
                    where: { id: ownerId },
                    include: { organisation: true }
                });
                console.log(`\nOwner Detail: ${owner?.firstName} (Org: ${owner?.organisation?.name})`);
            }
        }

        console.log('\n--- DIAGNOSTIC END ---');
    } catch (error) {
        console.error('Diagnostic error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
