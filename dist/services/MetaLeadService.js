"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaLeadService = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const distributionService_1 = require("./distributionService");
const notificationService_1 = require("./notificationService");
const client_1 = require("../generated/client");
const encryption_1 = require("../utils/encryption");
exports.MetaLeadService = {
    /**
     * Processes an incoming lead from Meta Webhook
     */
    async processIncomingLead(leadgenId, pageId, adId, formId) {
        try {
            const META_API_VERSION = 'v18.0'; // Stay consistent with other routes
            console.log(`[MetaLeadService] Processing lead ${leadgenId} from Page ${pageId}...`);
            // 1. Find the organisation connected to this Page ID
            let org = await prisma_1.default.organisation.findFirst({
                where: {
                    isDeleted: false,
                    OR: [
                        { integrations: { path: ['meta', 'pageId'], equals: pageId } },
                        { integrations: { path: ['facebook_payload', 'pageId'], equals: pageId } },
                    ]
                }
            });
            if (!org) {
                const candidates = await prisma_1.default.organisation.findMany({
                    where: { isDeleted: false, integrations: { path: ['metaAccounts'], not: client_1.Prisma.JsonNull } }
                });
                org = candidates.find(o => {
                    const accounts = o.integrations?.metaAccounts;
                    return Array.isArray(accounts) && accounts.some((acc) => acc.pageId === pageId);
                }) || null;
            }
            if (!org) {
                console.error(`[MetaLeadService] No organisation found with Meta Page ID: ${pageId}.`);
                return;
            }
            // 2. Check if lead already exists by Meta Lead ID (Deduplication P1)
            const allMetaLeads = await prisma_1.default.lead.findMany({
                where: { organisationId: org.id, source: 'meta_leadgen' },
                select: { id: true, sourceDetails: true }
            });
            const existingByMetaId = allMetaLeads.find(l => l.sourceDetails?.metaLeadgenId === leadgenId);
            if (existingByMetaId) {
                console.log(`[MetaLeadService] Lead ${leadgenId} already exists (ID: ${existingByMetaId.id}). Skipping.`);
                return;
            }
            // 3. Fetch Access Token and Lead Details
            const integrations = org.integrations || {};
            const accounts = [...(integrations.metaAccounts || [])];
            if (integrations.meta)
                accounts.push(integrations.meta);
            const matchedAccount = accounts.find((acc) => acc.pageId === pageId);
            if (!matchedAccount || !matchedAccount.accessToken) {
                console.error(`[MetaLeadService] No token for Page ${pageId}`);
                return;
            }
            const accessToken = (0, encryption_1.decrypt)(matchedAccount.accessToken);
            const response = await axios_1.default.get(`https://graph.facebook.com/${META_API_VERSION}/${leadgenId}`, {
                params: {
                    access_token: accessToken,
                    fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id'
                }
            });
            const metaLeadData = response.data;
            // 4. Check if this Ad Account is enabled for sync
            const adAccountId = metaLeadData.ad_account_id || metaLeadData.ad?.account_id;
            const enabledAccounts = matchedAccount.enabledLeadSyncAccounts || [];
            if (enabledAccounts.length > 0 && adAccountId) {
                const normalizedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
                const isEnabled = enabledAccounts.some(id => id === normalizedId || id === adAccountId);
                if (!isEnabled) {
                    console.log(`[MetaLeadService] Lead ${leadgenId} ignored. Ad Account ${adAccountId} is not enabled.`);
                    return;
                }
            }
            // 5. Map Field Data
            const fieldMap = {};
            metaLeadData.field_data.forEach((field) => {
                if (field.values && field.values.length > 0) {
                    fieldMap[field.name.toLowerCase()] = field.values[0];
                }
            });
            const getField = (keys) => {
                for (const key of keys) {
                    if (fieldMap[key])
                        return fieldMap[key];
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
            const targetBranchId = await distributionService_1.DistributionService.resolveBranchForMetaPage(org.id, pageId);
            const crmData = {
                firstName: leadData.full_name || 'Meta Lead',
                lastName: '', // ReEnquiryData requires this
                phone: leadData.phone || '',
                email: leadData.email || undefined,
                organisationId: org.id,
                source: client_1.LeadSource.meta_leadgen,
                sourceDetails: {
                    metaLeadgenId: leadgenId,
                    metaFormId: formId || metaLeadData.form_id,
                    metaPageId: pageId,
                    metaAdId: adId || metaLeadData.ad_id,
                    metaAdName: metaLeadData.ad_name,
                    metaCampaignId: metaLeadData.campaign_id,
                    metaCampaignName: leadData.campaign_name,
                    metaCreatedTime: metaLeadData.created_time
                }
            };
            const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('./duplicateLeadService')));
            const duplicateCheck = await DuplicateLeadService.checkDuplicate(crmData.phone, crmData.email, org.id, targetBranchId || undefined);
            if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                console.log(`[MetaLeadService] Duplicate found (${duplicateCheck.existingLead.id}). Re-enquiry.`);
                await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, crmData, org.id);
                return;
            }
            // 7. Create Lead (Unassigned initially, then assign via rules)
            const lead = await prisma_1.default.lead.create({
                data: {
                    ...crmData,
                    branchId: targetBranchId
                }
            });
            console.log(`[MetaLeadService] Created lead ${lead.id} from Meta. Running strict distribution...`);
            // 8. Run Distribution Service (Strict Campaign Rules)
            await distributionService_1.DistributionService.assignLead(lead, org.id);
            // 8. Notify
            try {
                const admins = await prisma_1.default.user.findMany({
                    where: { organisationId: org.id, role: { in: ['admin', 'super_admin'] }, isActive: true },
                    select: { id: true }
                });
                for (const admin of admins) {
                    await notificationService_1.NotificationService.send(admin.id, 'New Meta Lead', `New lead: ${crmData.firstName}`, 'info');
                }
            }
            catch (notifyErr) {
                console.warn('[MetaLeadService] Notification failed');
            }
        }
        catch (error) {
            console.error('[MetaLeadService] Error:', error.response?.data || error.message);
            throw error;
        }
    }
};
exports.default = exports.MetaLeadService;
