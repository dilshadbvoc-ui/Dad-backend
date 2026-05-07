
import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function main() {
    const orgName = 'emtees';
    const org = await prisma.organisation.findFirst({
        where: {
            name: {
                contains: orgName,
                mode: 'insensitive'
            }
        }
    });

    if (!org) {
        console.log(`Organization "${orgName}" not found.`);
        return;
    }

    const integrations = org.integrations as any;
    const meta = integrations?.meta;

    if (!meta || !meta.accessToken) {
        console.log('Meta integration not found for this organization.');
        return;
    }

    const accessToken = decrypt(meta.accessToken);
    console.log(`Checking pages for org: ${org.name}`);

    try {
        const response = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token,tasks'
            }
        });

        const pages = response.data.data || [];
        console.log(`Found ${pages.length} pages:`);
        pages.forEach((p: any) => {
            console.log(`- ${p.name} (ID: ${p.id})`);
        });

        // Also check ad accounts
        const adResponse = await axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,account_id'
            }
        });
        const adAccounts = adResponse.data.data || [];
        console.log(`\nFound ${adAccounts.length} ad accounts:`);
        adAccounts.forEach((a: any) => {
            console.log(`- ${a.name} (ID: ${a.id})`);
        });

    } catch (error: any) {
        console.error('Error fetching data from Meta:', error.response?.data || error.message);
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
