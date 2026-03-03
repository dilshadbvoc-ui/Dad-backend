"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const logAudit = async (params) => {
    try {
        await prisma_1.default.auditLog.create({
            data: {
                action: params.action,
                entity: params.entity,
                entityId: params.entityId,
                actorId: params.actorId,
                organisationId: params.organisationId,
                details: params.details || {},
                ipAddress: params.ipAddress,
                userAgent: params.userAgent
            }
        });
    }
    catch (error) {
        // Audit logging should not block main execution flow, so we just log the error
        console.error('Failed to create audit log:', error);
    }
};
exports.logAudit = logAudit;
