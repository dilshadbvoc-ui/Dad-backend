import { PrismaClient } from '../generated/client';
import axios from 'axios';
import dotenv from 'dotenv';
import { decrypt } from '../utils/encryption';

dotenv.config();

const prisma = new PrismaClient();

async function deleteAndResync() {
    const user = await prisma.user.findUnique({
        where: { email: 'rajithaworldpassport@gmail.com' },
        select: { organisationId: true }
    });

    if (!user?.organisationId) {
        console.error('User or org not found');
        return;
    }

    const orgId = user.organisationId;

    const org = await prisma.organisation.findUnique({
        where: { id: orgId },
        select: { integrations: true }
    });

    const integrations = (org?.integrations as any) || {};

    // Today in IST = from 2026-07-31 00:00:00 IST = 2026-07-30 18:30:00 UTC
    const todayStart = new Date('2026-07-30T18:30:00.000Z');

    const metaLeads = await prisma.lead.findMany({
        where: {
            organisationId: orgId,
            source: 'meta_leadgen',
            createdAt: { gte: todayStart }
        },
        select: {
            id: true,
            firstName: true,
            phone: true,
            sourceDetails: true,
            createdAt: true
        }
    });

    console.log(`\nFound ${metaLeads.length} Meta leads from today to delete:\n`);

    const leadgenIds: { leadgenId: string; pageId: string }[] = [];

    for (const lead of metaLeads) {
        const sd = lead.sourceDetails as any;
        const leadgenId = sd?.metaLeadgenId;
        const pageId = sd?.metaPageId;
        console.log(`  - Lead ID: ${lead.id} | Name: ${lead.firstName} | Phone: ${lead.phone} | LeadgenID: ${leadgenId}`);
        if (leadgenId && pageId) {
            leadgenIds.push({ leadgenId, pageId });
        }
    }

    if (metaLeads.length === 0) {
        console.log('No Meta leads found today. Nothing to do.');
        return;
    }

    const leadIds = metaLeads.map(l => l.id);

    console.log(`\nDeleting all related records for ${leadIds.length} leads...`);

    await prisma.leadHistory.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.interaction.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.task.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.followUp.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.calendarEvent.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.checkIn.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.whatsAppMessage.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.document.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.callRecording.deleteMany({ where: { leadId: { in: leadIds } } });

    const deleted = await prisma.lead.deleteMany({
        where: { id: { in: leadIds } }
    });

    console.log(`Deleted ${deleted.count} leads and all related records.`);

    console.log(`\nRe-fetching ${leadgenIds.length} leads from Meta API...\n`);

    for (const { leadgenId, pageId } of leadgenIds) {
        console.log(`  Processing leadgenId: ${leadgenId} from page: ${pageId}`);
        try {
            const accounts = [...(integrations.metaAccounts || [])];
            if (integrations.meta) accounts.push(integrations.meta);
            const matchedAccount = accounts.find((acc: any) => acc.pageId === pageId);

            if (!matchedAccount?.accessToken) {
                console.error(`  No token found for page ${pageId}`);
                continue;
            }

            const accessToken = decrypt(matchedAccount.accessToken);
            const META_API_VERSION = 'v18.0';

            const response = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${leadgenId}`, {
                params: {
                    access_token: accessToken,
                    fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,ad_account_id'
                }
            });

            const leadData = response.data;
            console.log(`  Fetched: ${leadData.campaign_name || leadData.ad_name || leadgenId}`);

            const { MetaLeadService } = await import('../services/metaLeadService');
            await MetaLeadService.processIncomingLead(leadgenId, pageId, leadData.ad_id, leadData.form_id);
            console.log(`  Re-synced leadgenId: ${leadgenId}`);

            await new Promise(r => setTimeout(r, 500));
        } catch (err: any) {
            console.error(`  Failed to re-sync ${leadgenId}:`, err.response?.data?.error?.message || err.message);
        }
    }

    console.log('\nDone! Leads should now be assigned per assignment rules.');
    await prisma.$disconnect();
}

deleteAndResync().catch(e => {
    console.error('Script failed:', e);
    process.exit(1);
});
