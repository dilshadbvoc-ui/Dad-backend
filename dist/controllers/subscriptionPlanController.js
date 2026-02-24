"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePlan = exports.updatePlan = exports.createPlan = exports.getPlans = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const getPlans = async (req, res) => {
    try {
        // Always filter by isActive: true - deleted plans should not reappear
        const plans = await prisma_1.default.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { price: 'asc' }
        });
        res.json({ plans });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPlans = getPlans;
const createPlan = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const plan = await prisma_1.default.subscriptionPlan.create({ data: req.body });
        res.status(201).json(plan);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createPlan = createPlan;
const updatePlan = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const plan = await prisma_1.default.subscriptionPlan.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(plan);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updatePlan = updatePlan;
const deletePlan = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        // Soft delete
        await prisma_1.default.subscriptionPlan.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });
        res.json({ message: 'Plan deactivated' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deletePlan = deletePlan;
//# sourceMappingURL=subscriptionPlanController.js.map