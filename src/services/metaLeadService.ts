import axios from 'axios';
import prisma from '../config/prisma';
import { DistributionService } from './distributionService';
import { NotificationService } from './notificationService';
import { LeadSource, Prisma } from '../generated/client';
import { decrypt } from '../utils/encryption';
import { GeoLocationService } from './geoLocationService';

interface QueuedLead {
    leadgenId: string;
    pageId: string;
    adId?: string;
    formId?: string;
    attempts: number;
    nextRetry: number;
}

let leadQueue: QueuedLead[] = [];
let isProcessingQueue = false;

export const MetaLeadService = {
    /**
     * Processes an incoming lead from Meta Webhook
     */
    async processIncomingLead(leadgenId: string, pageId: string, adId?: string, formId?: string) {
        try {
            const META_API_VERSION = 'v18.0';
            console.log(`[MetaLeadService] Processing lead ${leadgenId} from Page ${pageId}...`);

            // 1. Find ALL organisations connected to this Page ID
            const candidates = await prisma.organisation.findMany({
                where: {
                    isDeleted: false,
                    OR: [
                        { integrations: { path: ['meta', 'pageId'], equals: pageId } },
                        { integrations: { path: ['facebook_payload', 'pageId'], equals: pageId } },
                        { integrations: { path: ['metaAccounts'], array_contains: [{ pageId: pageId }] } } 
                    ]
                }
            });

            const allCandidates = [...candidates];
            if (allCandidates.length === 0) {
                const potentialOrgs = await prisma.organisation.findMany({
                    where: { isDeleted: false, integrations: { path: ['metaAccounts'], not: Prisma.JsonNull } }
                });
                const dynamicMatches = potentialOrgs.filter(o => {
                    const accounts = (o.integrations as any)?.metaAccounts;
                    return Array.isArray(accounts) && accounts.some((acc: any) => acc.pageId === pageId);
                });
                dynamicMatches.forEach(dm => {
                    if (!allCandidates.find(c => c.id === dm.id)) allCandidates.push(dm);
                });
            }

            if (allCandidates.length === 0) {
                console.error(`[MetaLeadService] No organisation found with Meta Page ID: ${pageId}.`);
                return;
            }

            // 2. Fetch Lead Details
            let metaLeadData: any = null;
            let fetchedSuccess = false;
            let lastError: any = null;

            for (const candidate of allCandidates) {
                const integrations = (candidate.integrations as any) || {};
                const accounts = [...(integrations.metaAccounts || [])];
                if (integrations.meta) accounts.push(integrations.meta);
                const matchedAccount = accounts.find((acc: any) => acc.pageId === pageId);

                if (matchedAccount?.accessToken) {
                    try {
                        const accessToken = decrypt(matchedAccount.accessToken);
                        const response = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${leadgenId}`, {
                            params: { 
                                access_token: accessToken,
                                fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,ad_account_id'
                            }
                        });
                        metaLeadData = response.data;
                        fetchedSuccess = true;
                        break; 
                    } catch (e: any) {
                        lastError = e;
                        console.warn(`[MetaLeadService] Token for org ${candidate.id} failed, trying next...`);
                    }
                }
            }

            // 3. RETRY QUEUE LOGIC
            if (!fetchedSuccess || !metaLeadData) {
                const errorMsg = lastError?.response?.data?.error?.message || lastError?.message;
                const isRateLimit = errorMsg?.includes('rate') || lastError?.response?.status === 400;

                if (isRateLimit) {
                    console.warn(`[MetaLeadService] Rate limited by Meta. Adding lead ${leadgenId} to retry queue.`);
                    this.addToQueue(leadgenId, pageId, adId, formId);
                } else {
                    console.error(`[MetaLeadService] Failed to fetch lead data from Meta for lead ${leadgenId}: ${errorMsg}`);
                }
                return;
            }

            // 4. Process the lead for EACH matching organisation
            for (const org of allCandidates) {
                try {
                    const integrations = (org.integrations as any) || {};
                    const accounts = [...(integrations.metaAccounts || [])];
                    if (integrations.meta) accounts.push(integrations.meta);
                    const matchedAccount = accounts.find((acc: any) => acc.pageId === pageId);

                    if (!matchedAccount) continue;

                    const adAccountId = metaLeadData.ad_account_id || metaLeadData.ad?.account_id;
                    const enabledAccounts = (matchedAccount.enabledLeadSyncAccounts as string[]) || [];

                    if (enabledAccounts.length > 0 && adAccountId) {
                        const normalizedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
                        const isEnabled = enabledAccounts.some(id => id === normalizedId || id === adAccountId);
                        if (!isEnabled) continue;
                    }

                    await this.saveAndDistributeLead(org.id, pageId, metaLeadData, formId, adId);
                } catch (orgErr: any) {
                    console.error(`[MetaLeadService] Error processing for Org ${org.id}:`, orgErr.message);
                }
            }
        } catch (error: any) {
            console.error('[MetaLeadService] Error:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Add lead to retry queue with backoff
     */
    addToQueue(leadgenId: string, pageId: string, adId?: string, formId?: string, attempts = 0) {
        if (attempts >= 5) {
            console.error(`[MetaLeadService] Max retries reached for lead ${leadgenId}. Giving up.`);
            return;
        }

        // Exponential backoff: 1m, 2m, 4m, 8m, 16m
        const delay = Math.pow(2, attempts) * 60 * 1000;
        
        const alreadyInQueue = leadQueue.some(l => l.leadgenId === leadgenId);
        if (alreadyInQueue && attempts === 0) return; // Don't add fresh if already retrying

        leadQueue.push({
            leadgenId,
            pageId,
            adId,
            formId,
            attempts: attempts + 1,
            nextRetry: Date.now() + delay
        });

        console.log(`[MetaLeadService] Lead ${leadgenId} scheduled for retry #${attempts + 1} in ${delay / 1000}s`);
        this.startQueueProcessor();
    },

    /**
     * Periodically check and process the queue
     */
    startQueueProcessor() {
        if (isProcessingQueue) return;
        isProcessingQueue = true;

        const timer = setInterval(async () => {
            if (leadQueue.length === 0) {
                clearInterval(timer);
                isProcessingQueue = false;
                return;
            }

            const now = Date.now();
            const readyToProcess = leadQueue.filter(l => l.nextRetry <= now);
            leadQueue = leadQueue.filter(l => l.nextRetry > now);

            for (const item of readyToProcess) {
                console.log(`[MetaLeadService] Retrying lead ${item.leadgenId} (Attempt ${item.attempts})...`);
                try {
                    // Try to process again
                    await this.processIncomingLead(item.leadgenId, item.pageId, item.adId, item.formId);
                } catch (err) {
                    // processIncomingLead will re-add to queue if it fails with rate limit
                }
            }
        }, 30000); // Check every 30s
    },

    /**
     * Internal helper to save and distribute a lead
     */
    async saveAndDistributeLead(orgId: string, pageId: string, metaLeadData: any, formId?: string, adId?: string) {
        try {
            const leadgenId = metaLeadData.id;
            
            // 1. Check if lead already exists in THIS organisation
            const existing = await prisma.lead.findFirst({
                where: { 
                    organisationId: orgId, 
                    sourceDetails: { path: ['metaLeadgenId'], equals: leadgenId }
                }
            });

            if (existing) {
                return;
            }

            // 2. Map Field Data
            const fieldMap: Record<string, string> = {};
            metaLeadData.field_data.forEach((field: any) => {
                if (field.values && field.values.length > 0) {
                    fieldMap[field.name.toLowerCase()] = field.values[0];
                }
            });

            const getField = (keys: string[]) => {
                for (const key of keys) {
                    if (fieldMap[key]) return fieldMap[key];
                }
                return '';
            };

            const leadData = {
                full_name: getField(['full name', 'full_name', 'name', 'first_name', 'first name']),
                phone: getField(['phone', 'phone number', 'phone_number', 'mobile', 'mobile number']),
                email: getField(['email', 'email address', 'email_address']),
                city: getField(['city', 'location']),
                company: getField(['company', 'organization', 'company name']),
                campaign_name: metaLeadData.campaign_name || metaLeadData.ad_name || `Form: ${metaLeadData.form_id}` || 'Meta Lead'
            };

            const targetBranchId = await DistributionService.resolveBranchForMetaPage(orgId, pageId);

            const crmData = {
                firstName: leadData.full_name || 'Meta Lead',
                lastName: '',
                phone: leadData.phone || '',
                email: leadData.email || undefined,
                organisationId: orgId,
                source: LeadSource.meta_leadgen,
                sourceDetails: {
                    metaLeadgenId: leadgenId,
                    metaFormId: formId || metaLeadData.form_id,
                    metaPageId: pageId,
                    metaAdId: adId || metaLeadData.ad_id,
                    adName: metaLeadData.ad_name,
                    campaignId: metaLeadData.campaign_id,
                    campaignName: leadData.campaign_name,
                    metaCreatedTime: metaLeadData.created_time
                }
            };

            const { DuplicateLeadService } = await import('./duplicateLeadService');
            const duplicateCheck = await DuplicateLeadService.checkDuplicate(
                crmData.phone, 
                crmData.email, 
                orgId, 
                targetBranchId || undefined
            );

            if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, crmData, orgId);
                return;
            }

            const lead = await prisma.lead.create({
                data: {
                    ...crmData,
                    branchId: targetBranchId
                }
            });

            await DistributionService.assignLead(lead, orgId);

            const admins = await prisma.user.findMany({
                where: { organisationId: orgId, role: { in: ['admin', 'super_admin'] }, isActive: true },
                select: { id: true }
            });
            for (const admin of admins) {
                await NotificationService.send(admin.id, 'New Meta Lead', `New lead: ${crmData.firstName}`, 'info');
            }
        } catch (error: any) {
            console.error(`[MetaLeadService] Error saving lead ${metaLeadData.id} for Org ${orgId}:`, error.message);
            throw error;
        }
    }
};

export default MetaLeadService;
