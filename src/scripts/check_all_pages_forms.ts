import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkAdAccountForms() {
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
        const adAccountId = 'act_1717133599615272';
        
        console.log(`Checking leadgen_forms for Ad Account ${adAccountId}...`);
        
        // Wait, does an Ad Account have an edge for leadgen_forms?
        // No, leadgen_forms are tied to a PAGE. 
        // We can check all pages the user has access to, and for each page, find the forms.
        // Let's just fetch all pages the user has access to, and list their forms and Page IDs.
        
        const pagesRes = await axios.get(`https://graph.facebook.com/v18.0/me/accounts`, {
            params: { access_token: token, fields: 'id,name,access_token' }
        });
        
        const pages = pagesRes.data.data || [];
        console.log(`User has access to ${pages.length} Pages.`);
        
        let foundAny = false;
        
        for (const page of pages) {
            console.log(`\nPage: ${page.name} (${page.id})`);
            const formsRes = await axios.get(`https://graph.facebook.com/v18.0/${page.id}/leadgen_forms`, {
                params: { access_token: page.access_token, fields: 'id,name' }
            });
            const forms = formsRes.data.data || [];
            console.log(`  -> Has ${forms.length} forms.`);
            for (const f of forms) {
                console.log(`    Form: ${f.name} (${f.id})`);
            }
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkAdAccountForms();
