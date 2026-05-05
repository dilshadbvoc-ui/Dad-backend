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
exports.submitWebForm = exports.deleteWebForm = exports.updateWebForm = exports.createWebForm = exports.getWebForms = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getWebForms = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const webForms = await prisma_1.default.webForm.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        // Calculate submissionsCount for each form
        // Submissions are leads with source 'website' and sourceDetails content linking to the form
        const formsWithCounts = await Promise.all(webForms.map(async (form) => {
            const count = await prisma_1.default.lead.count({
                where: {
                    organisationId: orgId,
                    source: 'website',
                    isDeleted: false,
                    sourceDetails: {
                        path: ['webFormId'],
                        equals: form.id
                    }
                }
            });
            return {
                ...form,
                submissionsCount: count
            };
        }));
        res.json(formsWithCounts);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getWebForms = getWebForms;
const createWebForm = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const webForm = await prisma_1.default.webForm.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(webForm);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createWebForm = createWebForm;
const updateWebForm = async (req, res) => {
    try {
        const webForm = await prisma_1.default.webForm.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(webForm);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateWebForm = updateWebForm;
const deleteWebForm = async (req, res) => {
    try {
        await prisma_1.default.webForm.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'WebForm deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteWebForm = deleteWebForm;
/**
 * Public endpoint for submitting a web form
 * POST /api/public/webforms/:id/submit
 */
const submitWebForm = async (req, res) => {
    try {
        const { id } = req.params;
        const formData = req.body;
        const webForm = await prisma_1.default.webForm.findUnique({
            where: { id, isDeleted: false }
        });
        if (!webForm || !webForm.isActive) {
            return res.status(404).json({ message: 'Form not found or inactive' });
        }
        const orgId = webForm.organisationId;
        // Sanitize phone: keep all digits for the service to handle normalization
        let cleanPhone = formData.phone?.toString().replace(/\D/g, '') || '';
        // Resolve target branch early to isolate duplicate check
        let targetBranchId = null;
        const { DistributionService } = await Promise.resolve().then(() => __importStar(require('../services/distributionService')));
        // Simulate assignment to find target owner and their branch
        const assignedUserId = await DistributionService.assignLead({ ...formData, organisationId: orgId }, orgId);
        if (assignedUserId) {
            const assignedUser = await prisma_1.default.user.findUnique({
                where: { id: assignedUserId },
                select: { branchId: true }
            });
            if (assignedUser?.branchId)
                targetBranchId = assignedUser.branchId;
        }
        // Check for duplicates in the RESOLVED branch
        const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('../services/duplicateLeadService')));
        const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, formData.email, orgId, targetBranchId || undefined);
        if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
            // Handle as re-enquiry
            await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, {
                firstName: formData.firstName || 'Unknown',
                lastName: formData.lastName || '',
                email: formData.email,
                phone: cleanPhone,
                company: formData.company,
                source: 'website',
                sourceDetails: { webFormId: id, ...formData.customFields }
            }, orgId);
            return res.status(200).json({
                message: 'Thank you for your interest! We will contact you soon.',
                isReEnquiry: true
            });
        }
        // 1. Create Lead with resolved assignment
        const lead = await prisma_1.default.lead.create({
            data: {
                firstName: formData.firstName || 'Unknown',
                lastName: formData.lastName || '',
                email: formData.email,
                phone: cleanPhone,
                company: formData.company,
                source: 'website',
                organisationId: orgId,
                assignedToId: assignedUserId || undefined,
                branchId: targetBranchId,
                customFields: {
                    webFormId: id,
                    ...formData.customFields
                }
            }
        });
        // 3. AI Scoring
        const { LeadScoringService } = await Promise.resolve().then(() => __importStar(require('../services/leadScoringService')));
        LeadScoringService.scoreLead(lead.id).catch(console.error);
        res.status(201).json({
            message: 'Form submitted successfully',
            leadId: lead.id
        });
    }
    catch (error) {
        console.error('[WebFormSubmit] Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.submitWebForm = submitWebForm;
