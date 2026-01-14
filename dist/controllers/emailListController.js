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
exports.deleteEmailList = exports.getEmailListById = exports.createEmailList = exports.getEmailLists = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getEmailLists = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const lists = yield prisma_1.default.emailList.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json(lists);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getEmailLists = getEmailLists;
const createEmailList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const list = yield prisma_1.default.emailList.create({
            data: {
                name: req.body.name,
                description: req.body.description,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        res.status(201).json(list);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createEmailList = createEmailList;
const getEmailListById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const list = yield prisma_1.default.emailList.findFirst({
            where: { id: req.params.id, isDeleted: false }
        });
        if (!list)
            return res.status(404).json({ message: 'List not found' });
        res.json(list);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getEmailListById = getEmailListById;
const deleteEmailList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.emailList.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'List deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteEmailList = deleteEmailList;
