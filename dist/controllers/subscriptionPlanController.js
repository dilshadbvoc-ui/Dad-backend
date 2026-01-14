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
exports.deletePlan = exports.updatePlan = exports.createPlan = exports.getPlans = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const getPlans = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const where = {};
        // If not super admin, only show active plans
        if (!user || user.role !== 'super_admin') {
            where.isActive = true;
        }
        const plans = yield prisma_1.default.subscriptionPlan.findMany({
            where,
            orderBy: { price: 'asc' }
        });
        res.json({ plans });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getPlans = getPlans;
const createPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const plan = yield prisma_1.default.subscriptionPlan.create({ data: req.body });
        res.status(201).json(plan);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createPlan = createPlan;
const updatePlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const plan = yield prisma_1.default.subscriptionPlan.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(plan);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updatePlan = updatePlan;
const deletePlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        // Soft delete
        yield prisma_1.default.subscriptionPlan.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });
        res.json({ message: 'Plan deactivated' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deletePlan = deletePlan;
