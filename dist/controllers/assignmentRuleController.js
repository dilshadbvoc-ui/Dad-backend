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
exports.getRuleTypes = exports.deleteAssignmentRule = exports.updateAssignmentRule = exports.createAssignmentRule = exports.getAssignmentRules = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getAssignmentRules = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const rules = yield prisma_1.default.assignmentRule.findMany({
            where,
            include: {
                targetManager: { select: { id: true, firstName: true, lastName: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } }
            },
            orderBy: { priority: 'asc' }
        });
        res.json({ assignmentRules: rules });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getAssignmentRules = getAssignmentRules;
const createAssignmentRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const rule = yield prisma_1.default.assignmentRule.create({
            data: {
                name: req.body.name,
                description: req.body.description,
                isActive: (_a = req.body.isActive) !== null && _a !== void 0 ? _a : true,
                priority: req.body.priority || 0,
                entity: req.body.entity || 'Lead',
                distributionType: req.body.distributionType || 'specific_user',
                distributionScope: req.body.distributionScope || 'organisation',
                targetRole: req.body.targetRole,
                targetManagerId: req.body.targetManagerId,
                ruleType: req.body.ruleType || 'round_robin',
                criteria: req.body.criteria || [],
                assignTo: req.body.assignTo,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        res.status(201).json(rule);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createAssignmentRule = createAssignmentRule;
const updateAssignmentRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rule = yield prisma_1.default.assignmentRule.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(rule);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateAssignmentRule = updateAssignmentRule;
const deleteAssignmentRule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.assignmentRule.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Assignment rule deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteAssignmentRule = deleteAssignmentRule;
// Get available rule types for UI
const getRuleTypes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
});
exports.getRuleTypes = getRuleTypes;
