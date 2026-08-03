import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkCampaignPage() {
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
        
        console.log(`Checking campaign ${campaignId}...`);
        
        // Fetch Campaign
        const campRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}?fields=id,name,account_id`, {
            params: { access_token: token }
        });
        console.log("Campaign:", campRes.data);
        
        // Fetch Ads in Campaign
        const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/ads?fields=id,name,tracking_specs,creative{object_story_spec,effective_object_story_id,page_id}`, {
            params: { access_token: token }
        });
        
        const ads = adsRes.data.data || [];
        console.log(`Found ${ads.length} ads in this campaign.`);
        
        for (const ad of ads) {
            console.log(`Ad: ${ad.name} (${ad.id})`);
            if (ad.creative && ad.creative.data && ad.creative.data.length > 0) {
                const creative = ad.creative.data[0];
                console.log(`  Linked Page ID from Creative: ${creative.page_id}`);
            } else {
                console.log(`  No creative data found to identify page_id`);
            }
        }
        
        // Let's also see if we can fetch leads for this campaign directly?
        // Wait, Graph API doesn't let you query leads by campaign directly, you have to query by form or page or ad account.
        // Actually you CAN query leads by Ad Account or Ad!
        // GET /<ad_account_id>/leads or /<campaign_id>/leads
        const leadsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/leads`, {
            params: { 
                access_token: token,
                fields: 'id,created_time,form_id,page_id',
                limit: 10
            }
        });
        
        const leads = leadsRes.data.data || [];
        console.log(`\nFound ${leads.length} recent leads for this campaign.`);
        if (leads.length > 0) {
            console.log(`Sample Lead:`, leads[0]);
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
    }
}
checkCampaignPage();
