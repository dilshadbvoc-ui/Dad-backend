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
exports.deleteTerritory = exports.updateTerritory = exports.createTerritory = exports.getTerritories = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getTerritories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        let orgId;
        if (user.role === 'super_admin') {
            orgId = req.query.organisationId || undefined;
        }
        else {
            orgId = (0, hierarchyUtils_1.getOrgId)(user) || undefined;
            if (!orgId)
                return res.status(403).json({ message: 'User not associated with an organisation' });
        }
        const where = { isDeleted: false };
        if (orgId)
            where.organisationId = orgId;
        const territories = yield prisma_1.default.territory.findMany({
            where,
            include: {
                manager: { select: { id: true, firstName: true, lastName: true } }
            },
            orderBy: { name: 'asc' }
        });
        // Fetch member details for each territory
        const territoriesWithMembers = yield Promise.all(territories.map((t) => __awaiter(void 0, void 0, void 0, function* () {
            let members = [];
            if (t.memberIds && t.memberIds.length > 0) {
                members = yield prisma_1.default.user.findMany({
                    where: { id: { in: t.memberIds } },
                    select: { id: true, firstName: true, lastName: true }
                });
            }
            return Object.assign(Object.assign({}, t), { members });
        })));
        res.json({ territories: territoriesWithMembers });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getTerritories = getTerritories;
const createTerritory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const territory = yield prisma_1.default.territory.create({
            data: {
                name: req.body.name,
                description: req.body.description,
                region: req.body.region,
                country: req.body.country,
                states: req.body.states || [],
                cities: req.body.cities || [],
                managerId: req.body.manager,
                memberIds: req.body.members || [],
                isActive: true,
                organisation: { connect: { id: orgId } }
            }
        });
        res.status(201).json(territory);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createTerritory = createTerritory;
const updateTerritory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = Object.assign({}, req.body);
        // Map manager and members to correct field names
        if (req.body.manager !== undefined) {
            data.managerId = req.body.manager;
            delete data.manager;
        }
        if (req.body.members !== undefined) {
            data.memberIds = req.body.members;
            delete data.members;
        }
        const territory = yield prisma_1.default.territory.update({
            where: { id: req.params.id },
            data
        });
        res.json(territory);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateTerritory = updateTerritory;
const deleteTerritory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.territory.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Territory deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteTerritory = deleteTerritory;
