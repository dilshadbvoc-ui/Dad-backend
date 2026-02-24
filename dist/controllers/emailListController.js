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
exports.deleteEmailList = exports.getEmailListById = exports.createEmailList = exports.getEmailLists = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getEmailLists = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(403).json({ message: 'User not associated with an organisation' });
        // Strict Organisation Scoping
        const where = {
            isDeleted: false,
            organisationId: orgId
        };
        // If super_admin allows override? 
        if (user.role === 'super_admin' && req.query.organisationId) {
            where.organisationId = String(req.query.organisationId);
        }
        const lists = await prisma_1.default.emailList.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json(lists);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEmailLists = getEmailLists;
const createEmailList = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const list = await prisma_1.default.emailList.create({
            data: {
                name: req.body.name,
                description: req.body.description,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_EMAIL_LIST',
                entity: 'EmailList',
                entityId: list.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: list.name }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(list);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createEmailList = createEmailList;
const getEmailListById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
        }
        const list = await prisma_1.default.emailList.findFirst({
            where
        });
        if (!list)
            return res.status(404).json({ message: 'List not found' });
        res.json(list);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEmailListById = getEmailListById;
const deleteEmailList = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const list = await prisma_1.default.emailList.update({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: { isDeleted: true }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'DELETE_EMAIL_LIST',
                entity: 'EmailList',
                entityId: req.params.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: list.name }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'List deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteEmailList = deleteEmailList;
//# sourceMappingURL=emailListController.js.map