import prisma from '../config/prisma';
import { LeadStatus } from '../generated/client';

interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingLead?: any;
    matchedBy?: 'phone' | 'email' | 'whatsapp';
}

interface ReEnquiryData {
    firstName: string;
    lastName: string;
    email?: string;
    phone: string;
    company?: string;
    source?: string;
    sourceDetails?: any;
}

export const DuplicateLeadService = {
    /**
     * Check for duplicate leads by phone, email, or WhatsApp
     */
    async checkDuplicate(
        phone: string,
        email: string | null | undefined,
        organisationId: string
    ): Promise<DuplicateCheckResult> {
        try {
            // Sanitize phone
            const cleanPhone = phone.toString().replace(/\D/g, '');

            // Build OR conditions for duplicate check
            const conditions: any[] = [
                { phone: cleanPhone, organisationId }
            ];

            if (email) {
                conditions.push({ email, organisationId });
            }

            // Check for existing lead
            const existingLead = await prisma.lead.findFirst({
                where: {
                    OR: conditions,
                    isDeleted: false
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
                }
            });

            if (existingLead) {
                // Determine what matched
                let matchedBy: 'phone' | 'email' | 'whatsapp' = 'phone';
                if (email && existingLead.email === email) {
                    matchedBy = 'email';
                } else if (existingLead.phone === cleanPhone) {
                    matchedBy = 'phone';
                }

                return {
                    isDuplicate: true,
                    existingLead,
                    matchedBy
                };
            }

            return { isDuplicate: false };
        } catch (error) {
            console.error('[DuplicateLeadService] Error checking duplicate:', error);
            throw error;
        }
    },

    /**
     * Handle re-enquiry: Update existing lead and notify owner/manager
     */
    async handleReEnquiry(
        existingLead: any,
        newData: ReEnquiryData,
        organisationId: string
    ): Promise<any> {
        try {
            const now = new Date();

            // Update existing lead
            const updatedLead = await prisma.lead.update({
                where: { id: existingLead.id },
                data: {
                    status: LeadStatus.re_enquiry,
                    isReEnquiry: true,
                    reEnquiryCount: { increment: 1 },
                    lastEnquiryDate: now,
                    // Update source details to track re-enquiry
                    sourceDetails: {
                        ...(existingLead.sourceDetails as any || {}),
                        reEnquiries: [
                            ...((existingLead.sourceDetails as any)?.reEnquiries || []),
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
            await prisma.interaction.create({
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
        } catch (error) {
            console.error('[DuplicateLeadService] Error handling re-enquiry:', error);
            throw error;
        }
    },

    /**
     * Notify lead owner about re-enquiry
     */
    async notifyOwner(lead: any, organisationId: string): Promise<void> {
        try {
            const { NotificationService } = await import('./NotificationService');
            
            const ownerId = lead.assignedToId || lead.assignedTo?.id;
            if (!ownerId) {
                console.log(`[DuplicateLeadService] No owner to notify for lead ${lead.id}`);
                return;
            }
            
            await NotificationService.send(
                ownerId,
                'Re-Enquiry Alert',
                `🔄 ${lead.firstName} ${lead.lastName} has enquired again! This is their ${lead.reEnquiryCount}${this.getOrdinalSuffix(lead.reEnquiryCount)} enquiry. The lead is still interested - follow up immediately.`,
                'warning'
            );

            console.log(`[DuplicateLeadService] Owner notified for lead ${lead.id}`);
        } catch (error) {
            console.error('[DuplicateLeadService] Error notifying owner:', error);
        }
    },

    /**
     * Notify manager about re-enquiry
     */
    async notifyManager(lead: any, managerId: string, organisationId: string): Promise<void> {
        try {
            const { NotificationService } = await import('./NotificationService');
            
            const ownerName = lead.assignedTo 
                ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`
                : 'Unknown';
            
            await NotificationService.send(
                managerId,
                'Team Re-Enquiry Alert',
                `🔄 Re-enquiry detected: ${lead.firstName} ${lead.lastName} (assigned to ${ownerName}) has enquired again. Re-enquiry count: ${lead.reEnquiryCount}`,
                'info'
            );

            console.log(`[DuplicateLeadService] Manager notified for lead ${lead.id}`);
        } catch (error) {
            console.error('[DuplicateLeadService] Error notifying manager:', error);
        }
    },

    /**
     * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
     */
    getOrdinalSuffix(num: number): string {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11) return 'st';
        if (j === 2 && k !== 12) return 'nd';
        if (j === 3 && k !== 13) return 'rd';
        return 'th';
    },

    /**
     * Find all potential duplicates in the system
     */
    async findDuplicates(organisationId: string): Promise<any[]> {
        try {
            // Find leads with duplicate phone numbers
            const duplicatesByPhone = await prisma.$queryRaw<any[]>`
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
            const duplicatesByEmail = await prisma.$queryRaw<any[]>`
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
        } catch (error) {
            console.error('[DuplicateLeadService] Error finding duplicates:', error);
            return [];
        }
    },

    /**
     * Get re-enquiry leads for an organization
     */
    async getReEnquiryLeads(organisationId: string, limit = 50): Promise<any[]> {
        try {
            const reEnquiryLeads = await prisma.lead.findMany({
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
        } catch (error) {
            console.error('[DuplicateLeadService] Error getting re-enquiry leads:', error);
            return [];
        }
    }
};

export default DuplicateLeadService;
