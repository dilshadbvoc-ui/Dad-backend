import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkAdsPageId() {
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
        
        const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/ads?fields=id,name,creative{effective_object_story_id,page_id}`, {
            params: { access_token: token }
        });
        
        const ads = adsRes.data.data || [];
        
        for (const ad of ads) {
            let pageId = 'unknown';
            if (ad.creative && ad.creative.data && ad.creative.data.length > 0) {
                const creative = ad.creative.data[0];
                pageId = creative.page_id || 'unknown';
            } else if (ad.creative && (ad.creative as any).page_id) {
                pageId = (ad.creative as any).page_id;
            } else if (ad.creative && (ad.creative as any).effective_object_story_id) {
                pageId = (ad.creative as any).effective_object_story_id.split('_')[0];
            }
            console.log(`Ad: ${ad.name} (${ad.id}) -> Belongs to Page ID: ${pageId}`);
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkAdsPageId();
