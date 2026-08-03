import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkAdAccountPages() {
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
        const tokenStr = metaIntegration?.userAccessToken; 
        
        if (!tokenStr) return console.log("Missing token");
        
        const token = decrypt(tokenStr);
        const adAccountId = 'act_1717133599615272';
        
        console.log(`Checking ads for Ad Account ${adAccountId}...`);
        
        const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${adAccountId}/ads`, {
            params: { 
                access_token: token, 
                fields: 'id,name,creative{effective_object_story_id,page_id,actor_id}',
                limit: 100
            }
        });
        
        const ads = adsRes.data.data || [];
        const pageIds = new Set<string>();
        
        for (const ad of ads) {
            let pageId = null;
            if (ad.creative) {
                if (ad.creative.page_id) {
                    pageId = ad.creative.page_id;
                } else if (ad.creative.actor_id) {
                    pageId = ad.creative.actor_id;
                } else if (ad.creative.effective_object_story_id) {
                    pageId = ad.creative.effective_object_story_id.split('_')[0];
                }
            }
            if (pageId) {
                pageIds.add(pageId);
            }
        }
        
        console.log(`Found Ads associated with the following Page IDs:`);
        for (const pid of pageIds) {
            console.log(`  - Page ID: ${pid}`);
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkAdAccountPages();
