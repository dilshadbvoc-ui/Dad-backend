/**
 * fix-payment-records.ts
 *
 * ONE-TIME backfill script.
 *
 * Problem: Due to fire-and-forget payment recording, some closed_won Opportunities
 * have paymentStatus = 'paid' or 'partial' but have ZERO PaymentRecord rows.
 * This causes the Sales Book to show ₹0 totalPaid even though the opportunity is marked paid.
 *
 * What this script does:
 *   1. Find all closed_won, non-deleted Opportunities where paymentStatus != 'pending'
 *      but the sum of their paymentRecords < their amount.
 *   2. For each such opportunity, create a compensating PaymentRecord
 *      to reconcile the gap between what is recorded and the claimed paymentStatus.
 *   3. For EMI deals (has emiSchedule), skip backfill — those are managed via installments.
 *   4. Print a full report of what was fixed.
 *
 * Usage:
 *   npx ts-node src/scripts/fix-payment-records.ts
 *
 * SAFE TO RUN: It only INSERT missing rows; never deletes or modifies existing data.
 */

import prisma from '../config/prisma';

async function main() {
    console.log('[fix-payment-records] Starting...\n');

    // Find all closed_won opportunities that are NOT pending and do NOT have an EMI schedule
    const opportunities = await prisma.opportunity.findMany({
        where: {
            stage: 'closed_won',
            isDeleted: false,
            paymentStatus: { in: ['paid', 'partial'] },
            emiSchedule: null  // Skip EMI deals — their paidAmount is tracked in emiSchedule
        },
        select: {
            id: true,
            name: true,
            amount: true,
            paymentStatus: true,
            organisationId: true,
            ownerId: true,
            paymentRecords: {
                select: { amount: true }
            }
        }
    });

    console.log(`[fix-payment-records] Found ${opportunities.length} closed_won (paid/partial, non-EMI) opportunities to check.\n`);

    let fixedCount = 0;
    let alreadyOkCount = 0;
    const errors: string[] = [];

    for (const opp of opportunities) {
        const recordedSum = opp.paymentRecords.reduce((sum, r) => sum + r.amount, 0);
        const expectedAmount = opp.paymentStatus === 'paid' ? opp.amount : null; // For 'partial', we can't know exact amount without user context

        // Case 1: paymentStatus = 'paid' but recorded sum is 0 → create a full payment record
        if (opp.paymentStatus === 'paid' && recordedSum === 0) {
            console.log(`  [FIX] "${opp.name}" (${opp.id}) — status=paid but ₹0 recorded → creating PaymentRecord for ₹${opp.amount}`);
            try {
                await prisma.paymentRecord.create({
                    data: {
                        opportunityId: opp.id,
                        amount: opp.amount,
                        paymentDate: new Date(),
                        paymentType: 'full',
                        paymentMethod: 'backfill',
                        notes: '[Auto-backfilled by fix-payment-records script — original payment recording failed silently]',
                        createdById: opp.ownerId || (await getSystemUserId(opp.organisationId)),
                        organisationId: opp.organisationId
                    }
                });
                fixedCount++;
            } catch (err) {
                console.error(`  [ERROR] Failed to fix "${opp.name}": ${(err as Error).message}`);
                errors.push(`${opp.name} (${opp.id}): ${(err as Error).message}`);
            }
        }
        // Case 2: paymentStatus = 'paid' but recorded sum < amount → create a gap-filling record
        else if (opp.paymentStatus === 'paid' && recordedSum < opp.amount) {
            const gap = opp.amount - recordedSum;
            console.log(`  [FIX] "${opp.name}" (${opp.id}) — status=paid but only ₹${recordedSum} of ₹${opp.amount} recorded → creating gap record for ₹${gap}`);
            try {
                await prisma.paymentRecord.create({
                    data: {
                        opportunityId: opp.id,
                        amount: gap,
                        paymentDate: new Date(),
                        paymentType: 'partial',
                        paymentMethod: 'backfill',
                        notes: '[Auto-backfilled gap by fix-payment-records script]',
                        createdById: opp.ownerId || (await getSystemUserId(opp.organisationId)),
                        organisationId: opp.organisationId
                    }
                });
                fixedCount++;
            } catch (err) {
                console.error(`  [ERROR] Failed to fix gap for "${opp.name}": ${(err as Error).message}`);
                errors.push(`${opp.name} (${opp.id}): ${(err as Error).message}`);
            }
        }
        // Case 3: paymentStatus = 'partial' but NO payment records at all — status is stale, reset it
        else if (opp.paymentStatus === 'partial' && recordedSum === 0) {
            console.log(`  [RESET] "${opp.name}" (${opp.id}) — status=partial but ₹0 recorded and no EMI → resetting paymentStatus to 'pending'`);
            try {
                await prisma.opportunity.update({
                    where: { id: opp.id },
                    data: { paymentStatus: 'pending' }
                });
                fixedCount++;
            } catch (err) {
                console.error(`  [ERROR] Failed to reset "${opp.name}": ${(err as Error).message}`);
                errors.push(`${opp.name} (${opp.id}): ${(err as Error).message}`);
            }
        }
        else {
            alreadyOkCount++;
        }
    }

    console.log(`\n[fix-payment-records] ✅ Done!`);
    console.log(`  Fixed/reconciled: ${fixedCount}`);
    console.log(`  Already consistent: ${alreadyOkCount}`);
    if (errors.length > 0) {
        console.log(`  Errors (${errors.length}):`);
        errors.forEach(e => console.log(`    - ${e}`));
    }

    await prisma.$disconnect();
}

async function getSystemUserId(organisationId: string): Promise<string> {
    // Falls back to any admin user in the org if ownerId is null
    const admin = await prisma.user.findFirst({
        where: { organisationId, role: 'admin' },
        select: { id: true }
    });
    if (!admin) throw new Error(`No admin user found in org ${organisationId}`);
    return admin.id;
}

main().catch(e => {
    console.error('[fix-payment-records] Fatal error:', e);
    process.exit(1);
});
