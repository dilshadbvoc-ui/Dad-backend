import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkCampaignLeads() {
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
                fields: 'id,created_time,form_id,campaign_id,campaign_name,adset_name,ad_name,page_id',
                filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
            }
        });
        
        const leads = leadsRes.data.data || [];
        console.log(`\nFound ${leads.length} leads for this campaign today.`);
        
        for (const lead of leads) {
            console.log(`Lead: ${lead.id} | Page: ${lead.page_id} | Form: ${lead.form_id}`);
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkCampaignLeads();
