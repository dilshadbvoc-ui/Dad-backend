import prisma from '../config/prisma';

/**
 * Two-part follow-up to fix_reenquiry_name_overwrites.ts:
 *
 * 1) Manually corrects lead b2d77c98-7422-48dc-8f2d-c2cb0c36ec70 (Ganga /
 *    Edufolio), which that backfill flipped to the WRONG name. The lead had
 *    two "Re-Enquiry Received" events fire seconds apart on 2026-09-21,
 *    before the code fix (commit 4c2ec608) deployed - the backfill's
 *    "trust the latest re-enquiry's logged before-name" heuristic picked up
 *    an intermediate corrupted state instead of the true original. The
 *    lead's own email (anvareyyanchery@gmail.com) confirms "anvar" is real.
 *
 * 2) Audits the other 215 leads touched by that backfill for the same
 *    double-overwrite shape - reEnquiryCount >= 2 with consecutive
 *    "Re-Enquiry Received" interactions less than 5 seconds apart, both
 *    dated before the 2026-09-23T08:41:29Z code-fix deploy - so we know
 *    whether any others need the same manual correction.
 *
 * Usage: npx tsx src/scripts/fix_anvar_lead_and_audit_double_overwrites.ts [--dry-run]
 */

const ORG_ID = '85cc3715-7f8d-4f22-b0b0-a40a502bc6fa'; // Edufolio
const ANVAR_LEAD_ID = 'b2d77c98-7422-48dc-8f2d-c2cb0c36ec70';
const CODE_FIX_DEPLOY_TIME = new Date('2026-09-23T08:41:29Z');
const BACKFILL_REASON_MARKER = 'Data correction: a same-phone re-enquiry from a different person';

async function fixAnvarLead(dryRun: boolean) {
    const lead = await prisma.lead.findUnique({
        where: { id: ANVAR_LEAD_ID },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true }
    });

    if (!lead) {
        console.error(`Lead ${ANVAR_LEAD_ID} not found - aborting.`);
        return;
    }

    const currentName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
    console.log(`Anvar lead current name: "${currentName}" (email: ${lead.email}, phone: ${lead.phone})`);

    if (currentName.toLowerCase() === 'anvar') {
        console.log('Already correct - skipping.');
        return;
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}Reverting "${currentName}" -> "anvar"`);

    if (!dryRun) {
        await prisma.lead.update({
            where: { id: ANVAR_LEAD_ID },
            data: { firstName: 'anvar', lastName: null }
        });
        await prisma.leadHistory.create({
            data: {
                leadId: ANVAR_LEAD_ID,
                fieldName: 'firstName/lastName',
                oldValue: currentName,
                newValue: 'anvar',
                changedById: null,
                reason: `Manual correction: the org-wide re-enquiry name-overwrite backfill (2026-09-23) mis-corrected this lead. It had two "Re-Enquiry Received" events fire 321ms apart on 2026-09-21, before the code fix deployed, so the backfill's "trust the latest re-enquiry" heuristic picked up an intermediate corrupted state ("${currentName}") instead of the true original name. Confirmed correct via the lead's email (anvareyyanchery@gmail.com).`
            }
        });
    }
}

async function auditDoubleOverwrites(dryRun: boolean) {
    // Find every lead this org's backfill touched.
    const backfillEntries = await prisma.leadHistory.findMany({
        where: {
            reason: { contains: BACKFILL_REASON_MARKER },
            lead: { organisationId: ORG_ID }
        },
        select: { leadId: true }
    });
    const touchedLeadIds = [...new Set(backfillEntries.map((e) => e.leadId))];
    console.log(`Backfill touched ${touchedLeadIds.length} leads in this org.`);

    const suspects: { leadId: string; gapMs: number; count: number }[] = [];

    for (const leadId of touchedLeadIds) {
        const reEnquiries = await prisma.interaction.findMany({
            where: { leadId, subject: 'Re-Enquiry Received', createdAt: { lt: CODE_FIX_DEPLOY_TIME } },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' }
        });

        if (reEnquiries.length < 2) continue;

        for (let i = 1; i < reEnquiries.length; i++) {
            const gapMs = reEnquiries[i].createdAt.getTime() - reEnquiries[i - 1].createdAt.getTime();
            if (gapMs < 5000) {
                suspects.push({ leadId, gapMs, count: reEnquiries.length });
                break;
            }
        }
    }

    console.log(`\nFound ${suspects.length} additional suspect lead(s) with back-to-back pre-fix re-enquiries:`);
    for (const s of suspects) {
        const lead = await prisma.lead.findUnique({
            where: { id: s.leadId },
            select: { firstName: true, lastName: true, email: true, phone: true, assignedToId: true }
        });
        console.log(
            `  ${s.leadId} - current name "${lead?.firstName} ${lead?.lastName}" - email ${lead?.email} - phone ${lead?.phone} - ${s.count} pre-fix re-enquiries, closest gap ${s.gapMs}ms`
        );
    }

    if (suspects.length === 0) {
        console.log('  (none - the Anvar lead was the only one with this shape)');
    }
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    await fixAnvarLead(dryRun);
    console.log('\n--- Auditing remaining 215 leads for the same double-overwrite shape ---');
    await auditDoubleOverwrites(dryRun);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
