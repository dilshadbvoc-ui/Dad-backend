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
exports.deleteContact = exports.updateContact = exports.getContactById = exports.createContact = exports.getContacts = void 0;
const prisma_1 = __importDefault(require("../config/prisma")); // Use the configured instance with adapter
const hierarchyUtils_1 = require("../utils/hierarchyUtils"); // Use existing utils
// GET /api/contacts
const getContacts = async (req, res) => {
    try {
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = req.user;
        const where = { isDeleted: false };
        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (orgId) {
                where.organisationId = orgId;
            }
            if (user.branchId) {
                where.branchId = user.branchId;
            }
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            // In Prisma: ownerId IN [...]
            where.ownerId = { in: visibleUserIds };
        }
        // Filter: Account
        if (req.query.account) {
            where.accountId = String(req.query.account);
        }
        // Filter: Search (OR condition)
        if (req.query.search) {
            const search = String(req.query.search);
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { jobTitle: { contains: search, mode: 'insensitive' } },
            ];
        }
        const count = await prisma_1.default.contact.count({ where });
        const contacts = await prisma_1.default.contact.findMany({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: 'desc' }
        });
        res.json({ contacts, page, pages: Math.ceil(count / pageSize), total: count });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getContacts = getContacts;
// POST /api/contacts
const createContact = async (req, res) => {
    try {
        const { email } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        // Limit Check
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId },
            select: { contactLimit: true }
        });
        if (org && org.contactLimit > 0) {
            const count = await prisma_1.default.contact.count({
                where: { organisationId: orgId, isDeleted: false }
            });
            if (count >= org.contactLimit) {
                return res.status(403).json({
                    message: `Contact limit reached (${org.contactLimit}). Please upgrade your plan.`,
                    code: 'LIMIT_EXCEEDED',
                    limit: org.contactLimit
                });
            }
        }
        if (email) {
            const existingContact = await prisma_1.default.contact.findFirst({
                where: {
                    email: email,
                    organisationId: orgId
                }
            });
            if (existingContact) {
                return res.status(409).json({ message: 'Contact with this email already exists' });
            }
        }
        const contactData = {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email,
            phones: req.body.phones,
            jobTitle: req.body.jobTitle,
            department: req.body.department,
            address: req.body.address,
            socialProfiles: req.body.socialProfiles,
            customFields: req.body.customFields,
            tags: req.body.tags,
            // Relations
            organisation: { connect: { id: orgId } },
            owner: req.body.owner ? { connect: { id: req.body.owner } } : { connect: { id: user.id } },
            branch: user.branchId ? { connect: { id: user.branchId } } : (req.body.branchId ? { connect: { id: req.body.branchId } } : undefined),
        };
        if (req.body.account) {
            // Can be accountId string
            contactData.account = { connect: { id: req.body.account } };
        }
        // Custom Field Validation
        if (req.body.customFields) {
            const { CustomFieldValidationService } = await Promise.resolve().then(() => __importStar(require('../services/customFieldValidationService')));
            await CustomFieldValidationService.validateFields('Contact', orgId, req.body.customFields);
        }
        const contact = await prisma_1.default.contact.create({
            data: contactData
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_CONTACT',
                entity: 'Contact',
                entityId: contact.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: `${contact.firstName} ${contact.lastName}` }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(contact);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createContact = createContact;
const getContactById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId)
                where.branchId = user.branchId;
        }
        const contact = await prisma_1.default.contact.findFirst({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
            }
        });
        if (!contact)
            return res.status(404).json({ message: 'Contact not found' });
        res.json(contact);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getContactById = getContactById;
const updateContact = async (req, res) => {
    try {
        const updates = { ...req.body };
        const contactId = req.params.id;
        // Handle Relation Updates if IDs are passed as strings
        if (updates.account && typeof updates.account === 'string') {
            updates.account = { connect: { id: updates.account } };
        }
        if (updates.owner && typeof updates.owner === 'string') {
            updates.owner = { connect: { id: updates.owner } };
        }
        // Remove helper fields that might confusing Prisma if they are not in schema as scalars?
        // Actually Prisma update accepts `account: { connect: ... }`. 
        // If updates.account is "ID_STRING", passing it as `account: "ID_STRING"` to Prisma Update will fail.
        // So the remapping above is correct.
        // Fetch first to get Org ID for validation
        const currentContact = await prisma_1.default.contact.findUnique({ where: { id: contactId } });
        if (!currentContact)
            return res.status(404).json({ message: 'Contact not found' });
        if (updates.customFields) {
            const { CustomFieldValidationService } = await Promise.resolve().then(() => __importStar(require('../services/customFieldValidationService')));
            await CustomFieldValidationService.validateFields('Contact', currentContact.organisationId, updates.customFields);
        }
        const requester = req.user;
        const whereObj = { id: contactId };
        if (requester.role !== 'super_admin') {
            const orgId = (0, hierarchyUtils_1.getOrgId)(requester);
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            whereObj.organisationId = orgId;
            if (requester.branchId)
                whereObj.branchId = requester.branchId;
        }
        const contact = await prisma_1.default.contact.update({
            where: whereObj,
            data: updates,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
            }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'UPDATE_CONTACT',
                entity: 'Contact',
                entityId: contactId,
                actorId: requester.id,
                organisationId: contact.organisationId,
                details: { name: `${contact.firstName} ${contact.lastName}`, updatedFields: Object.keys(updates) }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json(contact);
    }
    catch (error) {
        // Prisma error handling (e.g. RecordNotFound)
        res.status(400).json({ message: error.message });
    }
};
exports.updateContact = updateContact;
const deleteContact = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }
        await prisma_1.default.contact.update({
            where,
            data: { isDeleted: true, deletedAt: new Date() }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            const contact = await prisma_1.default.contact.findUnique({ where: { id: req.params.id } });
            if (contact) {
                logAudit({
                    action: 'DELETE_CONTACT',
                    entity: 'Contact',
                    entityId: contact.id,
                    actorId: user.id,
                    organisationId: contact.organisationId,
                    details: { name: `${contact.firstName} ${contact.lastName}` }
                });
            }
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'Contact deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteContact = deleteContact;
