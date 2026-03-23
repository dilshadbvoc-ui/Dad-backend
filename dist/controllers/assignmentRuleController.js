"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuleTypes = exports.deleteAssignmentRule = exports.updateAssignmentRule = exports.createAssignmentRule = exports.getAssignmentRules = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getAssignmentRules = async (req, res) => {
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
        // If a specific branchId filter is provided via query param, use it
        const filterBranchId = req.query.branchId;
        if (filterBranchId) {
            if (filterBranchId === 'global') {
                where.branchId = null;
            }
            else {
                where.branchId = filterBranchId;
            }
        }
        else if (user.role !== 'super_admin' && user.role !== 'admin') {
            // For non-admins: show rules for their managed branches + global rules
            const managedBranches = await prisma_1.default.branch.findMany({
                where: { managerId: user.id, isDeleted: false },
                select: { id: true }
            });
            const managedBranchIds = managedBranches.map(b => b.id);
            if (managedBranchIds.length > 0 || user.branchId) {
                const branchIds = [...new Set([...managedBranchIds, ...(user.branchId ? [user.branchId] : [])])];
                where.OR = [
                    { branchId: { in: branchIds } },
                    { branchId: null } // Global rules
                ];
            }
        }
        const rules = await prisma_1.default.assignmentRule.findMany({
            where,
            include: {
                targetManager: { select: { id: true, firstName: true, lastName: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                branch: { select: { id: true, name: true } }
            },
            orderBy: { priority: 'asc' }
        });
        res.json({ assignmentRules: rules });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAssignmentRules = getAssignmentRules;
const createAssignmentRule = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';
        let branchIdToSet = req.body.branchId;
        if (!isAdmin) {
            // Force branch managers to their own branch
            branchIdToSet = user.branchId;
        }
        else if (branchIdToSet === 'global' || branchIdToSet === null) {
            branchIdToSet = null;
        }
        else if (!branchIdToSet && user.branchId) {
            // Default to user's branch if they have one and didn't specify global
            branchIdToSet = user.branchId;
        }
        const ruleData = {
            name: req.body.name,
            description: req.body.description,
            isActive: req.body.isActive ?? true,
            priority: Number(req.body.priority) || 0,
            entity: req.body.entity || 'Lead',
            distributionType: req.body.distributionType || 'specific_user',
            distributionScope: req.body.distributionScope || 'organisation',
            targetRole: req.body.targetRole,
            targetManagerId: req.body.targetManagerId,
            ruleType: req.body.ruleType || 'round_robin',
            criteria: req.body.criteria || [],
            assignTo: req.body.assignTo,
            companySize: req.body.companySize,
            organisation: { connect: { id: orgId } },
            createdBy: { connect: { id: user.id } }
        };
        if (branchIdToSet) {
            ruleData.branch = { connect: { id: branchIdToSet } };
        }
        const rule = await prisma_1.default.assignmentRule.create({
            data: ruleData
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: orgId,
                actorId: user.id,
                action: 'CREATE_ASSIGNMENT_RULE',
                entity: 'AssignmentRule',
                entityId: rule.id,
                details: { name: rule.name, entity: rule.entity }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(rule);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createAssignmentRule = createAssignmentRule;
const updateAssignmentRule = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Verify existence and ownership
        const existing = await prisma_1.default.assignmentRule.findFirst({
            where: {
                id: req.params.id,
                isDeleted: false,
                ...(user.role !== 'super_admin' ? { organisationId: orgId } : {})
            }
        });
        if (!existing)
            return res.status(404).json({ message: 'Assignment rule not found' });
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';
        const updateData = { ...req.body };
        // Remove raw branchId to handle it via connect/disconnect
        delete updateData.branchId;
        if (req.body.branchId !== undefined) {
            let branchIdToSet = req.body.branchId;
            if (!isAdmin) {
                branchIdToSet = user.branchId;
            }
            else if (branchIdToSet === 'global' || branchIdToSet === null) {
                branchIdToSet = null;
            }
            if (branchIdToSet) {
                updateData.branch = { connect: { id: branchIdToSet } };
            }
            else {
                updateData.branch = { disconnect: true };
            }
        }
        const rule = await prisma_1.default.assignmentRule.update({
            where: { id: req.params.id },
            data: updateData
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: rule.organisationId || orgId,
                actorId: user.id,
                action: 'UPDATE_ASSIGNMENT_RULE',
                entity: 'AssignmentRule',
                entityId: rule.id,
                details: { name: rule.name, updatedFields: Object.keys(req.body) }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json(rule);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateAssignmentRule = updateAssignmentRule;
const deleteAssignmentRule = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Verify existence and ownership
        const existing = await prisma_1.default.assignmentRule.findFirst({
            where: {
                id: req.params.id,
                isDeleted: false,
                ...(user.role !== 'super_admin' ? { organisationId: orgId } : {})
            }
        });
        if (!existing)
            return res.status(404).json({ message: 'Assignment rule not found' });
        const rule = await prisma_1.default.assignmentRule.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: rule.organisationId || orgId,
                actorId: user.id,
                action: 'DELETE_ASSIGNMENT_RULE',
                entity: 'AssignmentRule',
                entityId: req.params.id,
                details: { name: rule.name }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'Assignment rule deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteAssignmentRule = deleteAssignmentRule;
// Get available rule types for UI
const getRuleTypes = async (req, res) => {
    res.json({
        ruleTypes: [
            { id: 'round_robin', name: 'Round Robin', description: 'Distribute evenly across team members' },
            { id: 'specific_user', name: 'Specific User', description: 'Assign to a specific user' },
            { id: 'top_performer', name: 'Top Performer', description: 'Assign to best performing sales rep' },
            { id: 'least_loaded', name: 'Least Loaded', description: 'Assign to user with fewest active leads' },
            { id: 'territory_based', name: 'Territory Based', description: 'Assign based on geographic territory' },
            { id: 'skill_based', name: 'Skill Based', description: 'Match lead type to user expertise' }
        ],
        distributionTypes: [
            { id: 'specific_user', name: 'Specific User' },
            { id: 'round_robin_role', name: 'Round Robin by Role' },
            { id: 'round_robin_team', name: 'Round Robin within Team' },
            { id: 'manager_team', name: 'Manager\'s Team' }
        ],
        operators: [
            { id: 'equals', name: 'Equals' },
            { id: 'not_equals', name: 'Not Equals' },
            { id: 'contains', name: 'Contains' },
            { id: 'starts_with', name: 'Starts With' },
            { id: 'ends_with', name: 'Ends With' },
            { id: 'gt', name: 'Greater Than' },
            { id: 'gte', name: 'Greater Than or Equal' },
            { id: 'lt', name: 'Less Than' },
            { id: 'lte', name: 'Less Than or Equal' },
            { id: 'in', name: 'In List' },
            { id: 'not_in', name: 'Not In List' }
        ],
        fields: [
            { id: 'source', name: 'Source', type: 'string' },
            { id: 'address.country', name: 'Country', type: 'string' },
            { id: 'address.state', name: 'State', type: 'string' },
            { id: 'address.city', name: 'City', type: 'string' },
            { id: 'industry', name: 'Industry', type: 'string' },
            { id: 'leadScore', name: 'Lead Score', type: 'number' },
            { id: 'companySize', name: 'Company Size', type: 'number' },
            { id: 'dealValue', name: 'Deal Value', type: 'number' },
            { id: 'tags', name: 'Tags', type: 'array' },
            { id: 'lifecycleStage', name: 'Lifecycle Stage', type: 'string' }
        ]
    });
};
exports.getRuleTypes = getRuleTypes;
