import prisma from '../config/prisma';

// Backfills Lead.status for leads that were converted before the won/lost split existed.
// convertLead used to always write 'converted'; it now writes 'won'/'lost' when the opportunity
// is created already closed, and updateOpportunity back-syncs it when closed later. This script
// brings pre-existing 'converted' leads in line with their linked opportunity's actual outcome.
async function main() {
    const dryRun = process.argv.includes('--dry-run');

    const candidates = await prisma.lead.findMany({
        where: {
            status: 'converted',
            convertedOpportunities: { some: { stage: { in: ['closed_won', 'closed_lost'] } } }
        },
        select: {
            id: true,
            organisationId: true,
            convertedOpportunities: {
                where: { stage: { in: ['closed_won', 'closed_lost'] } },
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: { stage: true }
            }
        }
    });

    const wonIds: string[] = [];
    const lostIds: string[] = [];
    for (const lead of candidates) {
        const stage = lead.convertedOpportunities[0]?.stage;
        if (stage === 'closed_won') wonIds.push(lead.id);
        else if (stage === 'closed_lost') lostIds.push(lead.id);
    }

    console.log(`Found ${candidates.length} converted leads with a closed opportunity: ${wonIds.length} won, ${lostIds.length} lost.`);

    if (dryRun) {
        console.log('Dry run — no writes performed. Re-run without --dry-run to apply.');
        return;
    }

    if (wonIds.length) {
        const res = await prisma.lead.updateMany({ where: { id: { in: wonIds } }, data: { status: 'won' } });
        console.log(`Updated ${res.count} leads to status 'won'.`);
    }
    if (lostIds.length) {
        const res = await prisma.lead.updateMany({ where: { id: { in: lostIds } }, data: { status: 'lost' } });
        console.log(`Updated ${res.count} leads to status 'lost'.`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
