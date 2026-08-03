import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkLeadsCampaigns() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true, integrations: true }
        });
        const org = await prisma.organisation.findUnique({
            where: { id: user!.organisationId! }
        });

        const metaAccounts = (org?.integrations as any)?.metaAccounts || [];
        const account = metaAccounts.find((a: any) => a.pageId === '1207896069067700');

        if (!account) return;

        const pageToken = decrypt(account.accessToken);
        const startTime = Math.floor(new Date('2026-07-30T18:30:00.000Z').getTime() / 1000);

        const formsResponse = await axios.get(`https://graph.facebook.com/v18.0/${account.pageId}/leadgen_forms?fields=id,name`, {
            params: { access_token: pageToken }
        });

        const forms = formsResponse.data.data || [];

        for (const form of forms) {
            const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                params: {
                    access_token: pageToken,
                    fields: 'id,created_time,campaign_id,campaign_name,form_id,ad_id,ad_name,adset_id,adset_name',
                    filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
                }
            });

            const leads = leadsResponse.data.data || [];
            if (leads.length > 0) {
                console.log(`\nForm: ${form.name} (${form.id})`);
                for (const lead of leads) {
                    console.log(`  Lead: ${lead.id} | Campaign: ${lead.campaign_name} (${lead.campaign_id}) | Ad: ${lead.ad_name}`);
                }
            }
        }
    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
    }
}
checkLeadsCampaigns();
