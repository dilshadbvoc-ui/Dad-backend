import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkMetaLeadsAPI() {
    try {
        console.log("Fetching Rajitha's Org...");
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true, integrations: true }
        });

        if (!user || !user.organisationId) {
            console.log("User not found."); return;
        }

        const org = await prisma.organisation.findUnique({
            where: { id: user.organisationId }
        });

        const metaAccounts = (org?.integrations as any)?.metaAccounts || [];
        console.log(`Found ${metaAccounts.length} Meta accounts linked in the DB.`);

        let found = 0;
        const startTime = Math.floor(new Date('2026-07-30T18:30:00.000Z').getTime() / 1000);

        for (const account of metaAccounts) {
            const pageId = account.pageId;
            const pageToken = decrypt(account.accessToken);
            const pageName = account.pageName;

            console.log(`\nChecking Page: ${pageName} (${pageId})`);

            try {
                const formsResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/leadgen_forms`, {
                    params: { access_token: pageToken, fields: 'id,name' },
                    timeout: 10000
                });

                const forms = formsResponse.data.data || [];
                console.log(`  Found ${forms.length} forms.`);

                for (const form of forms) {
                    const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                        params: {
                            access_token: pageToken,
                            fields: 'id,created_time',
                            filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
                        },
                        timeout: 10000
                    });

                    const leads = leadsResponse.data.data || [];
                    if (leads.length > 0) {
                        console.log(`    Form: ${form.name} - Found ${leads.length} leads created today in Meta.`);
                        found += leads.length;
                    }
                }
            } catch (err: any) {
                console.log(`  Error querying page ${pageName}: ${err.response?.data?.error?.message || err.message}`);
            }
        }
        console.log(`\nDone checking Meta. Total Meta Leads Found on Facebook since July 31 12AM IST: ${found}`);
    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkMetaLeadsAPI();
