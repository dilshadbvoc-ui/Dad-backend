"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBranch = exports.updateBranch = exports.createBranch = exports.getBranches = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// GET /api/branches
const getBranches = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            if (user?.isSuperAdmin || user?.role === 'super_admin') {
                return res.json([]);
            }
            return res.status(403).json({ message: 'User has no organisation' });
        }
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            where.managerId = user.id;
        }
        const branches = await prisma_1.default.branch.findMany({
            where,
            include: {
                manager: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                _count: {
                    select: { users: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(branches);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getBranches = getBranches;
// POST /api/branches
const createBranch = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { name, location, contactEmail, contactPhone, managerId } = req.body;
        if (!orgId)
            return res.status(403).json({ message: 'User has no organisation' });
        // Only admins can create branches
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only admins can create branches' });
        }
        const branch = await prisma_1.default.branch.create({
            data: {
                name,
                location,
                contactEmail,
                contactPhone,
                managerId,
                organisationId: orgId
            }
        });
        res.status(201).json(branch);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createBranch = createBranch;
// PUT /api/branches/:id
const updateBranch = async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const { name, location, contactEmail, contactPhone, managerId } = req.body;
        // Check if user has access to this branch
        const branch = await prisma_1.default.branch.findUnique({ where: { id } });
        if (!branch)
            return res.status(404).json({ message: 'Branch not found' });
        // Only admins can update branches
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only admins can update branches' });
        }
        // Ensure branch belongs to user's org
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (branch.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const updatedBranch = await prisma_1.default.branch.update({
            where: { id },
            data: {
                name,
                location,
                contactEmail,
                contactPhone,
                managerId
            }
        });
        res.json(updatedBranch);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateBranch = updateBranch;
// DELETE /api/branches/:id
const deleteBranch = async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const branch = await prisma_1.default.branch.findUnique({ where: { id } });
        if (!branch)
            return res.status(404).json({ message: 'Branch not found' });
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only admins can delete branches' });
        }
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (branch.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        await prisma_1.default.branch.update({
            where: { id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Branch deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteBranch = deleteBranch;
