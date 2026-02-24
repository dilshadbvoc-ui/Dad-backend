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
const express_1 = __importDefault(require("express"));
const apiKeyMiddleware_1 = require("../middleware/apiKeyMiddleware");
const prisma_1 = __importDefault(require("../config/prisma"));
const client_1 = require("../generated/client");
const distributionService_1 = require("../services/distributionService");
const workflowEngine_1 = require("../services/workflowEngine");
const router = express_1.default.Router();
/**
 * @route POST /api/v1/leads
 * @desc Create a lead via public API
 */
router.post('/leads', apiKeyMiddleware_1.verifyApiKey, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, company, message, source } = req.body;
        const user = req.user;
        const orgId = user.organisationId;
        // Basic Validation
        if (!email && !phone) {
            return res.status(400).json({ message: 'Email or Phone is required' });
        }
        // Sanitize
        let cleanPhone = phone?.toString().replace(/\D/g, '');
        if (cleanPhone && cleanPhone.length > 10)
            cleanPhone = cleanPhone.slice(-10);
        // Check for duplicates using DuplicateLeadService
        const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('../services/duplicateLeadService')));
        const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, email, orgId);
        if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
            // Handle as re-enquiry
            await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, {
                firstName: firstName || 'Unknown',
                lastName: lastName || '',
                email,
                phone: cleanPhone,
                company,
                source: source || 'api',
                sourceDetails: { message }
            }, orgId);
            return res.status(200).json({
                message: 'Lead already exists. Marked as re-enquiry.',
                id: duplicateCheck.existingLead.id,
                isReEnquiry: true,
                matchedBy: duplicateCheck.matchedBy
            });
        }
        const lead = await prisma_1.default.lead.create({
            data: {
                firstName: firstName || 'Unknown',
                lastName: lastName || '',
                email,
                phone: cleanPhone,
                company,
                source: source || client_1.LeadSource.api,
                status: client_1.LeadStatus.new,
                organisationId: orgId,
                customFields: { message } // Store raw message
            }
        });
        // Async Distribution & Workflow
        distributionService_1.DistributionService.assignLead(lead, orgId).catch(console.error);
        if (req.body.score !== false) {
            Promise.resolve().then(() => __importStar(require('../services/leadScoringService'))).then(({ LeadScoringService }) => {
                LeadScoringService.scoreLead(lead.id).catch(console.error);
            });
        }
        // Trigger Created Workflow
        workflowEngine_1.WorkflowEngine.evaluate('Lead', 'created', lead, orgId).catch(console.error);
        res.status(201).json({ id: lead.id, message: 'Lead created successfully' });
    }
    catch (error) {
        console.error('Public API Create Lead Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});
/**
 * @route GET /api/v1/leads
 * @desc List leads for the organisation (ReadOnly)
 */
router.get('/leads', apiKeyMiddleware_1.verifyApiKey, async (req, res) => {
    try {
        const user = req.user;
        const orgId = user.organisationId;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const leads = await prisma_1.default.lead.findMany({
            where: { organisationId: orgId },
            take: limit,
            skip: (page - 1) * limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                company: true,
                status: true,
                createdAt: true
            }
        });
        res.json({ data: leads, page, limit });
    }
    catch {
        res.status(500).json({ message: 'Server Error' });
    }
});
exports.default = router;
//# sourceMappingURL=apiRoutes.js.map