"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContact = exports.updateContact = exports.getContactById = exports.createContact = exports.getContacts = void 0;
const prisma_1 = __importDefault(require("../config/prisma")); // Use the configured instance with adapter
const hierarchyUtils_1 = require("../utils/hierarchyUtils"); // Use existing utils
// GET /api/contacts
const getContacts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = req.user;
        const where = {};
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
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // In Prisma: ownerId IN [...]
            where.ownerId = { in: subordinateIds };
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
        const count = yield prisma_1.default.contact.count({ where });
        const contacts = yield prisma_1.default.contact.findMany({
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
});
exports.getContacts = getContacts;
// POST /api/contacts
const createContact = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        if (email) {
            const existingContact = yield prisma_1.default.contact.findFirst({
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
        };
        if (req.body.account) {
            // Can be accountId string
            contactData.account = { connect: { id: req.body.account } };
        }
        const contact = yield prisma_1.default.contact.create({
            data: contactData
        });
        res.status(201).json(contact);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createContact = createContact;
const getContactById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const contact = yield prisma_1.default.contact.findUnique({
            where: { id: req.params.id },
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
});
exports.getContactById = getContactById;
const updateContact = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const updates = Object.assign({}, req.body);
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
        const contact = yield prisma_1.default.contact.update({
            where: { id: contactId },
            data: updates,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, email: true } }
            }
        });
        res.json(contact);
    }
    catch (error) {
        // Prisma error handling (e.g. RecordNotFound)
        res.status(400).json({ message: error.message });
    }
});
exports.updateContact = updateContact;
const deleteContact = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.contact.delete({
            where: { id: req.params.id }
        });
        res.json({ message: 'Contact deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteContact = deleteContact;
