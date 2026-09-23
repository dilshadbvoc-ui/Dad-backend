import prisma from '../config/prisma';

/**
 * Data fix for the DuplicateLeadService.handleReEnquiry name-overwrite bug
 * (fixed in code as of commit 4c2ec608): a re-enquiry matched purely by
 * phone number could belong to a genuinely different person, and the old
 * code unconditionally overwrote the existing lead's firstName/lastName
 * with whatever name the new submission carried.
 *
 * Each "Re-Enquiry Received" Interaction logged the lead's name AS IT WAS
 * right before that re-enquiry's update ran (`Lead ${existingLead.firstName}
 * ${existingLead.lastName} has enquired again...`). If the CURRENT lead
 * name doesn't match what's logged at its most recent re-enquiry, that
 * re-enquiry overwrote it - revert to the logged name.
 *
 * Filters out pure formatting noise ("X null" vs "X", from string-
 * concatenating a null lastName) rather than treating it as a real
 * mismatch - only genuinely different names are touched.
 *
 * Usage: npx tsx src/scripts/fix_reenquiry_name_overwrites.ts <organisationId> [--dry-run]
 */
function normalize(name: string): string {
    return (name || '')
        .replace(/\bnull\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

const noSpace = (name: string) => normalize(name).replace(/\s/g, '');

/** Alphabetic-only tokens of length >=3 - short tokens (initials like "N",
 *  "V") are excluded since two unrelated people can easily share those.
 *  Punctuation is stripped from each token itself, not just used to decide
 *  whether to keep it - "Jismi." and "Jismi" must compare equal. */
function significantTokens(name: string): Set<string> {
    return new Set(
        normalize(name)
            .split(/\s+/)
            .map((t) => t.replace(/[^a-z]/gi, ''))
            .filter((t) => t.length >= 3)
    );
}

/**
 * True when `before` and `after` look like the SAME person - a spelling
 * fix, added/removed middle name, spacing/casing difference, emoji/symbol
 * noise, etc. - as opposed to two different people who happened to share a
 * phone number. Only names with NO meaningful overlap at all are treated
 * as a genuine identity overwrite worth reverting.
 */
function looksLikeSamePerson(before: string, after: string): boolean {
    const beforeFlat = noSpace(before).replace(/[^a-z]/gi, '');
    const afterFlat = noSpace(after).replace(/[^a-z]/gi, '');
    if (beforeFlat === afterFlat) return true; // e.g. "Saiprasad" vs "Sai Prasad"
    // One name's flattened form fully contains the other's (e.g. "vishnurajr"
    // vs "vishnurajvishnu.." variants, or a name that just gained/lost a
    // trailing word run together) - a coincidence this exact is vanishingly
    // unlikely between two unrelated people's full names.
    if (beforeFlat.length >= 5 && afterFlat.length >= 5) {
        if (beforeFlat.includes(afterFlat) || afterFlat.includes(beforeFlat)) return true;
    }
    const a = significantTokens(before);
    const b = significantTokens(after);
    for (const token of a) if (b.has(token)) return true; // shares a real name token
    return false;
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const orgId = args.find((a) => !a.startsWith('--'));

    if (!orgId) {
        console.error('Usage: fix_reenquiry_name_overwrites.ts <organisationId> [--dry-run]');
        process.exitCode = 1;
        return;
    }

    const reEnquiryInteractions = await prisma.interaction.findMany({
        where: { organisationId: orgId, subject: 'Re-Enquiry Received', leadId: { not: null } },
        select: { leadId: true, description: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
    });

    // Keep only the LATEST re-enquiry per lead - that's the one whose "before"
    // name should match the lead's CURRENT name if nothing overwrote it since.
    const latestByLead = new Map<string, { description: string; createdAt: Date }>();
    for (const i of reEnquiryInteractions) {
        if (!i.leadId || !i.description) continue;
        latestByLead.set(i.leadId, { description: i.description, createdAt: i.createdAt });
    }

    let fixed = 0;

    for (const [leadId, i] of latestByLead) {
        const match = i.description.match(/^Lead (.+?) has enquired again/);
        if (!match) continue;
        const nameAtReEnquiryTime = match[1].trim();
        if (!normalize(nameAtReEnquiryTime)) continue; // "undefined" or empty - nothing to restore

        const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { firstName: true, lastName: true } });
        if (!lead) continue;

        const currentName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
        if (normalize(currentName) === normalize(nameAtReEnquiryTime)) continue; // matches, or just formatting noise
        if (looksLikeSamePerson(nameAtReEnquiryTime, currentName)) continue; // spelling fix/enrichment, not an overwrite

        // Split the logged name back into first/last the same way the rest of
        // this codebase does elsewhere (last word = lastName, rest = firstName),
        // consistent with how names are stored throughout this org's data.
        const parts = nameAtReEnquiryTime.split(/\s+/);
        const restoredLastName = parts.length > 1 ? parts.pop()! : '';
        const restoredFirstName = parts.join(' ');

        console.log(
            `${dryRun ? '[dry-run] ' : ''}Lead ${leadId}: "${currentName}" -> "${nameAtReEnquiryTime}" (overwritten by re-enquiry at ${i.createdAt.toISOString()})`
        );

        if (!dryRun) {
            await prisma.lead.update({
                where: { id: leadId },
                data: { firstName: restoredFirstName, lastName: restoredLastName }
            });
            await prisma.leadHistory.create({
                data: {
                    leadId,
                    fieldName: 'firstName/lastName',
                    oldValue: currentName,
                    newValue: nameAtReEnquiryTime,
                    changedById: null,
                    reason: `Data correction: a same-phone re-enquiry from a different person had overwritten this lead's name (was "${currentName}"). Reverted to the name recorded at its last re-enquiry.`
                }
            });
        }
        fixed++;
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}Fixed ${fixed} genuine name-overwrite leads (org ${orgId}).`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
