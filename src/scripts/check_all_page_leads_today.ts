import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkAllPageLeadsToday() {
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
        const pageTokenStr = metaIntegration?.accessToken; 
        
        if (!pageTokenStr) return console.log("Missing page token");
        
        const pageToken = decrypt(pageTokenStr);
        const pageId = '1207896069067700'; // The page connected
        const startTime = Math.floor(new Date('2026-07-30T18:30:00.000Z').getTime() / 1000); // 12:00 AM IST July 31
        
        console.log(`Fetching forms for Page ${pageId}...`);
        
        const formsRes = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/leadgen_forms`, {
            params: { access_token: pageToken, fields: 'id,name' }
        });
        
        const forms = formsRes.data.data || [];
        console.log(`Found ${forms.length} forms for this page.`);
        
        let totalLeads = 0;

        for (const form of forms) {
            try {
                const leadsRes = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                    params: { 
                        access_token: pageToken,
                        fields: 'id,created_time,campaign_name,ad_name',
                        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
                    }
                });
                
                const leads = leadsRes.data.data || [];
                if (leads.length > 0) {
                    console.log(`  -> Form: ${form.name} (${form.id}) - Found ${leads.length} leads today!`);
                    totalLeads += leads.length;
                    
                    for (const lead of leads) {
                        console.log(`    Lead ID: ${lead.id} | Campaign: ${lead.campaign_name} | Created: ${lead.created_time}`);
                    }
                }
            } catch (e: any) {
                console.log(`  -> Error with Form ${form.id}: ${e.response?.data?.error?.message || e.message}`);
            }
        }
        
        console.log(`\nDone. Total leads today across all forms on this Page: ${totalLeads}`);

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkAllPageLeadsToday();
