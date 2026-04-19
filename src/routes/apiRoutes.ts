
import express from 'express';
import { verifyApiKey } from '../middleware/apiKeyMiddleware';
import prisma from '../config/prisma';
import { LeadSource } from '../generated/client';
import { DistributionService } from '../services/distributionService';
import { WorkflowEngine } from '../services/workflowEngine';
import { emitToOrg } from '../socket';

const router = express.Router();

/**
 * @route POST /api/v1/leads
 * @desc Create a lead via public API
 */
router.post('/leads', verifyApiKey, async (req, res) => {
    try {
        const { firstName, lastName, name, email, phone, company, message, source, branchId, assignedToId } = req.body;
        const user = (req as any).user;
        const orgId = user.organisationId;

        // --- ENHANCEMENT: Name Splitting ---
        // If firstName is missing but name is provided, split it
        let resolvedFirstName = firstName;
        let resolvedLastName = lastName;

        if (!resolvedFirstName && name) {
            const parts = name.trim().split(/\s+/);
            resolvedFirstName = parts[0];
            resolvedLastName = parts.length > 1 ? parts.slice(1).join(' ') : (lastName || '');
        }

        // --- ENHANCEMENT: Source Sanitization ---
        // Check if provided source is a valid enum value, otherwise fallback to 'api'
        let resolvedSource: LeadSource = LeadSource.api;
        let originalSourceLabel = source;

        if (source) {
            const validSources = Object.values(LeadSource) as string[];
            if (validSources.includes(source)) {
                resolvedSource = source as LeadSource;
            } else {
                // Keep the 'api' enum value but store the raw label in sourceDetails
                console.log(`[Public API] Unsupported source label received: "${source}". Falling back to 'api'.`);
            }
        }

        // Basic Validation
        if (!resolvedFirstName && !email && !phone) {
            return res.status(400).json({ message: 'At least Name, Email, or Phone is required' });
        }

        // Sanitize
        let cleanPhone = phone?.toString().replace(/\D/g, '');
        if (cleanPhone && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);

        // Check for duplicates using DuplicateLeadService
        const { DuplicateLeadService } = await import('../services/duplicateLeadService');
        const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, email, orgId, branchId);

        if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
            // Handle as re-enquiry
            const updatedLead = await DuplicateLeadService.handleReEnquiry(
                duplicateCheck.existingLead,
                {
                    firstName: resolvedFirstName || 'Unknown',
                    lastName: resolvedLastName || '',
                    email,
                    phone: cleanPhone,
                    company,
                    source: resolvedSource,
                    sourceDetails: { 
                        message,
                        originalSource: originalSourceLabel,
                        rawPayload: req.body // Keep the full payload for debugging re-enquiries
                    }
                },
                orgId
            );

            // Emit update for re-enquiry
            emitToOrg(orgId, 'lead_updated', updatedLead);

            return res.status(200).json({
                message: 'Lead already exists. Marked as re-enquiry.',
                id: duplicateCheck.existingLead.id,
                isReEnquiry: true,
                matchedBy: duplicateCheck.matchedBy
            });
        }

        // Resolve Default Status from Organisation Settings
        let leadStatus = "new";
        const org = await prisma.organisation.findUnique({
            where: { id: orgId },
            select: { leadStatuses: true }
        });
        
        if (org?.leadStatuses && Array.isArray(org.leadStatuses)) {
            const statuses = org.leadStatuses as any[];
            const configuredDefault = statuses.find((s) => s.isDefault);
            if (configuredDefault) {
                leadStatus = configuredDefault.id;
            }
        }

        const lead = await prisma.lead.create({
            data: {
                firstName: resolvedFirstName || 'Unknown',
                lastName: resolvedLastName || '',
                email,
                phone: cleanPhone || 'Unknown', // Phone is required in schema, but we want to be forgiving
                company,
                source: resolvedSource,
                status: leadStatus,
                organisationId: orgId,
                branchId: branchId || undefined,
                assignedToId: assignedToId || undefined,
                sourceDetails: { 
                    message,
                    originalSource: originalSourceLabel,
                    rawPayload: req.body 
                }
            }
        });

        // Async Distribution & Workflow (respect assignedToId if provided)
        if (!assignedToId) {
            DistributionService.assignLead(lead, orgId).catch(err => {
                console.error('[Public API] Lead distribution error:', err);
            });
        }

        if (req.body.score !== false) {
            import('../services/leadScoringService').then(({ LeadScoringService }) => {
                LeadScoringService.scoreLead(lead.id).catch(err => {
                    console.error('[Public API] Lead scoring error:', err);
                });
            });
        }

        // Trigger Created Workflow
        WorkflowEngine.evaluate('Lead', 'created', lead, orgId).catch(err => {
            console.error('[Public API] Workflow evaluation error:', err);
        });

        // Real-time Sync
        emitToOrg(orgId, 'lead_created', lead);

        res.status(201).json({ id: lead.id, message: 'Lead created successfully' });

    } catch (error) {
        console.error('Public API Create Lead Critical Error:', error);
        // Include more helpful error info in logs
        if (error instanceof Error) {
            console.error('Error Details:', error.stack);
        }
        res.status(500).json({ message: 'Server Error', detail: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined });
    }
});

/**
 * @route GET /api/v1/leads
 * @desc List leads for the organisation (ReadOnly)
 */
router.get('/leads', verifyApiKey, async (req, res) => {
    try {
        const user = (req as any).user;
        const orgId = user.organisationId;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;

        const leads = await prisma.lead.findMany({
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
    } catch {
        res.status(500).json({ message: 'Server Error' });
    }
});

export default router;
