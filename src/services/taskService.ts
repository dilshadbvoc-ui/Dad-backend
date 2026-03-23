import prisma from '../config/prisma';
import { Prisma } from '../generated/client';

export class TaskService {
    static async createTask(data: {
        subject: string;
        description?: string;
        status?: any; // TaskStatus
        priority?: any; // TaskPriority
        dueDate?: Date;
        organisationId: string;
        createdById?: string;
        leadId?: string;
        contactId?: string;
        accountId?: string;
        opportunityId?: string;
        assignedToId?: string;
    }) {
        const { organisationId, createdById, assignedToId, leadId, contactId, accountId, opportunityId, ...rest } = data;

        const createData: Prisma.TaskCreateInput = {
            ...rest,
            organisation: { connect: { id: organisationId } },
        };

        if (createdById) createData.createdBy = { connect: { id: createdById } };
        if (assignedToId) createData.assignedTo = { connect: { id: assignedToId } };
        if (leadId) createData.lead = { connect: { id: leadId } };
        if (contactId) createData.contact = { connect: { id: contactId } };
        if (accountId) createData.account = { connect: { id: accountId } };
        if (opportunityId) createData.opportunity = { connect: { id: opportunityId } };

        return await prisma.task.create({
            data: createData
        });
    }

    static async syncLeadFollowUp(leadId: string) {
        if (!leadId) return;

        // Find the earliest upcoming task that isn't completed and has a due date
        const nextTask = await prisma.task.findFirst({
            where: {
                leadId,
                isDeleted: false,
                status: { notIn: ['completed', 'deferred'] },
                dueDate: { not: null }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        await prisma.lead.update({
            where: { id: leadId },
            data: {
                nextFollowUp: nextTask ? nextTask.dueDate : null
            }
        });
    }

    static async rolloverTaskForLead(leadId: string, newDate: Date) {
        if (!leadId) return;

        // Find the earliest non-completed task for this lead
        const task = await prisma.task.findFirst({
            where: {
                leadId,
                isDeleted: false,
                status: { notIn: ['completed', 'deferred'] }
            },
            orderBy: {
                dueDate: 'asc'
            }
        });

        if (task) {
            await prisma.task.update({
                where: { id: task.id },
                data: { dueDate: newDate }
            });
            console.log(`[TaskService] Rolled over task ${task.id} for lead ${leadId} to ${newDate.toISOString()}`);
        }
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
        branchId?: string;
    }) {
        const { leadId, branchId, organisationId, dueDate, ...rest } = data;

        // Find existing non-terminal task for this lead in this branch
        // We consider ANY incomplete task for this lead as the "current follow-up"
        const existingTask = await prisma.task.findFirst({
            where: {
                leadId,
                organisationId,
                branchId: branchId || undefined,
                isDeleted: false,
                status: { notIn: ['completed', 'deferred'] }
            }
        });

        if (existingTask) {
            console.log(`[TaskService] Rescheduling existing follow-up ${existingTask.id} for lead ${leadId}`);
            
            // Prepare update data
            const updateData: Prisma.TaskUpdateInput = {
                subject: rest.subject,
                description: rest.description,
                status: rest.status,
                priority: rest.priority,
                dueDate: dueDate,
                notifiedAt: null // Reset notification if rescheduled? Usually yes.
            };

            if (rest.assignedToId) {
                updateData.assignedTo = { connect: { id: rest.assignedToId } };
            }

            return await prisma.task.update({
                where: { id: existingTask.id },
                data: updateData
            });
        } else {
            console.log(`[TaskService] Creating new follow-up for lead ${leadId}`);
            return await this.createTask(data);
        }
    }
}
