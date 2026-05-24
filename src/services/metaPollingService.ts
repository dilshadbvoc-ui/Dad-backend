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
                                fields: 'id,name,status',
                                limit: 50
                            }
                        });

                        const allForms = formsResponse.data.data || [];
                        const forms = allForms.filter((f: any) => f.status === 'ACTIVE');

                        // Use 32 min buffer (cron runs every 30 min + 2 min safety overlap)
                        const sinceTime = Math.floor(Date.now() / 1000) - (32 * 60);
                        logger.info(`Checking ${forms.length} forms for page ${account.pageName || account.pageId} since ${new Date(sinceTime * 1000).toISOString()}`, 'MetaPolling', undefined, org.id);

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
                                            // ✅ Route through MetaLeadGuard to prevent duplicates
                                            // if the same lead was already processed by the webhook
                                            const { MetaLeadGuard } = await import('./metaLeadGuard');
                                            const lockAcquired = await MetaLeadGuard.acquireLock(leadData.id, org.id);
                                            if (!lockAcquired) {
                                                logger.info(`[MetaPolling] Lead ${leadData.id} already processed (webhook/dedup). Skipping.`, 'MetaPolling', undefined, org.id);
                                                continue;
                                            }
                                            try {
                                                await MetaLeadService.saveAndDistributeLead(org.id, account.pageId, leadData, form.id);
                                                MetaLeadGuard.markSuccess(leadData.id, org.id);
                                            } catch (saveErr: any) {
                                                MetaLeadGuard.markFailure(leadData.id, org.id, saveErr);
                                                throw saveErr;
                                            }
                                        } catch (leadErr: any) {
                                            if (!leadErr.message?.includes('already exists')) {
                                                logger.error(`Error processing lead ${leadData.id}: ${leadErr.message}`, leadErr, 'MetaPolling', undefined, org.id);
                                            }
                                        }
                                    }
                                }
                            } catch (formErr: any) {
                                const errorData = formErr.response?.data || formErr.message;
                                const errorString = JSON.stringify(errorData);
                                logger.error(`Failed to fetch leads for form ${form.id} (${org.name}): ${errorString}`, formErr, 'MetaPolling', undefined, org.id);
                                
                                // Send alert for critical API errors (e.g. expired tokens)
                                if (errorString.includes('Error validating access token') || errorString.includes('OAuthException')) {
                                    await this.sendAlertEmail(errorString, org.name, org.id);
                                }
                            }
                        }
                    } catch (accountErr: any) {
                        const errorData = accountErr.response?.data || accountErr.message;
                        const errorString = JSON.stringify(errorData);
                        logger.error(`Failed to poll Meta account ${account.pageId} (${org.name}): ${errorString}`, accountErr, 'MetaPolling', undefined, org.id);
                        
                        // Send alert for authentication failures
                        if (errorString.includes('access token') || errorString.includes('permission')) {
                            await this.sendAlertEmail(errorString, org.name, org.id);
                        }
                    }
                }
            }
        } catch (error: any) {
            logger.error('Critical error in MetaPollingService:', error, 'MetaPolling');
        } finally {
            isPolling = false;
        }
    },
    
    /**
     * Sends a warning email if polling fails
     */
    async sendAlertEmail(errorMsg: string, orgName: string, orgId: string) {
        try {
            const { EmailService } = await import('./emailService');
            const subject = `⚠️ ALERT: Meta Lead Polling Failure - ${orgName}`;
            const html = `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #d32f2f;">Meta Polling Integration Error</h2>
                    <p>The system encountered an error while polling for leads for <strong>${orgName}</strong>.</p>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 5px solid #d32f2f;">
                        <code>${errorMsg}</code>
                    </div>
                    <p><strong>Org ID:</strong> ${orgId}</p>
                    <p>Please check the Meta integration settings and ensure the Page Access Token is still valid.</p>
                    <hr/>
                    <p style="font-size: 12px; color: #777;">This is an automated security alert from CRM Meta Service.</p>
                </div>
            `;
            
            await EmailService.sendEmail('hostixpro@gmail.com', subject, html);
            logger.info(`Sent polling alert email to hostixpro@gmail.com for ${orgName}`, 'MetaPolling');
        } catch (e) {
            logger.error('Failed to send Meta alert email:', e, 'MetaPolling');
        }
    }
};

export default MetaPollingService;
