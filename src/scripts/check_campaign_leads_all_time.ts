import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkCampaignLeadsAllTime() {
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
        
        console.log(`Checking ads for campaign ${campaignId}...`);
        
        const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/ads?fields=id,name`, {
            params: { access_token: token }
        });
        
        const ads = adsRes.data.data || [];
        
        let totalLeads = 0;

        for (const ad of ads) {
            try {
                const leadsRes = await axios.get(`https://graph.facebook.com/v18.0/${ad.id}/leads`, {
                    params: { 
                        access_token: token,
                        fields: 'id,created_time,form_id,campaign_name,ad_name,page_id'
                    }
                });
                
                const leads = leadsRes.data.data || [];
                if (leads.length > 0) {
                    console.log(`\nAd: ${ad.name} (${ad.id}) - Found ${leads.length} leads ALL TIME:`);
                    totalLeads += leads.length;
                    
                    for (const lead of leads) {
                        console.log(`  Lead: ${lead.id} | Created: ${lead.created_time}`);
                    }
                }
            } catch (e: any) {}
        }
        console.log(`\nDone. Total leads all time: ${totalLeads}`);

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkCampaignLeadsAllTime();
