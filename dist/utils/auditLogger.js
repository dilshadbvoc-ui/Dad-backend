"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logExportAudit = exports.logAudit = exports.AuditEntity = exports.AuditAction = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["RESTORE"] = "RESTORE";
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["LOGIN_FAILED"] = "LOGIN_FAILED";
    AuditAction["EXPORT"] = "EXPORT";
    AuditAction["VIEW_SENSITIVE"] = "VIEW_SENSITIVE";
    AuditAction["SETTINGS_CHANGE"] = "SETTINGS_CHANGE";
    AuditAction["LEAD_STATUS_CHANGE"] = "LEAD_STATUS_CHANGE";
    AuditAction["LEAD_ASSIGNED"] = "LEAD_ASSIGNED";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
var AuditEntity;
(function (AuditEntity) {
    AuditEntity["LEAD"] = "Lead";
    AuditEntity["CONTACT"] = "Contact";
    AuditEntity["USER"] = "User";
    AuditEntity["ORGANISATION"] = "Organisation";
    AuditEntity["REPORT"] = "Report";
    AuditEntity["SETTINGS"] = "Settings";
    AuditEntity["AUTH"] = "Auth";
    AuditEntity["INTEGRATION"] = "Integration";
})(AuditEntity || (exports.AuditEntity = AuditEntity = {}));
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
/**
 * Specifically log data export actions (PDF, CSV, etc)
 */
const logExportAudit = async (req, reportName, metadata) => {
    const user = req.user;
    if (!user)
        return;
    await (0, exports.logAudit)({
        action: AuditAction.EXPORT,
        entity: AuditEntity.REPORT,
        actorId: user.id,
        organisationId: user.organisationId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: {
            reportName,
            ...metadata
        }
    });
};
exports.logExportAudit = logExportAudit;
