"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
class TaskService {
    static async createTask(data) {
        const { organisationId, createdById, assignedToId, leadId, contactId, accountId, opportunityId, ...rest } = data;
        const createData = {
            ...rest,
            organisation: { connect: { id: organisationId } },
        };
        if (createdById)
            createData.createdBy = { connect: { id: createdById } };
        if (assignedToId)
            createData.assignedTo = { connect: { id: assignedToId } };
        if (leadId)
            createData.lead = { connect: { id: leadId } };
        if (contactId)
            createData.contact = { connect: { id: contactId } };
        if (accountId)
            createData.account = { connect: { id: accountId } };
        if (opportunityId)
            createData.opportunity = { connect: { id: opportunityId } };
        return await prisma_1.default.task.create({
            data: createData
        });
    }
    static async syncLeadFollowUp(leadId) {
        if (!leadId)
            return;
        // Find the earliest upcoming task that isn't completed and has a due date
        const nextTask = await prisma_1.default.task.findFirst({
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
        await prisma_1.default.lead.update({
            where: { id: leadId },
            data: {
                nextFollowUp: nextTask ? nextTask.dueDate : null
            }
        });
    }
    static async rolloverTaskForLead(leadId, newDate) {
        if (!leadId)
            return;
        // Find the earliest non-completed task for this lead
        const task = await prisma_1.default.task.findFirst({
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
            await prisma_1.default.task.update({
                where: { id: task.id },
                data: { dueDate: newDate }
            });
            console.log(`[TaskService] Rolled over task ${task.id} for lead ${leadId} to ${newDate.toISOString()}`);
        }
    }
    static async rescheduleOrCreateFollowUp(data) {
        const { leadId, branchId, organisationId, dueDate, ...rest } = data;
        // Find existing non-terminal task for this lead in this branch
        // We consider ANY incomplete task for this lead as the "current follow-up"
        const existingTask = await prisma_1.default.task.findFirst({
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
            const updateData = {
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
            return await prisma_1.default.task.update({
                where: { id: existingTask.id },
                data: updateData
            });
        }
        else {
            console.log(`[TaskService] Creating new follow-up for lead ${leadId}`);
            return await this.createTask(data);
        }
    }
}
exports.TaskService = TaskService;
