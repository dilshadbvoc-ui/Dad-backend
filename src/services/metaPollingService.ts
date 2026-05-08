import axios from 'axios';
import prisma from '../config/prisma';
import { MetaLeadService } from './metaLeadService';
import { decrypt } from '../utils/encryption';
import logger from '../utils/logger';

let isPolling = false;

export const MetaPollingService = {
    /**
     * Polls Meta for new leads across all connected organisations
     */
    async pollAllOrganisations() {
        if (isPolling) {
            logger.info('Meta polling is already in progress, skipping this run.', 'MetaPolling');
            return;
        }

        isPolling = true;
        try {
            const organisations = await prisma.organisation.findMany({
                where: {
                    isDeleted: false,
                    status: { in: ['active', 'suspended'] }
                },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    integrations: true
                }
            });

            logger.info(`Found ${organisations.length} organisations to check for Meta integrations.`, 'MetaPolling');
            
            for (const org of organisations) {
                const integrations = (org.integrations as any) || {};
                const accounts = [...(integrations.metaAccounts || [])];
                
                if (integrations.meta && integrations.meta.connected) {
                    const exists = accounts.some(acc => acc.pageId === integrations.meta.pageId);
                    if (!exists) accounts.push(integrations.meta);
                }

                if (accounts.length === 0) continue;

                for (const account of accounts) {
                    if (!account.connected || !account.accessToken || !account.pageId) continue;

                    try {
                        const accessToken = decrypt(account.accessToken);
                        
                        // 1. Get leadgen forms
                        const formsResponse = await axios.get(`https://graph.facebook.com/v18.0/${account.pageId}/leadgen_forms`, {
                            params: {
                                access_token: accessToken,
                                fields: 'id,name',
                                limit: 50
                            }
                        });

                        const forms = formsResponse.data.data || [];
                        const sinceTime = Math.floor(Date.now() / 1000) - (10 * 60); // 10 min buffer

                        for (const form of forms) {
                            try {
                                const leadsResponse = await axios.get(`https://graph.facebook.com/v18.0/${form.id}/leads`, {
                                    params: {
                                        access_token: accessToken,
                                        fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,ad_account_id',
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
                                    logger.info(`Found ${leads.length} leads for form ${form.name} (${account.pageName || account.pageId})`, 'MetaPolling', undefined, org.id);
                                    
                                    for (const leadData of leads) {
                                        try {
                                            // 3. Process the lead directly with the data we already have
                                            await MetaLeadService.saveAndDistributeLead(org.id, account.pageId, leadData, form.id);
                                        } catch (leadErr: any) {
                                            if (!leadErr.message?.includes('already exists')) {
                                                logger.error(`Error processing lead ${leadData.id}: ${leadErr.message}`, leadErr, 'MetaPolling', undefined, org.id);
                                            }
                                        }
                                    }
                                }
                            } catch (formErr: any) {
                                const errorData = formErr.response?.data || formErr.message;
                                logger.error(`Failed to fetch leads for form ${form.id} (${org.name}): ${JSON.stringify(errorData)}`, formErr, 'MetaPolling', undefined, org.id);
                            }
                        }
                    } catch (accountErr: any) {
                        const errorData = accountErr.response?.data || accountErr.message;
                        logger.error(`Failed to poll Meta account ${account.pageId} (${org.name}): ${JSON.stringify(errorData)}`, accountErr, 'MetaPolling', undefined, org.id);
                    }
                }
            }
        } catch (error: any) {
            logger.error('Critical error in MetaPollingService:', error, 'MetaPolling');
        } finally {
            isPolling = false;
        }
    }
};

export default MetaPollingService;
