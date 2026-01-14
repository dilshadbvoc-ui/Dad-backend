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
exports.createCheckIn = exports.getCheckIns = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getCheckIns = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const date = req.query.date;
        const skip = (page - 1) * limit;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const where = { organisationId: orgId };
        // 1. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            where.userId = { in: [...subordinateIds, user.id] };
        }
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            where.createdAt = { gte: startOfDay, lte: endOfDay };
        }
        const checkIns = yield prisma_1.default.checkIn.findMany({
            where,
            include: {
                user: { select: { firstName: true, lastName: true, email: true } },
                lead: { select: { firstName: true, lastName: true, company: true } },
                contact: { select: { firstName: true, lastName: true } },
                account: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });
        const total = yield prisma_1.default.checkIn.count({ where });
        res.json({
            checkIns: checkIns.map(c => (Object.assign(Object.assign({}, c), { 
                // Map polymorphic relatedTo for frontend compatibility if needed, 
                // or frontend can adapt to specific fields. 
                // Legacy frontend likely expects `relatedTo` object.
                relatedTo: c.lead || c.contact || c.account || null, onModel: c.lead ? 'Lead' : c.contact ? 'Contact' : c.account ? 'Account' : null }))),
            page,
            totalPages: Math.ceil(total / limit),
            total
        });
    }
    catch (error) {
        console.error('getCheckIns Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.getCheckIns = getCheckIns;
const createCheckIn = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const { type, location, relatedTo, onModel, notes, photoUrl } = req.body;
        const data = {
            type,
            address: location === null || location === void 0 ? void 0 : location.address,
            latitude: location === null || location === void 0 ? void 0 : location.latitude,
            longitude: location === null || location === void 0 ? void 0 : location.longitude,
            notes,
            photoUrl,
            user: { connect: { id: user.id } },
            organisation: { connect: { id: orgId } }
        };
        // Handle Polymorphic Relation
        if (relatedTo && onModel) {
            if (onModel === 'Lead')
                data.lead = { connect: { id: relatedTo } };
            if (onModel === 'Contact')
                data.contact = { connect: { id: relatedTo } };
            if (onModel === 'Account')
                data.account = { connect: { id: relatedTo } };
        }
        const checkIn = yield prisma_1.default.checkIn.create({
            data,
            include: { user: { select: { firstName: true, lastName: true } } }
        });
        res.status(201).json(checkIn);
    }
    catch (error) {
        console.error('createCheckIn Error:', error);
        res.status(400).json({ message: error.message });
    }
});
exports.createCheckIn = createCheckIn;
