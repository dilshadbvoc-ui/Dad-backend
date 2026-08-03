import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';
import { MetaLeadService } from '../services/metaLeadService';

const prisma = new PrismaClient();

async function syncRajithaLeads() {
    try {
        console.log("Starting syncRajithaLeads...");
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true, integrations: true }
        });

        if (!user || !user.organisationId) {
            console.log("User or Org ID not found.");
            return;
        }

        console.log("Found User. Fetching Org...");
        const org = await prisma.organisation.findUnique({
            where: { id: user.organisationId }
        });

        if (!org) {
            console.log("Org not found.");
            return;
        }

        console.log("Found Org. Checking integrations...");
        let accessToken;
        if (user.integrations && (user.integrations as any).facebook_payload?.accessToken) {
            accessToken = decrypt((user.integrations as any).facebook_payload.accessToken);
        } else if (org.integrations && (org.integrations as any).meta?.accessToken) {
            accessToken = decrypt((org.integrations as any).meta.accessToken);
        }

        if (!accessToken) {
            console.log("Meta access token not found for user or org.");
            return;
        }

        console.log(`Syncing Meta for org: ${org.name} (${org.id})`);

        console.log("Calling Meta API to fetch accounts...");
        const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
            params: {
                access_token: accessToken,
                fields: 'id,name,access_token'
            }
        });

        const pages = pagesResponse.data.data || [];
        console.log(`Found ${pages.length} pages connected.`);

        for (const page of pages) {
            try {
                console.log(`Fetching forms for page: ${page.name} (${page.id})`);
                const formsResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}/leadgen_forms`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,name'
                    }
                });

                const forms = formsResponse.data.data || [];
                console.log(`Page: ${page.name} (${page.id}) - Found ${forms.length} forms.`);

                for (const form of forms) {
                    const startTime = Math.floor(new Date('2026-07-30T18:30:00.000Z').getTime() / 1000);
                    
                    console.log(`Fetching leads for form: ${form.name} (${form.id})`);
                    const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                        params: {
                            access_token: page.access_token,
                            fields: 'id,created_time',
                            filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: startTime }])
                        }
                    });

                    const leads = leadsResponse.data.data || [];
                    if (leads.length > 0) {
                        console.log(`  Form: ${form.name} - Found ${leads.length} leads created today.`);
                    }

                    for (const lead of leads) {
                        try {
                            console.log(`    Processing lead: ${lead.id}...`);
                            await MetaLeadService.processIncomingLead(lead.id, page.id);
                            console.log(`    Successfully processed lead: ${lead.id}`);
                        } catch (leadErr: any) {
                            if (leadErr.message?.includes('Duplicate')) {
                                console.log(`    Lead ${lead.id} already exists.`);
                            } else {
                                console.error(`    Error processing lead ${lead.id}:`, leadErr.message);
                            }
                        }
                    }
                }
            } catch (formErr: any) {
                console.error(`Error fetching forms for page ${page.name}:`, formErr.response?.data?.error?.message || formErr.message);
            }
        }
        console.log("Done syncing.");
    } catch (error: any) {
        console.error('Fatal Sync Error:', error.response?.data?.error?.message || error.message);
    } finally {
        await prisma.$disconnect();
    }
}

syncRajithaLeads();
