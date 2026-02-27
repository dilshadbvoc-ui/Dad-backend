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
const client_1 = require("../generated/client");
exports.DuplicateLeadService = {
    /**
     * Check for duplicate leads by phone, email, or WhatsApp
     */
    async checkDuplicate(phone, email, organisationId, branchId) {
        try {
            // Sanitize phone
            const cleanPhone = phone.toString().replace(/\D/g, '');
            // Build OR conditions for duplicate check
            const conditions = [
                { phone: cleanPhone, organisationId }
            ];
            if (email) {
                conditions.push({ email, organisationId });
            }
            // If branchId is provided, duplicates must be in the same branch
            const where = {
                OR: conditions,
                isDeleted: false
            };
            if (branchId) {
                where.branchId = branchId;
            }
            // Check for existing lead
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
                return {
                    isDuplicate: true,
                    existingLead,
                    matchedBy
                };
            }
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
                    status: client_1.LeadStatus.re_enquiry,
                    isReEnquiry: true,
                    isDeleted: false, // Restore if it was deleted
                    reEnquiryCount: { increment: 1 },
                    lastEnquiryDate: now,
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
//# sourceMappingURL=duplicateLeadService.js.map