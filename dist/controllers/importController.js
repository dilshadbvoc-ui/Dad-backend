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
exports.getImportJobStatus = exports.importLeads = void 0;
const prisma_1 = __importDefault(require("../config/prisma")); // Assumes you have a prisma instance
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const importLeads = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const mapping = JSON.parse(req.body.mapping || '{}');
        const defaultStatus = req.body.defaultStatus || 'new';
        const pipelineId = req.body.pipelineId || null;
        const defaultStage = req.body.defaultStage || null;
        const branchId = req.body.branchId || null;
        const applyAssignmentRules = req.body.applyAssignmentRules === 'true';
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'User has no organisation' });
        // Create Import Job with options
        const { ImportJobService } = await Promise.resolve().then(() => __importStar(require('../services/ImportJobService')));
        const job = await ImportJobService.createJob(user.id, orgId, req.file.path, mapping, {
            defaultStatus,
            pipelineId,
            defaultStage,
            branchId,
            applyAssignmentRules
        });
        // Start Processing in Background
        ImportJobService.processJob(job.id).catch(console.error);
        res.status(202).json({
            message: 'Import started successfully',
            jobId: job.id
        });
    }
    catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Import init failed: ' + error.message });
    }
};
exports.importLeads = importLeads;
const getImportJobStatus = async (req, res) => {
    try {
        const job = await prisma_1.default.importJob.findUnique({
            where: { id: req.params.id }
        });
        if (!job)
            return res.status(404).json({ message: 'Job not found' });
        // Security check: ensure same organisation
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (job.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        res.json(job);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getImportJobStatus = getImportJobStatus;
