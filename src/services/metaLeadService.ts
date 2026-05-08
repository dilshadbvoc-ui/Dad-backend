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
            let org = await prisma.organisation.findFirst({
                where: {
                    isDeleted: false,
                    OR: [
                        { integrations: { path: ['meta', 'pageId'], equals: pageId } },
                        { integrations: { path: ['facebook_payload', 'pageId'], equals: pageId } },
                    ]
                }
            });

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
                console.error(`[MetaLeadService] No organisation found with Meta Page ID: ${pageId}.`);
                return;
            }

            // 2. Check if lead already exists by Meta Lead ID (Deduplication P1)
            const allMetaLeads = await prisma.lead.findMany({
                where: { organisationId: org.id, source: 'meta_leadgen' },
                select: { id: true, sourceDetails: true }
            });

            const existingByMetaId = allMetaLeads.find(l => (l.sourceDetails as any)?.metaLeadgenId === leadgenId);

            if (existingByMetaId) {
                console.log(`[MetaLeadService] Lead ${leadgenId} already exists (ID: ${existingByMetaId.id}). Skipping.`);
                return;
            }

            // 3. Fetch Access Token and Lead Details
            const integrations = (org.integrations as any) || {};
            const accounts = [...(integrations.metaAccounts || [])];
            if (integrations.meta) accounts.push(integrations.meta);
            const matchedAccount = accounts.find((acc: any) => acc.pageId === pageId);

            if (!matchedAccount || !matchedAccount.accessToken) {
                console.error(`[MetaLeadService] No token for Page ${pageId}`);
                return;
            }

            const accessToken = decrypt(matchedAccount.accessToken);
            const response = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${leadgenId}`, {
                params: { 
                    access_token: accessToken,
                    fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id'
                }
            });
            
            const metaLeadData = response.data;
            
            // 4. Check if this Ad Account is enabled for sync
            const adAccountId = metaLeadData.ad_account_id || metaLeadData.ad?.account_id;
            const enabledAccounts = (matchedAccount.enabledLeadSyncAccounts as string[]) || [];
            
            if (enabledAccounts.length > 0 && adAccountId) {
                const normalizedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
                const isEnabled = enabledAccounts.some(id => id === normalizedId || id === adAccountId);
                if (!isEnabled) {
                    console.log(`[MetaLeadService] Lead ${leadgenId} ignored. Ad Account ${adAccountId} is not enabled.`);
                    return;
                }
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

            // 6. Distribution & Deduplication (P2: Phone/Email)
            const targetBranchId = await DistributionService.resolveBranchForMetaPage(org.id, pageId);

            const crmData = {
                firstName: leadData.full_name || 'Meta Lead',
                lastName: '', // ReEnquiryData requires this
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
                console.log(`[MetaLeadService] Duplicate found (${duplicateCheck.existingLead.id}). Re-enquiry.`);
                await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, crmData, org.id);
                return;
            }

            // 7. Create Lead (Unassigned initially, then assign via rules)
            const lead = await prisma.lead.create({
                data: {
                    ...crmData,
                    branchId: targetBranchId
                }
            });

            console.log(`[MetaLeadService] Created lead ${lead.id} from Meta. Running strict distribution...`);

            // 8. Run Distribution Service (Strict Campaign Rules)
            await DistributionService.assignLead(lead, org.id);

            // 8. Notify
            try {
                const admins = await prisma.user.findMany({
                    where: { organisationId: org.id, role: { in: ['admin', 'super_admin'] }, isActive: true },
                    select: { id: true }
                });
                for (const admin of admins) {
                    await NotificationService.send(admin.id, 'New Meta Lead', `New lead: ${crmData.firstName}`, 'info');
                }
            } catch (notifyErr) {
                console.warn('[MetaLeadService] Notification failed');
            }

        } catch (error: any) {
            console.error('[MetaLeadService] Error:', error.response?.data || error.message);
            throw error;
        }
    }
};

export default MetaLeadService;
