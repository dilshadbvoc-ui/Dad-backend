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
            // Try matching valid accounts in metaAccounts array or legacy meta object
            let org = await prisma_1.default.organisation.findFirst({
                where: {
                    isDeleted: false,
                    OR: [
                        { integrations: { path: ['meta', 'pageId'], equals: pageId } },
                    ]
                }
            });
            // If not found via primary, scan metaAccounts array
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
                console.error(`[MetaLeadService] No organisation found with Meta Page ID: ${pageId}. Ensure the Page is connected in Settings.`);
                return;
            }
            // Extract the correct account config
            const integrations = org.integrations || {};
            const accounts = [...(integrations.metaAccounts || [])];
            if (integrations.meta)
                accounts.push(integrations.meta);
            const matchedAccount = accounts.find((acc) => acc.pageId === pageId);
            if (!matchedAccount || !matchedAccount.accessToken) {
                console.error(`[MetaLeadService] Organisation ${org.id} has no Access Token for Page ${pageId}`);
                return;
            }
            const metaConfig = matchedAccount;
            const accessToken = (0, encryption_1.decrypt)(metaConfig.accessToken);
            // 2. Fetch Lead details from Meta Graph API
            const response = await axios_1.default.get(`https://graph.facebook.com/${META_API_VERSION}/${leadgenId}`, {
                params: { access_token: accessToken }
            });
            const metaLeadData = response.data;
            if (!metaLeadData || !metaLeadData.field_data) {
                console.error(`[MetaLeadService] No field data found for lead ${leadgenId}`);
                return;
            }
            // 3. Map Meta field_data to CRM fields with better coverage
            const fieldMap = {};
            metaLeadData.field_data.forEach((field) => {
                if (field.values && field.values.length > 0) {
                    fieldMap[field.name.toLowerCase()] = field.values[0];
                }
            });
            // Extract country information from Meta lead
            const { GeoLocationService } = await Promise.resolve().then(() => __importStar(require('./geoLocationService')));
            const geoData = GeoLocationService.extractCountryFromMetaLead(fieldMap);
            // Helper to get field with multiple possible keys
            const getField = (keys) => {
                for (const key of keys) {
                    if (fieldMap[key])
                        return fieldMap[key];
                }
                return null;
            };
            // Resolve Status from Org Settings
            let leadStatus = "new";
            if (org.leadStatuses && Array.isArray(org.leadStatuses)) {
                const statuses = org.leadStatuses;
                const configuredDefault = statuses.find((s) => s.isDefault);
                if (configuredDefault) {
                    leadStatus = configuredDefault.id;
                }
            }
            const crmData = {
                firstName: getField(['first_name', 'firstname', 'first name', 'fname']) ||
                    fieldMap.full_name?.split(' ')[0] || 'Meta',
                lastName: getField(['last_name', 'lastname', 'last name', 'lname']) ||
                    fieldMap.full_name?.split(' ').slice(1).join(' ') || 'Lead',
                email: getField(['email', 'email_address', 'e-mail']),
                phone: getField(['phone_number', 'phone', 'mobile_number', 'mobile_phone', 'contact_number']) || '',
                company: getField(['company_name', 'company', 'organization', 'organisation']),
                jobTitle: getField(['job_title', 'position', 'designation']),
                country: geoData?.country || getField(['country', 'location']),
                countryCode: geoData?.countryCode || null,
                phoneCountryCode: geoData?.phoneCountryCode || null,
                source: client_1.LeadSource.meta_leadgen,
                sourceDetails: {
                    metaLeadgenId: leadgenId,
                    metaFormId: formId,
                    metaAdId: adId,
                    rawMetaFields: fieldMap,
                    metaCreatedTime: metaLeadData.created_time
                },
                status: leadStatus,
                organisationId: org.id,
                branchId: metaConfig.branchId || null
            };
            // 4. Sanitize Phone Number
            if (crmData.phone) {
                crmData.phone = crmData.phone.toString().replace(/\D/g, '');
                if (crmData.phone.length > 10) {
                    crmData.phone = crmData.phone.slice(-10);
                }
            }
            // 5. Check for duplicate (by phone and org)
            const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('./duplicateLeadService')));
            const duplicateCheck = await DuplicateLeadService.checkDuplicate(crmData.phone, crmData.email, org.id);
            if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                console.log(`[MetaLeadService] Duplicate lead detected (${duplicateCheck.existingLead.id}). Handling as re-enquiry.`);
                await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, {
                    firstName: crmData.firstName,
                    lastName: crmData.lastName,
                    email: crmData.email,
                    phone: crmData.phone,
                    company: crmData.company,
                    source: 'meta_leadgen',
                    sourceDetails: crmData.sourceDetails
                }, org.id);
                return;
            }
            // 6. Create the Lead
            const lead = await prisma_1.default.lead.create({
                data: crmData
            });
            console.log(`[MetaLeadService] Successfully created lead ${lead.id} from Meta`);
            // 8. Create Notification for Sales/Admin
            try {
                const admins = await prisma_1.default.user.findMany({
                    where: {
                        organisationId: org.id,
                        role: { in: ['admin', 'super_admin'] },
                        isActive: true
                    },
                    select: { id: true }
                });
                for (const admin of admins) {
                    await notificationService_1.NotificationService.send(admin.id, 'New Meta Lead', `New lead received: ${crmData.firstName} ${crmData.lastName}`, 'info');
                }
            }
            catch (notifyErr) {
                console.warn('[MetaLeadService] Notification failed:', notifyErr);
            }
        }
        catch (error) {
            console.error('[MetaLeadService] Error processing Meta lead:', error.response?.data || error.message);
            throw error;
        }
    }
};
exports.default = exports.MetaLeadService;
