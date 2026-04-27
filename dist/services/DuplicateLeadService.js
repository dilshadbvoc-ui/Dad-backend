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
exports.DuplicateLeadService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
exports.DuplicateLeadService = {
    /**
     * Check for duplicate leads by phone, email, or WhatsApp
     * IMPORTANT: Only considers it a duplicate if the lead is in the SAME branch
     * Same lead in different branches = NEW lead (not a re-enquiry)
     */
    async checkDuplicate(phone, email, organisationId, branchId, includeAllBranches = false // Default to false: isolate by branch
    ) {
        try {
            // Sanitize phone
            const cleanPhone = phone.toString().replace(/\D/g, '');
            // Build OR conditions for duplicate check
            const conditions = [
                { phone: cleanPhone },
                { secondaryPhone: cleanPhone }
            ];
            // Explicit Indian number normalization (91 prefix handling)
            // If 12 digits starting with 91, add the 10-digit version
            if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
                const tenDigit = cleanPhone.substring(2);
                conditions.push({ phone: tenDigit });
                conditions.push({ secondaryPhone: tenDigit });
            }
            // If 10 digits, add the 91-prefixed version
            else if (cleanPhone.length === 10) {
                const twelveDigit = '91' + cleanPhone;
                conditions.push({ phone: twelveDigit });
                conditions.push({ secondaryPhone: twelveDigit });
            }
            // Handle international variations using libphonenumber-js
            const { parsePhoneNumberFromString } = await Promise.resolve().then(() => __importStar(require('libphonenumber-js')));
            // Try to parse the phone number to handle international matches
            let phoneToParse = phone.toString().trim();
            if (!phoneToParse.startsWith('+')) {
                phoneToParse = `+${cleanPhone}`; // Assume digits include country code if no plus
            }
            const phoneNumber = parsePhoneNumberFromString(phoneToParse);
            if (phoneNumber) {
                const e164NoPlus = phoneNumber.format('E.164').replace('+', '');
                const national = phoneNumber.nationalNumber.toString();
                // Add E.164 version if different
                if (e164NoPlus !== cleanPhone) {
                    conditions.push({ phone: e164NoPlus });
                    conditions.push({ secondaryPhone: e164NoPlus });
                }
                // Add National version if different
                if (national !== cleanPhone && national !== e164NoPlus) {
                    conditions.push({ phone: national });
                    conditions.push({ secondaryPhone: national });
                }
            }
            if (email) {
                conditions.push({ email, organisationId });
            }
            const where = {
                OR: conditions,
                isDeleted: false,
                organisationId
            };
            // BRANCH ISOLATION LOGIC:
            // 1. If includeAllBranches is true, we look everywhere in the org.
            // 2. If branchId is null/undefined, we ALSO look everywhere in the org 
            //    to prevent creating a "global" duplicate of a branch-specific lead.
            // 3. If branchId is provided, we strictly isolate to that branch (the default CRM behavior).
            if (includeAllBranches || !branchId) {
                // No branch filter added to 'where', so it searches organisation-wide
            }
            else {
                where.branchId = branchId;
            }
            console.log('[DuplicateLeadService] Checking duplicate with:', {
                phone: cleanPhone,
                email,
                organisationId,
                branchId,
                includeAllBranches,
                where
            });
            // Check for existing lead IN THE SAME BRANCH
            const existingLead = await prisma_1.default.lead.findFirst({
                where,
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    },
                    branch: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
            if (existingLead) {
                // Determine what matched
                let matchedBy = 'phone';
                if (email && existingLead.email === email) {
                    matchedBy = 'email';
                }
                else if (existingLead.phone === cleanPhone) {
                    matchedBy = 'phone';
                }
                console.log('[DuplicateLeadService] Duplicate found:', {
                    leadId: existingLead.id,
                    branch: existingLead.branch?.name,
                    matchedBy
                });
                return {
                    isDuplicate: true,
                    existingLead,
                    matchedBy
                };
            }
            console.log('[DuplicateLeadService] No duplicate found in same branch');
            return { isDuplicate: false };
        }
        catch (error) {
            console.error('[DuplicateLeadService] Error checking duplicate:', error);
            throw error;
        }
    },
    /**
     * Handle re-enquiry: Update existing lead and notify owner/manager
     */
    async handleReEnquiry(existingLead, newData, organisationId) {
        try {
            const now = new Date();
            // Update existing lead
            const updatedLead = await prisma_1.default.lead.update({
                where: { id: existingLead.id },
                data: {
                    status: (newData.stage && (!existingLead.status || ['new', 're_enquiry'].includes(existingLead.status.toLowerCase())))
                        ? newData.stage.toLowerCase()
                        : 're_enquiry',
                    stage: newData.stage || existingLead.stage,
                    isReEnquiry: true,
                    isDeleted: false, // Restore if it was deleted
                    reEnquiryCount: { increment: 1 },
                    lastEnquiryDate: now,
                    enquiryAbout: newData.sourceDetails?.message || existingLead.enquiryAbout,
                    // Update source details to track re-enquiry
                    sourceDetails: {
                        ...(existingLead.sourceDetails || {}),
                        reEnquiries: [
                            ...(existingLead.sourceDetails?.reEnquiries || []),
                            {
                                date: now.toISOString(),
                                source: newData.source,
                                details: newData.sourceDetails
                            }
                        ]
                    }
                },
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            reportsToId: true
                        }
                    }
                }
            });
            // Create interaction record for timeline
            await prisma_1.default.interaction.create({
                data: {
                    type: 'other',
                    direction: 'inbound',
                    subject: 'Re-Enquiry Received',
                    description: `Lead ${existingLead.firstName} ${existingLead.lastName} has enquired again. This is re-enquiry #${updatedLead.reEnquiryCount}. Previous status: ${existingLead.status}`,
                    date: now,
                    leadId: existingLead.id,
                    createdById: existingLead.assignedToId,
                    organisationId
                }
            });
            // Log in LeadHistory for ownership history timeline
            await prisma_1.default.leadHistory.create({
                data: {
                    leadId: existingLead.id,
                    reason: `Re-Enquiry received from ${newData.source || 'Website'}`,
                    fieldName: 'status',
                    oldValue: existingLead.status,
                    newValue: 're_enquiry',
                    createdAt: now
                }
            });
            // Notify the assigned owner
            if (updatedLead.assignedToId) {
                await this.notifyOwner(updatedLead, organisationId);
            }
            // Notify the manager if exists
            const managerId = updatedLead.assignedTo?.reportsToId;
            if (managerId) {
                await this.notifyManager(updatedLead, managerId, organisationId);
            }
            console.log(`[DuplicateLeadService] Re-enquiry handled for lead ${existingLead.id}`);
            return updatedLead;
        }
        catch (error) {
            console.error('[DuplicateLeadService] Error handling re-enquiry:', error);
            throw error;
        }
    },
    /**
     * Notify lead owner about re-enquiry
     */
    async notifyOwner(lead, organisationId) {
        try {
            const { NotificationService } = await Promise.resolve().then(() => __importStar(require('./notificationService')));
            const ownerId = lead.assignedToId || lead.assignedTo?.id;
            if (!ownerId) {
                console.log(`[DuplicateLeadService] No owner to notify for lead ${lead.id}`);
                return;
            }
            await NotificationService.send(ownerId, 'Re-Enquiry Alert', `🔄 ${lead.firstName} ${lead.lastName} has enquired again! This is their ${lead.reEnquiryCount}${this.getOrdinalSuffix(lead.reEnquiryCount)} enquiry. The lead is still interested - follow up immediately.`, 'warning');
            console.log(`[DuplicateLeadService] Owner notified for lead ${lead.id}`);
        }
        catch (error) {
            console.error('[DuplicateLeadService] Error notifying owner:', error);
        }
    },
    /**
     * Notify manager about re-enquiry
     */
    async notifyManager(lead, managerId, organisationId) {
        try {
            const { NotificationService } = await Promise.resolve().then(() => __importStar(require('./notificationService')));
            const ownerName = lead.assignedTo
                ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`
                : 'Unknown';
            await NotificationService.send(managerId, 'Team Re-Enquiry Alert', `🔄 Re-enquiry detected: ${lead.firstName} ${lead.lastName} (assigned to ${ownerName}) has enquired again. Re-enquiry count: ${lead.reEnquiryCount}`, 'info');
            console.log(`[DuplicateLeadService] Manager notified for lead ${lead.id}`);
        }
        catch (error) {
            console.error('[DuplicateLeadService] Error notifying manager:', error);
        }
    },
    /**
     * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
     */
    getOrdinalSuffix(num) {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11)
            return 'st';
        if (j === 2 && k !== 12)
            return 'nd';
        if (j === 3 && k !== 13)
            return 'rd';
        return 'th';
    },
    /**
     * Find all potential duplicates in the system
     */
    async findDuplicates(organisationId) {
        try {
            // Find leads with duplicate phone numbers
            const duplicatesByPhone = await prisma_1.default.$queryRaw `
                SELECT phone, COUNT(*) as count, 
                       array_agg(id) as lead_ids,
                       array_agg("firstName" || ' ' || "lastName") as names
                FROM "Lead"
                WHERE "organisationId" = ${organisationId}
                  AND "isDeleted" = false
                GROUP BY phone
                HAVING COUNT(*) > 1
            `;
            // Find leads with duplicate emails
            const duplicatesByEmail = await prisma_1.default.$queryRaw `
                SELECT email, COUNT(*) as count,
                       array_agg(id) as lead_ids,
                       array_agg("firstName" || ' ' || "lastName") as names
                FROM "Lead"
                WHERE "organisationId" = ${organisationId}
                  AND "isDeleted" = false
                  AND email IS NOT NULL
                GROUP BY email
                HAVING COUNT(*) > 1
            `;
            return [
                ...duplicatesByPhone.map(d => ({ ...d, type: 'phone' })),
                ...duplicatesByEmail.map(d => ({ ...d, type: 'email' }))
            ];
        }
        catch (error) {
            console.error('[DuplicateLeadService] Error finding duplicates:', error);
            return [];
        }
    },
    /**
     * Get re-enquiry leads for an organization
     */
    async getReEnquiryLeads(organisationId, limit = 50) {
        try {
            const reEnquiryLeads = await prisma_1.default.lead.findMany({
                where: {
                    organisationId,
                    isDeleted: false,
                    isReEnquiry: true
                },
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    }
                },
                orderBy: {
                    lastEnquiryDate: 'desc'
                },
                take: limit
            });
            return reEnquiryLeads;
        }
        catch (error) {
            console.error('[DuplicateLeadService] Error getting re-enquiry leads:', error);
            return [];
        }
    }
};
exports.default = exports.DuplicateLeadService;
