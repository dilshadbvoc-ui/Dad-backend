"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
class TaskService {
    static async createTask(data) {
        const { organisationId, createdById, assignedToId, leadId, contactId, accountId, opportunityId, branchId, ...rest } = data;
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
        if (branchId)
            createData.branch = { connect: { id: branchId } };
        return await prisma_1.default.task.create({
            data: createData
        });
    }
}
exports.TaskService = TaskService;
