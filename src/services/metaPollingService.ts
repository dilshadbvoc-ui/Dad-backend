import axios from 'axios';
import prisma from '../config/prisma';
import { MetaLeadService } from './metaLeadService';
import { decrypt } from '../utils/encryption';
import logger from '../utils/logger';

export const MetaPollingService = {
    /**
     * Polls Meta for new leads across all connected organisations
     */
    async pollAllOrganisations() {
        try {
            const organisations = await prisma.organisation.findMany({
                where: {
                    isDeleted: false,
                    // Allow polling for active and suspended orgs so we don't silently drop leads
                    // if an admin forgot to reactivate a paying client.
                    status: { in: ['active', 'suspended'] }
                },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    integrations: true
                }
            });

            logger.info(`Found ${organisations.length} organisations (active/suspended) to check for Meta integrations.`, 'MetaPolling');
            
            for (const org of organisations) {
                const integrations = (org.integrations as any) || {};
                const accounts = [...(integrations.metaAccounts || [])];
                
                // Also check legacy meta object
                if (integrations.meta && integrations.meta.connected) {
                    const exists = accounts.some(acc => acc.pageId === integrations.meta.pageId);
                    if (!exists) accounts.push(integrations.meta);
                }

                if (accounts.length === 0) {
                    // logger.info(`No Meta accounts found for ${org.name}`, 'MetaPolling', undefined, org.id);
                    continue;
                }

                logger.info(`Polling ${accounts.length} Meta accounts for ${org.name}`, 'MetaPolling', undefined, org.id);

                for (const account of accounts) {
                    if (!account.connected || !account.accessToken || !account.pageId) continue;

                    try {
                        const accessToken = decrypt(account.accessToken);
                        
                        // 1. Get leadgen forms for the page
                        const formsResponse = await axios.get(`https://graph.facebook.com/v18.0/${account.pageId}/leadgen_forms`, {
                            params: {
                                access_token: accessToken,
                                fields: 'id,name',
                                limit: 50
                            }
                        });

                        const forms = formsResponse.data.data || [];
                        
                        // 2. For each form, fetch leads from the last 15 minutes (buffer)
                        const sinceTime = Math.floor(Date.now() / 1000) - (15 * 60); 

                        for (const form of forms) {
                            const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                                params: {
                                    access_token: accessToken,
                                    fields: 'id,created_time',
                                    filtering: JSON.stringify([{ 
                                        field: 'time_created', 
                                        operator: 'GREATER_THAN', 
                                        value: sinceTime 
                                    }]),
                                    limit: 100
                                }
                            });

                            const leads = leadsResponse.data.data || [];
                            
                            if (leads.length > 0) {
                                logger.info(`Found ${leads.length} leads for form ${form.name} (${account.pageName})`, 'MetaPolling', undefined, org.id);
                                
                                for (const lead of leads) {
                                    try {
                                        // Use the existing logic (handles deduplication and assignment)
                                        await MetaLeadService.processIncomingLead(lead.id, account.pageId);
                                    } catch (leadErr: any) {
                                        // Ignore duplicates (service logs them)
                                        if (!leadErr.message?.includes('Duplicate')) {
                                            logger.error(`Error processing lead ${lead.id}: ${leadErr.message}`, leadErr, 'MetaPolling', undefined, org.id);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (accountErr: any) {
                        logger.error(`Failed to poll Meta account ${account.pageName || account.pageId} for ${org.name}: ${accountErr.message}`, accountErr, 'MetaPolling', undefined, org.id);
                    }
                }
            }

            logger.info('Meta lead polling completed.', 'MetaPolling');
        } catch (error: any) {
            logger.error('Critical error in MetaPollingService:', error, 'MetaPolling');
        }
    }
};

export default MetaPollingService;
