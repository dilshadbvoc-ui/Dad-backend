import prisma from '../src/config/prisma';

async function fix() {
    const leads = await prisma.lead.findMany({
        where: { assignedToId: { not: null } },
        select: {
            id: true,
            phone: true,
            assignedToId: true,
            teamId: true,
            branchId: true,
            assignedTo: {
                select: {
                    teamId: true,
                    branchId: true
                }
            }
        }
    });

    let c = 0;
    let failed = 0;
    for (const l of leads) {
        if (!l.assignedTo) continue;
        if (l.teamId !== l.assignedTo.teamId || l.branchId !== l.assignedTo.branchId) {
            try {
                await prisma.lead.update({
                    where: { id: l.id },
                    data: {
                        teamId: l.assignedTo.teamId || null,
                        branchId: l.assignedTo.branchId || null
                    }
                });
                c++;
            } catch (e: any) {
                if (e.code === 'P2002') {
                    // Try to just update teamId if branchId fails
                    try {
                        await prisma.lead.update({
                            where: { id: l.id },
                            data: {
                                teamId: l.assignedTo.teamId || null
                            }
                        });
                        c++;
                    } catch (e2) {
                        failed++;
                    }
                } else {
                    failed++;
                }
            }
        }
    }
    console.log(`Fixed ${c} leads. Failed to fix ${failed} leads.`);
}

fix().catch(console.error).finally(() => prisma.$disconnect());
