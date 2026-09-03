import prisma from '../config/prisma';
import { Prisma } from '../generated/client';

export class FollowUpService {
    static async createFollowUp(data: {
        subject: string;
        description?: string;
        status?: any; // FollowUpStatus
        priority?: any; // FollowUpPriority
        dueDate: Date;
        organisationId: string;
        createdById?: string;
        leadId?: string;
        contactId?: string;
        accountId?: string;
        opportunityId?: string;
        assignedToId?: string;
        branchId?: string;
    }) {
        const { organisationId, createdById, assignedToId, leadId, contactId, accountId, opportunityId, branchId, ...rest } = data;

        const createData: Prisma.FollowUpCreateInput = {
            ...rest,
            organisation: organisationId ? { connect: { id: organisationId } } : undefined,
        };

        if (createdById) createData.createdBy = { connect: { id: createdById } };
        if (assignedToId) createData.assignedTo = { connect: { id: assignedToId } };
        if (leadId) createData.lead = { connect: { id: leadId } };
        if (contactId) createData.contact = { connect: { id: contactId } };
        if (accountId) createData.account = { connect: { id: accountId } };
        if (opportunityId) createData.opportunity = { connect: { id: opportunityId } };
        if (branchId) createData.branch = { connect: { id: branchId } };

        return await prisma.followUp.create({
            data: createData
        });
    }

    static async syncLeadFollowUp(leadId: string) {
        if (!leadId) return;

        // Find the earliest upcoming follow-up that isn't completed
        const nextFollowUp = await prisma.followUp.findFirst({
            where: {
                leadId,
                isDeleted: false,
                status: { notIn: ['completed', 'deferred'] }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        await prisma.lead.update({
            where: { id: leadId },
            data: {
                nextFollowUp: nextFollowUp ? nextFollowUp.dueDate : null
            }
        });
    }

    static async rescheduleOrCreateFollowUp(data: {
        subject: string;
        description?: string;
        status?: any;
        priority?: any;
        dueDate: Date;
        organisationId: string;
        createdById?: string;
        leadId: string;
        assignedToId?: string;
        branchId?: string | null;
    }) {
        const { leadId, branchId, organisationId, dueDate, ...rest } = data;

        let effectiveBranchId = branchId;
        if (!effectiveBranchId) {
            const lead = await prisma.lead.findUnique({
                where: { id: leadId },
                select: { branchId: true }
            });
            effectiveBranchId = lead?.branchId || null;
        }

        // Find existing non-terminal follow-up for this lead. Ordered by
        // `dueDate` ascending (the currently-active/soonest-due one), NOT
        // `createdAt` descending — a lead can end up with more than one
        // stale non-terminal row over time (each past reschedule/create
        // that didn't clean up after itself), and picking "most recently
        // created" is arbitrary: it can silently update a newer, unrelated
        // row while leaving the genuinely overdue one untouched forever.
        // Picking "soonest due" always targets the row that's actually
        // pending action right now.
        const existingFollowUp = await prisma.followUp.findFirst({
            where: {
                leadId,
                organisationId,
                isDeleted: false,
                status: { notIn: ['completed', 'deferred'] }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        if (existingFollowUp) {
            const updateData: Prisma.FollowUpUpdateInput = {
                subject: rest.subject,
                description: rest.description,
                status: rest.status || existingFollowUp.status,
                priority: rest.priority || existingFollowUp.priority,
                dueDate: dueDate,
                notifiedAt: null,
                branch: effectiveBranchId ? { connect: { id: effectiveBranchId } } : { disconnect: true }
            };

            if (rest.assignedToId) {
                updateData.assignedTo = { connect: { id: rest.assignedToId } };
            }

            return await prisma.followUp.update({
                where: { id: existingFollowUp.id },
                data: updateData
            });
        } else {
            return await this.createFollowUp({
                ...data,
                branchId: effectiveBranchId || undefined
            });
        }
    }

    static async rolloverFollowUpForLead(leadId: string, newDueDate: Date) {
        if (!leadId) return;

        // Find the earliest upcoming follow-up that isn't completed
        const overdueFollowUp = await prisma.followUp.findFirst({
            where: {
                leadId,
                isDeleted: false,
                status: { notIn: ['completed', 'deferred'] },
                dueDate: { lt: new Date() }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        if (overdueFollowUp) {
            await prisma.followUp.update({
                where: { id: overdueFollowUp.id },
                data: {
                    dueDate: newDueDate,
                    notifiedAt: null
                }
            });
        }
    }
}
