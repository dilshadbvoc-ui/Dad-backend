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
}
