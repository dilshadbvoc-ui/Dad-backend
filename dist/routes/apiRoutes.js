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
const socket_1 = require("../socket");
const router = express_1.default.Router();
/**
 * @route POST /api/v1/leads
 * @desc Create a lead via public API
 */
router.post('/leads', apiKeyMiddleware_1.verifyApiKey, async (req, res) => {
    const REQUEST_ID = Math.random().toString(36).substring(7);
    console.log(`[LeadAPI][${REQUEST_ID}] Step 1: Request Received at ${new Date().toISOString()}`);
    try {
        const { firstName, lastName, name, email, phone, company, message, enquiryDetails, msg, comments, notes, payload_message, source, branchId, assignedToId } = req.body;
        const user = req.user;
        const orgId = user?.organisationId;
        // NUCLEAR FALLBACK: Exhaustive list of possible message fields
        const resolvedMessage = message || enquiryDetails || msg || comments || notes || payload_message || "";
        console.log(`[LeadAPI][${REQUEST_ID}] Step 2: Context - Org: ${orgId}, User: ${user?.id}`);
        console.log(`[LeadAPI][${REQUEST_ID}] FULL DATA TRACE: ${JSON.stringify(req.body)}`);
        console.log(`[LeadAPI][${REQUEST_ID}] Resolved Message: "${resolvedMessage.substring(0, 50)}..."`);
        // --- ENHANCEMENT: Name Splitting ---
        let resolvedFirstName = firstName;
        let resolvedLastName = lastName;
        if (!resolvedFirstName && name) {
            console.log(`[LeadAPI][${REQUEST_ID}] Step 3: Splitting Name field: "${name}"`);
            const parts = name.trim().split(/\s+/);
            resolvedFirstName = parts[0];
            resolvedLastName = parts.length > 1 ? parts.slice(1).join(' ') : (lastName || '');
            console.log(`[LeadAPI][${REQUEST_ID}] Resolved: First="${resolvedFirstName}", Last="${resolvedLastName}"`);
        }
        // --- ENHANCEMENT: Source Sanitization ---
        let resolvedSource = client_1.LeadSource.website; // Default to website for this endpoint
        let originalSourceLabel = source;
        if (source) {
            const lowerSource = source.toLowerCase();
            const validSources = Object.values(client_1.LeadSource);
            if (validSources.includes(lowerSource)) {
                resolvedSource = lowerSource;
                console.log(`[LeadAPI][${REQUEST_ID}] Step 4: Matched source: ${resolvedSource}`);
            }
            else if (lowerSource.includes('web') || lowerSource.includes('form')) {
                resolvedSource = client_1.LeadSource.website;
                console.log(`[LeadAPI][${REQUEST_ID}] Step 4: Mapped "${source}" to website`);
            }
            else {
                resolvedSource = client_1.LeadSource.api;
                console.log(`[LeadAPI][${REQUEST_ID}] Step 4: Label "${source}" mapped to api enum.`);
            }
        }
        // Basic Validation
        if (!resolvedFirstName && !email && !phone) {
            console.log(`[LeadAPI][${REQUEST_ID}] ABORT: Missing required fields (name/email/phone)`);
            return res.status(400).json({ message: 'At least Name, Email, or Phone is required' });
        }
        // Sanitize
        let cleanPhone = phone?.toString().replace(/\D/g, '');
        if (cleanPhone && cleanPhone.length > 10)
            cleanPhone = cleanPhone.slice(-10);
        console.log(`[LeadAPI][${REQUEST_ID}] Step 5: Sanitized Phone for duplicate check: "${cleanPhone}"`);
        // Check for duplicates
        console.log(`[LeadAPI][${REQUEST_ID}] Step 6: Starting DuplicateLeadService.checkDuplicate...`);
        const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('../services/duplicateLeadService')));
        const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, email, orgId, branchId);
        console.log(`[LeadAPI][${REQUEST_ID}] Step 7: Duplicate Check Result: ${duplicateCheck.isDuplicate}`);
        if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
            console.log(`[LeadAPI][${REQUEST_ID}] Step 8a: Handling as Re-Enquiry for Lead: ${duplicateCheck.existingLead.id}`);
            const updatedLead = await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, {
                firstName: resolvedFirstName || 'Unknown',
                lastName: resolvedLastName || '',
                email,
                phone: cleanPhone,
                company,
                source: resolvedSource,
                sourceDetails: {
                    message: resolvedMessage,
                    originalSource: originalSourceLabel,
                    rawPayload: req.body
                }
            }, orgId);
            console.log(`[LeadAPI][${REQUEST_ID}] Step 9a: Re-Enquiry updated successfully. Emitting update.`);
            (0, socket_1.emitToOrg)(orgId, 'lead_updated', updatedLead);
            return res.status(200).json({
                message: 'Lead already exists. Marked as re-enquiry.',
                id: duplicateCheck.existingLead.id,
                isReEnquiry: true
            });
        }
        // Resolve Default Status
        console.log(`[LeadAPI][${REQUEST_ID}] Step 8b: Fetching Organization config for default lead status...`);
        let leadStatus = "new";
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId },
            select: { leadStatuses: true }
        });
        if (org?.leadStatuses && Array.isArray(org.leadStatuses)) {
            const statuses = org.leadStatuses;
            const configuredDefault = statuses.find((s) => s.isDefault);
            if (configuredDefault) {
                leadStatus = configuredDefault.id;
            }
        }
        console.log(`[LeadAPI][${REQUEST_ID}] Step 9b: Attempting prisma.lead.create with status="${leadStatus}"`);
        const lead = await prisma_1.default.lead.create({
            data: {
                firstName: resolvedFirstName || 'Unknown',
                lastName: resolvedLastName || '',
                email,
                phone: cleanPhone || 'Unknown',
                company,
                source: resolvedSource,
                enquiryAbout: resolvedMessage, // Corrected: use resolvedMessage
                status: leadStatus,
                organisationId: orgId,
                branchId: branchId || undefined,
                assignedToId: assignedToId || undefined,
                sourceDetails: {
                    message: resolvedMessage,
                    originalSource: originalSourceLabel,
                    rawPayload: req.body
                }
            }
        });
        // Map resolved message to primary field post-creation if not done in Prisma (standardizing)
        if (resolvedMessage && !lead.enquiryAbout) {
            await prisma_1.default.lead.update({
                where: { id: lead.id },
                data: { enquiryAbout: resolvedMessage }
            });
        }
        console.log(`[LeadAPI][${REQUEST_ID}] Step 10: Lead successfully created in DB. ID: ${lead.id}`);
        // Notification logic
        try {
            const { NotificationService } = await Promise.resolve().then(() => __importStar(require('../services/notificationService')));
            // 1. Notify the assigned owner
            if (lead.assignedToId) {
                console.log(`[LeadAPI][${REQUEST_ID}] Notifying assigned owner: ${lead.assignedToId}`);
                await NotificationService.send(lead.assignedToId, 'New Lead Assigned', `🚀 New lead from ${originalSourceLabel || 'Website'}: ${lead.firstName} ${lead.lastName || ''}`, 'success');
            }
            // 2. Notify all Admins/Managers in the org (so they can see new arrival)
            const admins = await prisma_1.default.user.findMany({
                where: {
                    organisationId: orgId,
                    role: { in: ['org_admin', 'super_admin', 'admin', 'manager', 'sales_manager'] },
                    isActive: true,
                    id: { not: lead.assignedToId || '' }
                },
                select: { id: true, firstName: true }
            });
            console.log(`[LeadAPI][${REQUEST_ID}] Notifying ${admins.length} admins: ${admins.map(a => a.firstName).join(', ')}`);
            for (const admin of admins) {
                await NotificationService.send(admin.id, 'New API Lead Received', `📢 ${lead.firstName} ${lead.lastName || ''} enquired via ${originalSourceLabel || 'Website'}.`, 'info');
            }
        }
        catch (notifierErr) {
            console.error(`[LeadAPI][${REQUEST_ID}] Notification error:`, notifierErr);
        }
        // Async Distribution 
        if (!assignedToId) {
            console.log(`[LeadAPI][${REQUEST_ID}] Step 11: Triggering Distribution Service...`);
            distributionService_1.DistributionService.assignLead(lead, orgId).then(() => {
                console.log(`[LeadAPI][${REQUEST_ID}] Step 11 success: Distribution complete.`);
            }).catch(err => {
                console.error(`[LeadAPI][${REQUEST_ID}] Distribution Error (ignored):`, err);
            });
        }
        // Real-time Sync
        console.log(`[LeadAPI][${REQUEST_ID}] Step 12: Emitting Socket lead_created event.`);
        (0, socket_1.emitToOrg)(orgId, 'lead_created', lead);
        console.log(`[LeadAPI][${REQUEST_ID}] COMPLETED SUCCESSFULLY`);
        res.status(201).json({ id: lead.id, message: 'Lead created successfully' });
    }
    catch (error) {
        console.error(`[LeadAPI][${REQUEST_ID}] CATCH BLOCK TRIGGERED:`, error);
        if (error instanceof Error) {
            console.error(`[LeadAPI][${REQUEST_ID}] Error Message:`, error.message);
            console.error(`[LeadAPI][${REQUEST_ID}] Error Stack:`, error.stack);
        }
        res.status(500).json({
            message: 'Server Error',
            requestId: REQUEST_ID,
            detail: process.env.NODE_ENV === 'development' ? error.message : 'Please check server logs for RequestID ' + REQUEST_ID
        });
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
