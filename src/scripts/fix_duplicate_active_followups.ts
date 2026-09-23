import prisma from '../config/prisma';

/**
 * One-off cleanup for the pre-2026-09-03 rescheduleOrCreateFollowUp bug
 * (fixed in commit a195b808): a lead could accumulate more than one
 * non-terminal FollowUp row when a reschedule picked the wrong existing row
 * to update instead of creating a duplicate. The code fix stops new
 * duplicates from forming; this script cleans up the backlog it already
 * left behind.
 *
 * For each lead with more than one active (not_started/in_progress)
 * FollowUp assigned to the given user, keeps the one whose dueDate matches
 * the Lead's own `nextFollowUp` field (the authoritative "what's actually
 * next" value the rep sees) and defers the rest. Falls back to the
 * soonest-due row only when none of them match `nextFollowUp` (e.g. it's
 * null, or was itself never synced) - NOT "soonest due" as the primary
 * rule, which was tried first and is wrong: it can defer the genuinely
 * correct, later-dated row in favor of a stale earlier one (confirmed
 * live for Ameena's "Abdul Saleem Nov 22" and "Noufia kc" leads).
 *
 * Usage: npx tsx src/scripts/fix_duplicate_active_followups.ts <userId> [--dry-run]
 * Omit <userId> to run across an entire organisation instead:
 *   npx tsx src/scripts/fix_duplicate_active_followups.ts --org <organisationId> [--dry-run]
 */
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const orgIndex = args.indexOf('--org');
    const orgId = orgIndex !== -1 ? args[orgIndex + 1] : undefined;
    const userId = !orgId ? args.find((a) => !a.startsWith('--')) : undefined;

    if (!userId && !orgId) {
        console.error('Usage: fix_duplicate_active_followups.ts <userId> | --org <organisationId> [--dry-run]');
        process.exitCode = 1;
        return;
    }

    const where: any = { isDeleted: false, status: { in: ['not_started', 'in_progress'] } };
    if (userId) where.assignedToId = userId;
    if (orgId) where.organisationId = orgId;

    const active = await prisma.followUp.findMany({
        where,
        select: { id: true, leadId: true, dueDate: true, assignedToId: true }
    });

    const byLead = new Map<string, typeof active>();
    for (const f of active) {
        if (!f.leadId) continue;
        const group = byLead.get(f.leadId) || [];
        group.push(f);
        byLead.set(f.leadId, group);
    }
    const dupGroups = [...byLead.entries()].filter(([, arr]) => arr.length > 1);

    let toDefer: string[] = [];
    for (const [leadId, arr] of dupGroups) {
        const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { nextFollowUp: true } });
        let keepId: string | undefined;

        if (lead?.nextFollowUp) {
            const match = arr.find(
                (f) => Math.abs(new Date(lead.nextFollowUp!).getTime() - new Date(f.dueDate).getTime()) < 60_000
            );
            keepId = match?.id;
        }
        if (!keepId) {
            const sorted = [...arr].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
            keepId = sorted[0].id;
        }
        for (const f of arr) if (f.id !== keepId) toDefer.push(f.id);
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}Found ${dupGroups.length} leads with duplicate active follow-ups (${toDefer.length} extra records to defer).`);

    if (dryRun || toDefer.length === 0) return;

    const result = await prisma.followUp.updateMany({
        where: { id: { in: toDefer } },
        data: { status: 'deferred' }
    });
    console.log(`Deferred ${result.count} orphaned duplicate follow-ups.`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
