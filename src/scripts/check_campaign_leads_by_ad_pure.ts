import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkCampaignLeadsByAdPure() {
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
        
        console.log(`Checking ads for campaign ${campaignId}...`);
        
        const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/ads?fields=id,name`, {
            params: { access_token: token }
        });
        
        const ads = adsRes.data.data || [];
        console.log(`Found ${ads.length} ads in this campaign.`);
        
        let totalLeads = 0;
        let formIds = new Set();
        let pageIds = new Set();

        for (const ad of ads) {
            console.log(`Checking leads for Ad: ${ad.name} (${ad.id})`);
            
            try {
                const leadsRes = await axios.get(`https://graph.facebook.com/v18.0/${ad.id}/leads`, {
                    params: { 
                        access_token: token,
                        fields: 'id,created_time,form_id,campaign_id,campaign_name,adset_name,ad_name,page_id',
                        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
                    }
                });
                
                const leads = leadsRes.data.data || [];
                if (leads.length > 0) {
                    console.log(`  -> Found ${leads.length} leads today!`);
                    totalLeads += leads.length;
                    
                    for (const lead of leads) {
                        formIds.add(lead.form_id);
                        if (lead.page_id) pageIds.add(lead.page_id);
                    }
                }
            } catch (e: any) {
                 console.log(`  -> Error fetching leads for Ad: ${e.response?.data?.error?.message || e.message}`);
            }
        }
        console.log(`\nDone. Total leads found today for campaign: ${totalLeads}`);
        console.log(`Forms involved: ${Array.from(formIds).join(', ')}`);
        console.log(`Pages involved: ${Array.from(pageIds).join(', ')}`);

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkCampaignLeadsByAdPure();
