
import axios from 'axios';
import { PrismaClient, LeadSource } from '../generated/client';
import { decrypt, encrypt } from '../utils/encryption';
import { MetaLeadService } from '../services/metaLeadService';

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

    const userAccessToken = decrypt(meta.accessToken);
    const appId = meta.appId || process.env.META_APP_ID;
    console.log(`Syncing Meta for org: ${org.name} (${org.id})`);

    try {
        // 1. Fetch ALL Pages
        const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
            params: {
                access_token: userAccessToken,
                fields: 'id,name,access_token'
            }
        });

        const pages = pagesResponse.data.data || [];
        console.log(`Found ${pages.length} pages.`);

        // 2. Fetch ALL Ad Accounts
        const adResponse = await axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
            params: {
                access_token: userAccessToken,
                fields: 'id,name,account_id'
            }
        });
        const adAccounts = adResponse.data.data || [];
        console.log(`Found ${adAccounts.length} ad accounts.`);

        // 3. Prepare metaAccounts array
        const metaAccounts = pages.map((p: any) => {
            // Find if there's a matching ad account (heuristic: maybe name matches or just link all to all?)
            // Usually, a Page is linked to an Ad Account, but multiple can exist.
            // For now, we'll store all pages. 
            return {
                appId,
                pageId: p.id,
                pageName: p.name,
                accessToken: encrypt(p.access_token),
                connected: true,
                connectedAt: new Date().toISOString(),
                // Enable sync for all ad accounts found (or the user can filter later)
                enabledLeadSyncAccounts: adAccounts.map((a: any) => a.id)
            };
        });

        // 4. Update Org Integrations
        // We pick the most "Emtees" looking page as primary if possible
        const primaryPage = pages.find((p: any) => p.name.toLowerCase().includes('emtees academy')) || pages[0];
        const primaryAdAccount = adAccounts.find((a: any) => a.name.toLowerCase().includes('emtees')) || adAccounts[0];

        const updatedIntegrations = {
            ...integrations,
            meta: {
                ...meta,
                pageId: primaryPage?.id,
                pageName: primaryPage?.name,
                adAccountId: primaryAdAccount?.id,
                adAccountName: primaryAdAccount?.name,
                enabledLeadSyncAccounts: adAccounts.map((a: any) => a.id)
            },
            metaAccounts: metaAccounts
        };

        await prisma.organisation.update({
            where: { id: org.id },
            data: { integrations: updatedIntegrations }
        });

        console.log('Organization integrations updated with all pages and ad accounts.');

        // 5. Subscribe ALL Pages to Webhooks
        for (const page of pages) {
            try {
                console.log(`Subscribing Page: ${page.name} (${page.id})...`);
                await axios.post(`https://graph.facebook.com/v18.0/${page.id}/subscribed_apps`, null, {
                    params: {
                        access_token: page.access_token,
                        subscribed_fields: 'leadgen,ads'
                    }
                });
                console.log(`Success: Subscribed ${page.name}`);
            } catch (subErr: any) {
                console.error(`Failed to subscribe ${page.name}:`, subErr.response?.data || subErr.message);
            }
        }

        // 6. Fetch Historical Leads (Last 7 Days)
        console.log('\nFetching historical leads for all pages...');
        for (const page of pages) {
            try {
                // Get leadgen forms for the page
                const formsResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}/leadgen_forms`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,name'
                    }
                });

                const forms = formsResponse.data.data || [];
                for (const form of forms) {
                    console.log(`Checking form: ${form.name} on page ${page.name}`);
                    const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                        params: {
                            access_token: page.access_token,
                            fields: 'id,created_time',
                            filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60) }])
                        }
                    });

                    const leads = leadsResponse.data.data || [];
                    console.log(`Found ${leads.length} leads in the last 7 days.`);

                    for (const lead of leads) {
                        try {
                            // Process each lead using the unified service
                            await MetaLeadService.processIncomingLead(lead.id, page.id);
                            console.log(`Processed lead: ${lead.id}`);
                        } catch (leadErr: any) {
                            // Ignore if already exists (service handles it)
                            if (leadErr.message?.includes('Duplicate')) {
                                console.log(`Lead ${lead.id} already exists.`);
                            } else {
                                console.error(`Error processing lead ${lead.id}:`, leadErr.message);
                            }
                        }
                    }
                }
            } catch (formErr: any) {
                console.error(`Error fetching forms for page ${page.name}:`, formErr.response?.data || formErr.message);
            }
        }

    } catch (error: any) {
        console.error('Fatal Sync Error:', error.response?.data || error.message);
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
