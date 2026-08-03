import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkOwnership() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true, integrations: true }
        });

        const org = await prisma.organisation.findUnique({
            where: { id: user!.organisationId! }
        });

        const metaIntegration = (org?.integrations as any)?.meta;
        const tokenStr = metaIntegration?.userAccessToken; 
        
        if (!tokenStr) return console.log("Missing token");
        const token = decrypt(tokenStr);
        
        const adAccountId = 'act_1717133599615272';
        const campaignId = '52838377425127';
        
        console.log(`Checking Ad Account Details...`);
        try {
            const adAccRes = await axios.get(`https://graph.facebook.com/v18.0/${adAccountId}`, {
                params: { access_token: token, fields: 'id,name,business,owner' }
            });
            console.log(`Ad Account: ${adAccRes.data.name}`);
            if (adAccRes.data.business) console.log(`Owned by Business: ${adAccRes.data.business.name} (${adAccRes.data.business.id})`);
        } catch(e:any) {}

        console.log(`\nChecking Ads for Campaign: Study in India, Work in Malaysia! (${campaignId})...`);
        const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/ads`, {
            params: { 
                access_token: token, 
                fields: 'id,name,creative{effective_object_story_id,page_id,actor_id}'
            }
        });
        
        const ads = adsRes.data.data || [];
        const pageIds = new Set<string>();
        
        for (const ad of ads) {
            let pageId = null;
            if (ad.creative) {
                if (ad.creative.page_id) pageId = ad.creative.page_id;
                else if (ad.creative.actor_id) pageId = ad.creative.actor_id;
                else if (ad.creative.effective_object_story_id) pageId = ad.creative.effective_object_story_id.split('_')[0];
            }
            if (pageId) {
                console.log(`Ad: "${ad.name}" -> Linked to Page ID: ${pageId}`);
                pageIds.add(pageId);
            }
        }
        
        console.log(`\nResolving Page Names...`);
        for (const pid of pageIds) {
            try {
                const pageRes = await axios.get(`https://graph.facebook.com/v18.0/${pid}`, {
                    params: { access_token: token, fields: 'id,name' }
                });
                console.log(`Page ID ${pid} is actually: "${pageRes.data.name}"`);
            } catch (e: any) {
                console.log(`Page ID ${pid}: Could not resolve name (You might not be an admin of this page)`);
            }
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkOwnership();
