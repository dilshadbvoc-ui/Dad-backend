import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';
import { MetaLeadService } from '../services/metaLeadService';

const prisma = new PrismaClient();

async function fetchLeadsForCampaign() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true, integrations: true }
        });

        const org = await prisma.organisation.findUnique({
            where: { id: user!.organisationId! }
        });

        const integrations = (org?.integrations as any) || {};
        const metaIntegration = integrations.meta;
        const tokenStr = metaIntegration?.userAccessToken || metaIntegration?.accessToken;
        
        if (!tokenStr) return console.log("No token");
        
        const token = decrypt(tokenStr);
        const campaignId = '52838377425127';
        const startTime = Math.floor(new Date('2026-07-30T18:30:00.000Z').getTime() / 1000);
        
        console.log(`Checking leads for campaign ${campaignId}...`);
        
        const leadsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/leads`, {
            params: { 
                access_token: token,
                fields: 'id,created_time,form_id,campaign_id,campaign_name,adset_name,ad_name',
                filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
            }
        });
        
        const leads = leadsRes.data.data || [];
        console.log(`\nFound ${leads.length} leads for this campaign today.`);
        
        let synced = 0;
        for (const lead of leads) {
            console.log(`Lead: ${lead.id} | Campaign: ${lead.campaign_name} | Form: ${lead.form_id}`);
            
            // Sync it to CRM manually
            try {
                // To sync it, we might need pageId. If we don't know pageId, we can just pass a dummy one or fetch the form to get pageId.
                const formRes = await axios.get(`https://graph.facebook.com/v18.0/${lead.form_id}?fields=page`, {
                    params: { access_token: token }
                });
                const pageId = formRes.data.page?.id || '1207896069067700'; // Fallback to the main page
                
                await MetaLeadService.processIncomingLead(lead.id, pageId);
                console.log(`  -> Synced successfully!`);
                synced++;
            } catch (err: any) {
                 if (err.message?.includes('Duplicate') || err.message?.includes('Unique constraint')) {
                     console.log(`  -> Already exists in DB.`);
                 } else {
                     console.log(`  -> Failed to sync: ${err.message}`);
                 }
            }
        }
        console.log(`\nDone. Synced ${synced} new leads from this campaign.`);

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
    }
}
fetchLeadsForCampaign();
