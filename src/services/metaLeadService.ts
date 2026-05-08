import axios from 'axios';
import prisma from '../config/prisma';
import { DistributionService } from './distributionService';
import { NotificationService } from './notificationService';
import { LeadSource, Prisma } from '../generated/client';
import { decrypt } from '../utils/encryption';
import { GeoLocationService } from './geoLocationService';

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
                        { integrations: { path: ['metaAccounts'], array_contains: [{ pageId: pageId }] } } // Check JSON array
                    ]
                }
            });

            // Extra check for candidates that have metaAccounts array (Prisma path might not catch all cases depending on structure)
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

            console.log(`[MetaLeadService] Found ${allCandidates.length} candidate organisations for Page ${pageId}.`);

            // 2. Fetch Lead Details once using a token from one of the valid candidates
            let metaLeadData: any = null;
            let fetchedSuccess = false;

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
                        break; // Successfully fetched
                    } catch (e) {
                        console.warn(`[MetaLeadService] Token for org ${candidate.id} failed, trying next...`);
                    }
                }
            }

            if (!fetchedSuccess || !metaLeadData) {
                console.error(`[MetaLeadService] Failed to fetch lead data from Meta for lead ${leadgenId}.`);
                return;
            }

            // 3. Process the lead for EACH matching organisation
            for (const org of allCandidates) {
                try {
                    const integrations = (org.integrations as any) || {};
                    const accounts = [...(integrations.metaAccounts || [])];
                    if (integrations.meta) accounts.push(integrations.meta);
                    const matchedAccount = accounts.find((acc: any) => acc.pageId === pageId);

                    if (!matchedAccount) continue;

                    // STRICT AD ACCOUNT CHECK
                    const adAccountId = metaLeadData.ad_account_id || metaLeadData.ad?.account_id;
                    const enabledAccounts = (matchedAccount.enabledLeadSyncAccounts as string[]) || [];

                    // If this org has specific enabled accounts, the incoming lead MUST be one of them
                    if (enabledAccounts.length > 0 && adAccountId) {
                        const normalizedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
                        const isEnabled = enabledAccounts.some(id => id === normalizedId || id === adAccountId);
                        if (!isEnabled) {
                            console.log(`[MetaLeadService] Org ${org.id} ignored lead ${leadgenId}. Ad Account ${adAccountId} is not enabled for this org.`);
                            continue;
                        }
                    }

                    // 4. Check if lead already exists in THIS organisation
                    const existing = await prisma.lead.findFirst({
                        where: { 
                            organisationId: org.id, 
                            sourceDetails: { path: ['metaLeadgenId'], equals: leadgenId }
                        }
                    });

                    if (existing) {
                        console.log(`[MetaLeadService] Lead ${leadgenId} already exists in Org ${org.id}. Skipping.`);
                        continue;
                    }

                    // 5. Map Field Data
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

                    const targetBranchId = await DistributionService.resolveBranchForMetaPage(org.id, pageId);

                    const crmData = {
                        firstName: leadData.full_name || 'Meta Lead',
                        lastName: '',
                        phone: leadData.phone || '',
                        email: leadData.email || undefined,
                        organisationId: org.id,
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
                        org.id, 
                        targetBranchId || undefined
                    );

                    if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                        await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, crmData, org.id);
                        continue;
                    }

                    const lead = await prisma.lead.create({
                        data: {
                            ...crmData,
                            branchId: targetBranchId
                        }
                    });

                    await DistributionService.assignLead(lead, org.id);

                    // Notifications
                    const admins = await prisma.user.findMany({
                        where: { organisationId: org.id, role: { in: ['admin', 'super_admin'] }, isActive: true },
                        select: { id: true }
                    });
                    for (const admin of admins) {
                        await NotificationService.send(admin.id, 'New Meta Lead', `New lead: ${crmData.firstName}`, 'info');
                    }

                } catch (orgErr: any) {
                    console.error(`[MetaLeadService] Error processing for Org ${org.id}:`, orgErr.message);
                }
            }

        } catch (error: any) {
            console.error('[MetaLeadService] Error:', error.response?.data || error.message);
            throw error;
        }
    }
};

export default MetaLeadService;
