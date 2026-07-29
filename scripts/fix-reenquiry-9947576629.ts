/**
 * One-time DB fix script
 *
 * Org   : manager@edufolio.org
 * Number: +919947576629
 *
 * Problem: Two leads exist for the same phone (one with 91 prefix, one without).
 * Fix:
 *   1. Find BOTH leads (919947576629 and 9947576629) in the org.
 *   2. Keep the OLDER one (original lead) - mark it as re-enquiry.
 *   3. Soft-delete the NEWER (duplicate) lead.
 *
 * Run: npx ts-node scripts/fix-reenquiry-9947576629.ts
 */

import { PrismaClient } from '../src/generated/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    // 1. Find the org
    const manager = await prisma.user.findFirst({
        where: { email: 'manager@edufolio.org', isActive: true },
        select: { id: true, organisationId: true }
    });

    if (!manager?.organisationId) {
        console.error('ERROR: Could not find organisation for manager@edufolio.org');
        process.exit(1);
    }

    const orgId = manager.organisationId;
    console.log('Found organisation: ' + orgId);

    // 2. Find all leads with the phone number variants
    const leads = await prisma.lead.findMany({
        where: {
            organisationId: orgId,
            isDeleted: false,
            OR: [
                { phone: '9947576629' },
                { phone: '919947576629' },
                { phone: '+919947576629' }
            ]
        },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            isReEnquiry: true,
            reEnquiryCount: true,
            createdAt: true,
            assignedToId: true
        }
    });

    console.log('Found ' + leads.length + ' lead(s) matching the phone number:');
    leads.forEach((l: typeof leads[0], i: number) => {
        console.log(
            '  [' + i + '] id=' + l.id +
            ' | name=' + l.firstName + ' ' + l.lastName +
            ' | phone=' + l.phone +
            ' | status=' + l.status +
            ' | created=' + l.createdAt
        );
    });

    if (leads.length < 2) {
        console.log('Only 1 lead found - nothing to fix. They may already be merged.');
        process.exit(0);
    }

    const originalLead = leads[0];
    const duplicateLead = leads[leads.length - 1];

    console.log('\n=== ACTION PLAN ===');
    console.log(
        '  KEEP   (mark as re-enquiry): ' + originalLead.id +
        ' (' + originalLead.firstName + ' ' + originalLead.lastName +
        ', phone: ' + originalLead.phone + ')'
    );
    console.log(
        '  DELETE (soft-delete):        ' + duplicateLead.id +
        ' (' + duplicateLead.firstName + ' ' + duplicateLead.lastName +
        ', phone: ' + duplicateLead.phone + ')'
    );
    console.log('===================\n');

    const now = new Date();

    // 3. Mark the original lead as re-enquiry
    await prisma.lead.update({
        where: { id: originalLead.id },
        data: {
            isReEnquiry: true,
            status: 're_enquiry',
            reEnquiryCount: { increment: 1 },
            lastEnquiryDate: now
        }
    });
    console.log('OK: Original lead marked as re-enquiry.');

    // 4. Create interaction note for audit trail
    await prisma.interaction.create({
        data: {
            type: 'other',
            direction: 'inbound',
            subject: 'Re-Enquiry Received (Manual Fix)',
            description:
                'Duplicate lead (ID: ' + duplicateLead.id +
                ', phone: ' + duplicateLead.phone +
                ') was merged and soft-deleted by admin fix script.',
            date: now,
            leadId: originalLead.id,
            createdById: originalLead.assignedToId || manager.id,
            organisationId: orgId
        }
    });
    console.log('OK: Interaction note created on original lead.');

    // 5. Create lead history entry
    await prisma.leadHistory.create({
        data: {
            leadId: originalLead.id,
            reason: 'Re-Enquiry received - duplicate lead merged (admin fix)',
            fieldName: 'status',
            oldValue: originalLead.status,
            newValue: 're_enquiry',
            createdAt: now
        }
    });
    console.log('OK: Lead history entry created.');

    // 6. Soft-delete the duplicate lead
    await prisma.lead.update({
        where: { id: duplicateLead.id },
        data: {
            isDeleted: true,
            deletedAt: now
        }
    });
    console.log('OK: Duplicate lead soft-deleted.');

    console.log('\n=== DONE ===');
    console.log('Lead moved to re-enquiry and duplicate removed successfully.');
}

main()
    .catch(e => {
        console.error('FATAL ERROR:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
