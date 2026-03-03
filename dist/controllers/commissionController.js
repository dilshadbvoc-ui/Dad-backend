"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCommission = exports.updateCommission = exports.createCommission = exports.getCommissions = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getCommissions = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const commissions = await prisma_1.default.commission.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(commissions);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCommissions = getCommissions;
const createCommission = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        // Handle "self" userId - convert to actual user ID
        let targetUserId = req.body.userId;
        if (!targetUserId || targetUserId === 'self') {
            targetUserId = user.id;
        }
        // Validate that the user exists
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id: targetUserId }
        });
        if (!targetUser) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }
        const commission = await prisma_1.default.commission.create({
            data: {
                userId: targetUserId,
                amount: req.body.amount,
                currency: req.body.currency || 'INR',
                status: req.body.status || 'pending',
                type: req.body.type,
                description: req.body.description,
                dealId: req.body.dealId,
                date: req.body.date ? new Date(req.body.date) : new Date(),
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(commission);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createCommission = createCommission;
const updateCommission = async (req, res) => {
    try {
        const commission = await prisma_1.default.commission.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(commission);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateCommission = updateCommission;
const deleteCommission = async (req, res) => {
    try {
        await prisma_1.default.commission.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Commission deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteCommission = deleteCommission;
