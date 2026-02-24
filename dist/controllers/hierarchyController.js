"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateReportsTo = exports.getHierarchy = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getHierarchy = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { isActive: true };
        if (orgId) {
            where.organisationId = orgId;
        }
        const users = await prisma_1.default.user.findMany({
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
        users.forEach(u => userMap.set(u.id, { ...u, children: [] }));
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
};
exports.getHierarchy = getHierarchy;
const updateReportsTo = async (req, res) => {
    try {
        const { reportsTo } = req.body;
        const userId = req.params.id;
        const user = await prisma_1.default.user.update({
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
};
exports.updateReportsTo = updateReportsTo;
//# sourceMappingURL=hierarchyController.js.map