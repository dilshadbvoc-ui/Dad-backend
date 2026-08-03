import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkFormsPaginated() {
    try {
        console.log("Fetching Rajitha's Org...");
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

        let url = `https://graph.facebook.com/v18.0/${account.pageId}/leadgen_forms?fields=id,name&limit=100`;
        let formCount = 0;
        let totalLeads = 0;

        while (url) {
            const formsResponse = await axios.get(url, { params: { access_token: pageToken } });
            const forms = formsResponse.data.data || [];
            formCount += forms.length;

            for (const form of forms) {
                const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                    params: {
                        access_token: pageToken,
                        fields: 'id,created_time',
                        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }]),
                        limit: 100
                    }
                });

                const leads = leadsResponse.data.data || [];
                if (leads.length > 0) {
                    console.log(`  Form: ${form.name} - Found ${leads.length} leads created today.`);
                    totalLeads += leads.length;
                }
            }

            url = formsResponse.data.paging?.next;
        }

        console.log(`Total forms checked: ${formCount}`);
        console.log(`Total leads found today: ${totalLeads}`);

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
    }
}
checkFormsPaginated();
