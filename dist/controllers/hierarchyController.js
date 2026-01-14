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
exports.updateReportsTo = exports.getHierarchy = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getHierarchy = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { isActive: true };
        if (orgId) {
            where.organisationId = orgId;
        }
        const users = yield prisma_1.default.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                position: true,
                reportsToId: true,
                reportsTo: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        // Build hierarchy tree
        const userMap = new Map();
        users.forEach(u => userMap.set(u.id, Object.assign(Object.assign({}, u), { children: [] })));
        const roots = [];
        users.forEach(u => {
            const userNode = userMap.get(u.id);
            if (u.reportsToId) {
                const parent = userMap.get(u.reportsToId);
                if (parent) {
                    parent.children.push(userNode);
                }
                else {
                    roots.push(userNode);
                }
            }
            else {
                roots.push(userNode);
            }
        });
        res.json({ hierarchy: roots, users });
    }
    catch (error) {
        console.error('getHierarchy Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.getHierarchy = getHierarchy;
const updateReportsTo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { reportsTo } = req.body;
        const userId = req.params.id;
        const user = yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                reportsTo: reportsTo ? { connect: { id: reportsTo } } : { disconnect: true }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                position: true,
                reportsToId: true,
                reportsTo: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        res.json(user);
    }
    catch (error) {
        console.error('updateReportsTo Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.updateReportsTo = updateReportsTo;
