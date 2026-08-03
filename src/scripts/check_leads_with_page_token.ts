import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkLeadsWithPageToken() {
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
        const pageTokenStr = metaIntegration?.accessToken; // The Page Token
        const userTokenStr = metaIntegration?.userAccessToken; // The User Token
        
        if (!pageTokenStr || !userTokenStr) return console.log("Missing tokens");
        
        const pageToken = decrypt(pageTokenStr);
        const userToken = decrypt(userTokenStr);
        const campaignId = '52838377425127';
        
        console.log(`Checking ads for campaign ${campaignId} with user token...`);
        const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/ads?fields=id,name`, {
            params: { access_token: userToken }
        });
        
        const ads = adsRes.data.data || [];
        
        for (const ad of ads) {
            console.log(`Checking leads for Ad: ${ad.name} (${ad.id}) using PAGE TOKEN...`);
            try {
                const leadsRes = await axios.get(`https://graph.facebook.com/v18.0/${ad.id}/leads`, {
                    params: { access_token: pageToken, fields: 'id,created_time' }
                });
                
                const leads = leadsRes.data.data || [];
                console.log(`  -> Found ${leads.length} leads ALL TIME.`);
                if (leads.length > 0) {
                    for (const lead of leads) {
                        console.log(`    Lead: ${lead.id} | Created: ${lead.created_time}`);
                    }
                }
            } catch (e: any) {
                console.log(`  -> Error with Page Token: ${e.response?.data?.error?.message || e.message}`);
            }
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkLeadsWithPageToken();
