"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTerritory = exports.updateTerritory = exports.createTerritory = exports.getTerritories = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const auditLogger_1 = require("../utils/auditLogger");
const getTerritories = async (req, res) => {
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
        const territories = await prisma_1.default.territory.findMany({
            where,
            include: {
                manager: { select: { id: true, firstName: true, lastName: true } }
            },
            orderBy: { name: 'asc' }
        });
        // Fetch member details for each territory
        const territoriesWithMembers = await Promise.all(territories.map(async (t) => {
            let members = [];
            if (t.memberIds && t.memberIds.length > 0) {
                members = await prisma_1.default.user.findMany({
                    where: { id: { in: t.memberIds } },
                    select: { id: true, firstName: true, lastName: true }
                });
            }
            return { ...t, members };
        }));
        res.json({ territories: territoriesWithMembers });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTerritories = getTerritories;
const createTerritory = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const territory = await prisma_1.default.territory.create({
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
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'CREATE_TERRITORY',
            entity: 'Territory',
            entityId: territory.id,
            details: { name: territory.name }
        });
        res.status(201).json(territory);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createTerritory = createTerritory;
const updateTerritory = async (req, res) => {
    try {
        const data = { ...req.body };
        // Map manager and members to correct field names
        if (req.body.manager !== undefined) {
            data.managerId = req.body.manager;
            delete data.manager;
        }
        if (req.body.members !== undefined) {
            data.memberIds = req.body.members;
            delete data.members;
        }
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const territory = await prisma_1.default.territory.update({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'UPDATE_TERRITORY',
            entity: 'Territory',
            entityId: territory.id,
            details: { name: territory.name }
        });
        res.json(territory);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateTerritory = updateTerritory;
const deleteTerritory = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        await prisma_1.default.territory.update({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: { isDeleted: true }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'DELETE_TERRITORY',
            entity: 'Territory',
            entityId: req.params.id
        });
        res.json({ message: 'Territory deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteTerritory = deleteTerritory;
//# sourceMappingURL=territoryController.js.map