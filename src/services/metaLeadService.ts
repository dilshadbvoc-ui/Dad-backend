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
            const META_API_VERSION = 'v18.0'; // Stay consistent with other routes
            console.log(`[MetaLeadService] Processing lead ${leadgenId} from Page ${pageId}...`);

            // 1. Find the organisation connected to this Page ID
            // Try matching valid accounts in metaAccounts array or legacy meta object
            let org = await prisma.organisation.findFirst({
                where: {
                    isDeleted: false,
                    OR: [
                        { integrations: { path: ['meta', 'pageId'], equals: pageId } },
                        { integrations: { path: ['facebook_payload', 'pageId'], equals: pageId } },
                    ]
                }
            });

            // If not found via primary, scan metaAccounts array
            if (!org) {
                const candidates = await prisma.organisation.findMany({
                    where: { isDeleted: false, integrations: { path: ['metaAccounts'], not: Prisma.JsonNull } }
                });
                org = candidates.find(o => {
                    const accounts = (o.integrations as any)?.metaAccounts;
                    return Array.isArray(accounts) && accounts.some((acc: any) => acc.pageId === pageId);
                }) || null;
            }

            if (!org) {
                console.error(`[MetaLeadService] No organisation found with Meta Page ID: ${pageId}. Ensure the Page is connected in Settings.`);
                return;
            }

            // Extract the correct account config
            const integrations = (org.integrations as any) || {};
            const accounts = [...(integrations.metaAccounts || [])];
            if (integrations.meta) accounts.push({ ...integrations.meta, _source: LeadSource.meta_leadgen });
            if (integrations.facebook_payload) accounts.push({ ...integrations.facebook_payload, _source: (LeadSource as any).facebook_payload });

            const matchedAccount = accounts.find((acc: any) => acc.pageId === pageId);

            if (!matchedAccount || !matchedAccount.accessToken) {
                console.error(`[MetaLeadService] Organisation ${org.id} has no Access Token for Page ${pageId}`);
                return;
            }

            const metaConfig = matchedAccount;
            const accessToken = decrypt(metaConfig.accessToken);

            // 2. Fetch Lead details from Meta Graph API with expanded fields
            const response = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${leadgenId}`, {
                params: { 
                    access_token: accessToken,
                    fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,ad{account_id}'
                }
            });
            
            const metaLeadData = response.data;
            
            // 2b. Check if this Ad Account is enabled for sync
            const adAccountId = metaLeadData.ad?.account_id || metaLeadData.ad_account_id;
            const enabledAccounts = (metaConfig.enabledLeadSyncAccounts as string[]) || [];
            
            if (enabledAccounts.length > 0 && adAccountId) {
                // Meta returns account_id without 'act_' prefix usually, or sometimes with it.
                // We should be careful with the format.
                const normalizedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
                const isEnabled = enabledAccounts.some(id => id === normalizedId || id === adAccountId);
                
                if (!isEnabled) {
                    console.log(`[MetaLeadService] Lead ${leadgenId} ignored. Ad Account ${adAccountId} is not enabled for sync.`);
                    return;
                }
            }

            console.log(`[MetaLeadService] Lead details fetched. Campaign: ${metaLeadData.campaign_name || 'N/A'}`);

            // 3. Map Meta field_data to CRM fields with better coverage
            const fieldMap: Record<string, string> = {};
            metaLeadData.field_data.forEach((field: any) => {
                if (field.values && field.values.length > 0) {
                    fieldMap[field.name.toLowerCase()] = field.values[0];
                }
            });

            // Helper to get field with multiple possible keys
            const getField = (keys: string[]) => {
                for (const key of keys) {
                    if (fieldMap[key]) return fieldMap[key];
                }
                return null;
            };

            // If not found via Meta fields, try detecting from phone (if available early)
            let geoData = null;
            const rawPhone = getField(['phone_number', 'phone', 'mobile_number', 'mobile_phone', 'contact_number']);
            if (!geoData && rawPhone) {
                geoData = GeoLocationService.detectCountryFromPhone(rawPhone.toString());
            }

            // Resolve Status: Priority 1: Payload mapping, Priority 2: Org default, Priority 3: 'new'
            let leadStatus = getField(['status', 'lead_status', 'lead status', 'ststus']) || "new";
            
            // If it's still 'new' (either explicit or default), try to see if org has a custom default
            if (leadStatus === 'new' && org.leadStatuses && Array.isArray(org.leadStatuses)) {
                const statuses = org.leadStatuses as any[];
                const configuredDefault = statuses.find((s) => s.isDefault);
                if (configuredDefault) {
                    leadStatus = configuredDefault.id;
                }
            }

            const crmData: any = {
                firstName: getField(['first_name', 'firstname', 'first name', 'fname']) || 
                           fieldMap.full_name?.split(' ')[0] || 'Meta',
                lastName: getField(['last_name', 'lastname', 'last name', 'lname']) || 
                           fieldMap.full_name?.split(' ').slice(1).join(' ') || 'Lead',
                email: getField(['email', 'email_address', 'e-mail']),
                phone: rawPhone || '',
                company: getField(['company_name', 'company', 'organization', 'organisation']),
                jobTitle: getField(['job_title', 'position', 'designation']),
                country: geoData?.country || getField(['country', 'location']),
                countryCode: geoData?.countryCode || null,
                phoneCountryCode: geoData?.phoneCountryCode || null,
                source: getField(['source', 'lead_source', 'lead source']) || metaConfig._source || LeadSource.meta_leadgen,
                sourceDetails: {
                    metaLeadgenId: leadgenId,
                    metaFormId: metaLeadData.form_id || formId,
                    metaAdId: metaLeadData.ad_id || adId,
                    metaAdName: metaLeadData.ad_name,
                    metaAdSetId: metaLeadData.adset_id,
                    metaAdSetName: metaLeadData.adset_name,
                    metaCampaignId: metaLeadData.campaign_id,
                    metaCampaignName: metaLeadData.campaign_name,
                    campaignName: metaLeadData.campaign_name, // Explicit field for easier display
                    adName: metaLeadData.ad_name,
                    rawMetaFields: fieldMap,
                    metaCreatedTime: metaLeadData.created_time
                },
                status: leadStatus,
                organisationId: org.id,
                branchId: metaConfig.branchId || null
            };

            // 4. Resolve target owner and branch EARLY to isolate duplicate check
            const { DistributionService } = await import('./distributionService');
            const targetOwnerId = await DistributionService.assignLead(
                { ...crmData, id: undefined }, 
                org.id
            );

            let targetBranchId = crmData.branchId;
            if (targetOwnerId) {
                const assignedUser = await prisma.user.findUnique({
                    where: { id: targetOwnerId },
                    select: { branchId: true }
                });
                if (assignedUser?.branchId) targetBranchId = assignedUser.branchId;
            }

            // 5. Check for duplicates in the RESOLVED branch
            const { DuplicateLeadService } = await import('./duplicateLeadService');
            const duplicateCheck = await DuplicateLeadService.checkDuplicate(
                crmData.phone, 
                crmData.email, 
                org.id, 
                targetBranchId || undefined
            );

            if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                console.log(`[MetaLeadService] Duplicate lead detected (${duplicateCheck.existingLead.id}) in branch ${targetBranchId}. Handling as re-enquiry.`);
                await DuplicateLeadService.handleReEnquiry(
                    duplicateCheck.existingLead,
                    {
                        firstName: crmData.firstName,
                        lastName: crmData.lastName,
                        email: crmData.email,
                        phone: crmData.phone,
                        company: crmData.company,
                        source: 'meta_leadgen',
                        sourceDetails: crmData.sourceDetails
                    },
                    org.id
                );
                return;
            }

            // 6. Create the Lead with resolved assignment
            const lead = await prisma.lead.create({
                data: {
                    ...crmData,
                    assignedToId: targetOwnerId || undefined,
                    branchId: targetBranchId
                }
            });

            console.log(`[MetaLeadService] Successfully created lead ${lead.id} from Meta`);

            // 8. Create Notification for Sales/Admin
            try {
                const admins = await prisma.user.findMany({
                    where: {
                        organisationId: org.id,
                        role: { in: ['admin', 'super_admin'] },
                        isActive: true
                    },
                    select: { id: true }
                });

                for (const admin of admins) {
                    await NotificationService.send(
                        admin.id,
                        'New Meta Lead',
                        `New lead received: ${crmData.firstName} ${crmData.lastName}`,
                        'info'
                    );
                }
            } catch (notifyErr) {
                console.warn('[MetaLeadService] Notification failed:', notifyErr);
            }

        } catch (error: any) {
            console.error('[MetaLeadService] Error processing Meta lead:', error.response?.data || error.message);
            throw error;
        }
    }
};

export default MetaLeadService;
