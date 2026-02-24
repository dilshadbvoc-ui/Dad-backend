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
        const commission = await prisma_1.default.commission.create({
            data: {
                ...req.body,
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
//# sourceMappingURL=commissionController.js.map