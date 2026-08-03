import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';
import { MetaLeadService } from '../services/metaLeadService';

const prisma = new PrismaClient();

async function checkCampaignLeadsByAd() {
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
        
        let synced = 0;
        let totalLeads = 0;

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
                        try {
                            const pageId = lead.page_id || '1207896069067700';
                            await MetaLeadService.processIncomingLead(lead.id, pageId);
                            console.log(`    -> Synced lead ${lead.id}`);
                            synced++;
                        } catch (err: any) {
                             if (err.message?.includes('Duplicate') || err.message?.includes('Unique constraint')) {
                                 console.log(`    -> Lead ${lead.id} already in DB.`);
                             } else {
                                 console.log(`    -> Failed to sync lead ${lead.id}: ${err.message}`);
                             }
                        }
                    }
                }
            } catch (e: any) {
                 console.log(`  -> Error fetching leads for Ad: ${e.response?.data?.error?.message || e.message}`);
            }
        }
        console.log(`\nDone. Total leads found today for campaign: ${totalLeads}. Synced new: ${synced}`);

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
    }
}
checkCampaignLeadsByAd();
