import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkAllMetaPagesAPI() {
    try {
        console.log("Fetching Rajitha's Org...");
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true, integrations: true }
        });

        const org = await prisma.organisation.findUnique({
            where: { id: user!.organisationId! }
        });

        let accessToken;
        if (user?.integrations && (user.integrations as any).facebook_payload?.accessToken) {
            accessToken = decrypt((user.integrations as any).facebook_payload.accessToken);
        } else if (org?.integrations && (org.integrations as any).meta?.accessToken) {
            accessToken = decrypt((org.integrations as any).meta.accessToken);
        }

        if (!accessToken) {
            console.log("No token."); return;
        }

        console.log("Fetching ALL pages accessible by this token...");
        const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
            params: { access_token: accessToken, fields: 'id,name,access_token' },
            timeout: 10000
        });

        const pages = pagesResponse.data.data || [];
        console.log(`Found ${pages.length} total accessible pages.`);

        let found = 0;
        const startTime = Math.floor(new Date('2026-07-30T18:30:00.000Z').getTime() / 1000);

        for (const page of pages) {
            console.log(`\nChecking Page: ${page.name} (${page.id})`);

            try {
                const formsResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}/leadgen_forms`, {
                    params: { access_token: page.access_token, fields: 'id,name' },
                    timeout: 10000
                });

                const forms = formsResponse.data.data || [];
                for (const form of forms) {
                    const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                        params: {
                            access_token: page.access_token,
                            fields: 'id,created_time',
                            filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
                        },
                        timeout: 10000
                    });

                    const leads = leadsResponse.data.data || [];
                    if (leads.length > 0) {
                        console.log(`  -> Form: ${form.name} - Found ${leads.length} leads created today!`);
                        found += leads.length;
                    }
                }
            } catch (err: any) {
                console.log(`  Error querying page ${page.name}: ${err.response?.data?.error?.message || err.message}`);
            }
        }
        console.log(`\nDone checking ALL accessible Meta pages. Total Leads Found today: ${found}`);
    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkAllMetaPagesAPI();
