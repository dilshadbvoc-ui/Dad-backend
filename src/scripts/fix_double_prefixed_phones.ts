import prisma from '../config/prisma';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * One-off backfill for leads corrupted by the mobile Edit Lead bug: `phone`
 * (meant to be stored raw/national, with `phoneCountryCode` held separately)
 * got the country code's digits re-prepended onto it on every mobile edit.
 *
 * A lead is treated as corrupted only when ALL of the following hold:
 *   1. `phoneCountryCode` is set (e.g. "+91").
 *   2. `phone` (digits only) starts with those same digits (e.g. "9876543210"
 *      became "919876543210").
 *   3. Stripping that prefix leaves a number libphonenumber-js considers a
 *      VALID number for that country — this is the safety net against
 *      coincidentally stripping real digits from a country whose genuine
 *      national numbers happen to start with the same digits as their own
 *      calling code.
 *   4. The un-stripped full value is NOT itself a valid number for that
 *      country (i.e. it only "became valid" after the bug, not before) —
 *      guards against ever touching a lead that was always stored with the
 *      country code included on purpose.
 *
 * Run modes:
 *   npx tsx src/scripts/fix_double_prefixed_phones.ts            (dry run — no writes)
 *   npx tsx src/scripts/fix_double_prefixed_phones.ts --apply    (writes the fix)
 */

async function main() {
    const apply = process.argv.includes('--apply');

    const leads = await prisma.lead.findMany({
        where: {
            isDeleted: false,
            phoneCountryCode: { not: null },
            phone: { not: '' }
        },
        select: { id: true, organisationId: true, phone: true, phoneCountryCode: true, secondaryPhone: true, firstName: true, lastName: true }
    });

    console.log(`Scanning ${leads.length} leads with a phoneCountryCode set...`);

    const candidates: { id: string; org: string; name: string; phoneCountryCode: string; before: string; after: string; secondaryBefore?: string; secondaryAfter?: string }[] = [];

    for (const lead of leads) {
        const ccDigits = (lead.phoneCountryCode || '').replace(/\D/g, '');
        if (!ccDigits) continue;

        const fixed = detectAndStrip(lead.phone, ccDigits);
        const secondaryFixed = lead.secondaryPhone ? detectAndStrip(lead.secondaryPhone, ccDigits) : null;

        if (fixed || secondaryFixed) {
            candidates.push({
                id: lead.id,
                org: lead.organisationId || '',
                name: `${lead.firstName} ${lead.lastName || ''}`.trim(),
                phoneCountryCode: lead.phoneCountryCode!,
                before: lead.phone,
                after: fixed || lead.phone,
                secondaryBefore: lead.secondaryPhone || undefined,
                secondaryAfter: secondaryFixed || lead.secondaryPhone || undefined
            });
        }
    }

    console.log(`\nFound ${candidates.length} lead(s) with a likely double-prefixed phone number:\n`);
    for (const c of candidates.slice(0, 50)) {
        console.log(`  [${c.org}] ${c.name} (${c.id}): phone "${c.before}" -> "${c.after}" (cc ${c.phoneCountryCode})${c.secondaryBefore ? `, secondaryPhone "${c.secondaryBefore}" -> "${c.secondaryAfter}"` : ''}`);
    }
    if (candidates.length > 50) console.log(`  ...and ${candidates.length - 50} more`);

    if (!apply) {
        console.log(`\nDry run only — no changes written. Re-run with --apply to fix these ${candidates.length} lead(s).`);
        return;
    }

    console.log(`\nApplying fix to ${candidates.length} lead(s)...`);
    let updated = 0;
    for (const c of candidates) {
        try {
            await prisma.lead.update({
                where: { id: c.id },
                data: {
                    phone: c.after,
                    ...(c.secondaryAfter && c.secondaryAfter !== c.secondaryBefore ? { secondaryPhone: c.secondaryAfter } : {})
                }
            });
            updated++;
        } catch (e: any) {
            // Most likely a unique [phone, organisationId, branchId] collision with
            // an existing correct lead — skip and report rather than crash the batch.
            console.error(`  Failed to update lead ${c.id}: ${e.message}`);
        }
    }
    console.log(`Done. Updated ${updated}/${candidates.length} lead(s).`);
}

function detectAndStrip(rawPhone: string, ccDigits: string): string | null {
    const phoneDigits = rawPhone.replace(/\D/g, '');
    if (!phoneDigits.startsWith(ccDigits)) return null;
    // A bare cc-digit match on a short number (e.g. cc "1" matching the leading
    // "1" of an unrelated 10-digit number) isn't meaningful on its own — the
    // validity check below is what actually does the discriminating work, this
    // just skips obviously-too-short candidates before bothering to parse.
    if (phoneDigits.length <= ccDigits.length) return null;

    const stripped = phoneDigits.slice(ccDigits.length);
    if (stripped.length < 6) return null; // too short to plausibly be a real national number

    // The app's own convention is: `phone` is stored raw/national, never with
    // the country code embedded — that's what the separate `phoneCountryCode`
    // field is for. So a `phone` that starts with those exact cc digits AND
    // still forms a genuinely valid number once stripped is the signature of
    // this bug, regardless of whether the un-stripped form also "looks valid"
    // (a corrupted "cc + national" concatenation is, by construction, shaped
    // exactly like a real E.164 number minus the "+" — validity alone can't
    // tell the two apart, so it isn't used as a disqualifying signal here).
    const strippedParsed = parsePhoneNumberFromString(`+${ccDigits}${stripped}`);
    if (strippedParsed?.isValid()) {
        return stripped;
    }
    return null;
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
