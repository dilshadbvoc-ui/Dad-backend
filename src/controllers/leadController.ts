import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds, getVisibleUserIds } from '../utils/hierarchyUtils';
import { DistributionService } from '../services/distributionService';
import { WorkflowEngine } from '../services/workflowEngine';
import { NotificationService } from '../services/notificationService';
import { LeadSource, LeadStatus } from '../generated/client';
import { isAdmin, isSuperAdmin } from '../utils/roleUtils';
// Dynamic import used for OpenAI to avoid startup errors if missing



// GET /api/leads
export const getLeads = async (req: Request, res: Response) => {
    try {
        console.log('[getLeads] Query Params:', req.query); // DEBUG LOG

        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = (req as any).user;
        const where: any = { isDeleted: false };
        const andConditions: any[] = [];

        console.log('[getLeads] User:', user.id, user.role); // DEBUG LOG

        // 1. Organisation Scoping
        if (user.isSuperAdmin || isSuperAdmin(user)) {
            if (req.query.organisationId) where.organisationId = req.query.organisationId as string;
        } else {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }

        // 2. Hierarchy Visibility
        // Only apply hierarchy restrictions for non-admin users
        if (!user.isSuperAdmin && !isSuperAdmin(user) && !isAdmin(user)) {
            // New Logic: Anyone can see their own leads + leads of their subordinates (recursively) + managed branches.
            // Role names no longer strictly limit visibility if they have reporting subordinates.
            const visibleUserIds = await getVisibleUserIds(user.id);

            andConditions.push({
                OR: [
                    { assignedToId: { in: visibleUserIds } }, // Assigned to self or any subordinate/branch user
                    {
                        AND: [
                            { createdById: { in: visibleUserIds } }, // Created by self or subordinate
                            { assignedToId: null }    // But not reassigned to someone else (who might be outside visibility)
                        ]
                    }
                ]
            });
        }

        // Filter: Status
        if (req.query.status && Object.values(LeadStatus).includes(req.query.status as LeadStatus)) {
            where.status = req.query.status as LeadStatus;
        }

        // Filter: Source
        if (req.query.source && Object.values(LeadSource).includes(req.query.source as LeadSource)) {
            where.source = req.query.source as LeadSource;
        }

        // Filter: Search (OR condition)
        if (req.query.search) {
            const search = String(req.query.search);
            andConditions.push({
                OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { company: { contains: search, mode: 'insensitive' } }
                ]
            });
        }

        // Filter: Assigned User
        if (req.query.assignedTo) {
            where.assignedToId = req.query.assignedTo as string;
        }

        // Combine all conditions
        if (andConditions.length > 0) {
            where.AND = andConditions;
        }

        console.log('[getLeads] Prisma Where:', JSON.stringify(where, null, 2)); // DEBUG LOG

        const total = await prisma.lead.count({ where });
        const leads = await prisma.lead.findMany({
            where,
            include: {
                assignedTo: {
                    select: { firstName: true, lastName: true, email: true }
                }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { updatedAt: 'desc' }
        });

        res.json({ leads, page, pages: Math.ceil(total / pageSize), total });
    } catch (error) {
        console.error('getLeads Error:', error);
        // Return 500 but include error message for debugging
        res.status(500).json({ message: (error as Error).message, stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined });
    }
};

// POST /api/leads
export const createLead = async (req: Request, res: Response) => {
    try {
        const { email, phone } = req.body;

        if (!phone) return res.status(400).json({ message: 'Phone number is required' });

        // Sanitize Phone
        let cleanPhone = phone.toString().replace(/\D/g, '');
        if (cleanPhone.length > 10 && cleanPhone.endsWith(cleanPhone.slice(-10))) {
            cleanPhone = cleanPhone.slice(-10);
        }

        const orgId = getOrgId((req as any).user);
        if (!orgId) return res.status(400).json({ message: 'Organisation context required' });

        const currentUser = (req as any).user;
        const branchId = req.body.branchId || currentUser.branchId;
        const assignedTo = req.body.assignedTo;
        const { firstName, lastName, source, sourceDetails, company, enquiryAbout } = req.body;

        // Check for duplicates using DuplicateLeadService
        const DuplicateLeadService = (await import('../services/duplicateLeadService')).default;
        const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, email, orgId, branchId || undefined);

        if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
            // Handle as re-enquiry
            const reEnquiryData = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                phone: cleanPhone,
                company: company,
                enquiryAbout: enquiryAbout,
                source: source,
                sourceDetails: sourceDetails
            };

            const updatedLead = await DuplicateLeadService.handleReEnquiry(
                duplicateCheck.existingLead,
                reEnquiryData,
                orgId
            );

            return res.status(200).json({
                message: 'Lead already exists. Marked as re-enquiry and notifications sent.',
                lead: updatedLead,
                isReEnquiry: true,
                matchedBy: duplicateCheck.matchedBy,
                reEnquiryCount: updatedLead.reEnquiryCount
            });
        }

        // Sanitize email: treat empty string as no email
        const cleanEmail = email && email.trim() !== '' ? email.trim() : undefined;

        // Manual assignment owner logic
        const leadOwnerId = assignedTo || currentUser.id;

        // Detect country from IP address if not provided
        let geoData = null;
        if (!req.body.country && !req.body.countryCode) {
            const { GeoLocationService } = await import('../services/geoLocationService');
            const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress;
            if (ipAddress) {
                geoData = await GeoLocationService.detectCountryFromIP(ipAddress as string);
            }

            // Fallback: Try to detect from phone number
            if (!geoData && cleanPhone) {
                geoData = GeoLocationService.detectCountryFromPhone(cleanPhone);
            }
        }

        // Custom Field Validation
        if (req.body.customFields) {
            const { CustomFieldValidationService } = await import('../services/customFieldValidationService');
            await CustomFieldValidationService.validateFields('Lead', orgId, req.body.customFields);
        }

        // Create — only pass explicitly known Lead fields (no blind spreading)
        const lead = await prisma.lead.create({
            data: {
                firstName: req.body.firstName || '',
                lastName: req.body.lastName || undefined,
                email: cleanEmail,
                phone: cleanPhone,
                secondaryPhone: req.body.secondaryPhone || undefined,
                company: req.body.company || undefined,
                enquiryAbout: req.body.enquiryAbout || undefined,
                jobTitle: req.body.jobTitle || undefined,
                address: req.body.address || undefined,
                customFields: req.body.customFields || undefined,
                tags: req.body.tags || undefined,
                stage: req.body.stage || undefined,
                sourceDetails: req.body.sourceDetails || undefined,
                country: req.body.country || geoData?.country || undefined,
                countryCode: req.body.countryCode || geoData?.countryCode || undefined,
                phoneCountryCode: req.body.phoneCountryCode || geoData?.phoneCountryCode || undefined,
                organisation: { connect: { id: orgId } },
                branch: currentUser.branchId ? { connect: { id: currentUser.branchId } } : (branchId ? { connect: { id: branchId } } : undefined),
                // Assign to creator by default, or to specified user
                assignedTo: { connect: { id: leadOwnerId } },
                source: req.body.source as LeadSource || LeadSource.manual,
                status: req.body.status as LeadStatus || LeadStatus.new,
                potentialValue: req.body.potentialValue ? parseFloat(req.body.potentialValue) : 0,
                createdBy: { connect: { id: currentUser.id } } // Track creator for visibility
            }
        });

        // 3a. Handle Products if provided (products field is optional)
        if (req.body.products !== undefined && Array.isArray(req.body.products)) {
            const productItems = req.body.products;
            let totalValue = 0;

            // Only process if products array is not empty
            if (productItems.length > 0) {
                for (const item of productItems) {
                    // Validate that productId exists
                    if (!item.productId) {
                        continue; // Skip invalid items
                    }

                    const product = await prisma.product.findUnique({ where: { id: item.productId } });
                    if (product) {
                        const price = product.basePrice || 0;
                        const quantity = item.quantity || 1;
                        totalValue += price * quantity;

                        await prisma.leadProduct.create({
                            data: {
                                leadId: lead.id,
                                productId: item.productId,
                                quantity: quantity,
                                price: price
                            }
                        });
                    }
                }

                // Update lead with calculated value if products were added
                if (totalValue > 0) {
                    await prisma.lead.update({
                        where: { id: lead.id },
                        data: { potentialValue: totalValue }
                    });
                    lead.potentialValue = totalValue; // Update local obj for response
                }
            }
        }

        // Audit Log
        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'CREATE_LEAD',
                entity: 'Lead',
                entityId: lead.id,
                actorId: (req as any).user.id,
                organisationId: orgId,
                details: { name: `${lead.firstName} ${lead.lastName || ''}`.trim(), company: lead.company }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        // Enable Distribution only if no explicit assignment was made
        // This allows assignment rules to work for automated leads, but respects manual assignments
        if (!assignedTo) {
            await DistributionService.assignLead(lead, orgId);
        }

        // Trigger Workflow Engine for lead creation
        try {
            await WorkflowEngine.evaluate('Lead', 'created', lead, orgId);
            import('../services/webhookService').then(({ WebhookService }) => {
                WebhookService.triggerEvent('lead.created', lead, orgId).catch(console.error);
            });
            // AI Scoring
            import('../services/leadScoringService').then(({ LeadScoringService }) => {
                LeadScoringService.scoreLead(lead.id).catch(console.error);
            });
            // Goal Automation
            import('../services/goalService').then(({ GoalService }) => {
                const assignedId = lead.assignedToId;
                if (assignedId) {
                    GoalService.updateProgressForUser(assignedId, 'leads').catch(console.error);
                }
            });

            // Meta Conversion API: New Lead
            import('../services/metaConversionService').then(({ MetaConversionService }) => {
                MetaConversionService.sendEvent(orgId, {
                    eventName: 'Lead',
                    userData: {
                        email: lead.email,
                        phone: lead.phone,
                        firstName: lead.firstName,
                        lastName: lead.lastName,
                        externalId: lead.id
                    },
                    actionSource: 'system_generated' // or website if we knew source url
                }).catch(console.error);
            });
        } catch (workflowErr) {
            console.error('WorkflowEngine error:', workflowErr);
            // Don't fail the request if workflow fails
        }

        res.status(201).json(lead);
    } catch (error: any) {
        console.error('createLead Error:', error);

        // Handle Prisma Unique Constraint Errors (e.g., P2002)
        if (error.code === 'P2002') {
            const target = error.meta?.target || [];
            if (target.includes('phone')) {
                return res.status(400).json({
                    message: 'A lead with this phone number already exists in your organisation.'
                });
            }
            if (target.includes('email')) {
                return res.status(400).json({
                    message: 'A lead with this email address already exists in your organisation.'
                });
            }
            return res.status(400).json({
                message: 'A lead with these details already exists in your organisation.'
            });
        }

        res.status(400).json({ message: (error as Error).message });
    }
};

export const getLeadById = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        const where: any = { id: req.params.id, isDeleted: false };

        // Organization scoping
        if (user.isSuperAdmin || isSuperAdmin(user)) {
            // Super admins can see any lead
        } else {
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;

            // Apply role-based visibility for non-admins
            if (!isAdmin(user)) {
                // Get user's role to determine visibility rules
                // Handle both UUID-based roles (new) and string-based roles (legacy)
                let roleName = '';

                const userRole = await prisma.role.findFirst({
                    where: {
                        OR: [
                            { id: user.role },
                            { roleKey: user.role, organisationId: user.organisationId },
                            { roleKey: user.role, organisationId: null }
                        ]
                    }
                });

                if (userRole) {
                    roleName = userRole.name;
                } else {
                    // Fallback to legacy string-based role
                    roleName = user.role.split('_').map((word: string) =>
                        word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ');
                }

                // Sales Reps: Only see leads assigned to them or created by them
                if (roleName === 'Sales Rep') {
                    where.OR = [
                        { assignedToId: user.id },
                        { AND: [{ createdById: user.id }, { assignedToId: null }] }
                    ];
                } else {
                    // Managers: Only see leads assigned to them or their direct subordinates
                    const subordinateIds = await getSubordinateIds(user.id);
                    where.OR = [
                        { assignedToId: user.id },
                        { assignedToId: { in: subordinateIds.filter(id => id !== user.id) } },
                        { AND: [{ createdById: user.id }, { assignedToId: null }] }
                    ];
                }
            }
        }

        const lead = await prisma.lead.findFirst({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true, email: true } },
                products: { include: { product: true } }
            }
        });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });
        res.json(lead);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateLead = async (req: Request, res: Response) => {
    try {
        const updates = { ...req.body };
        const leadId = req.params.id;
        const requester = (req as any).user;
        let historyData: any = null;

        // Fetch current lead to check for ownership change
        const currentLead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!currentLead) return res.status(404).json({ message: 'Lead not found' });

        // Hierarchy Check
        if (updates.assignedToId || updates.assignedTo) { // Handle payload differences
            const targetUserId = updates.assignedToId || updates.assignedTo; // Assuming ID string

            if (!requester.isSuperAdmin && !isSuperAdmin(requester) && !isAdmin(requester)) {
                const allowedIds = await getVisibleUserIds(requester.id);

                // If passing an object (legacy), extract ID?? Usually frontend sends ID string for update.
                // Let's assume ID string.
                if (typeof targetUserId === 'string' && !allowedIds.includes(targetUserId)) {
                    return res.status(403).json({ message: 'You can only assign leads to your subordinates.' });
                }
            }

            // Track History
            if (currentLead.assignedToId !== targetUserId) {
                historyData = {
                    leadId,
                    oldOwnerId: currentLead.assignedToId,
                    newOwnerId: targetUserId,
                    changedById: requester.id,
                    reason: req.body.reason || 'Manual Assignment'
                };
            }

            // Remap for Prisma - store the ID directly
            updates.assignedToId = targetUserId;
            delete updates.assignedTo; // Clean up the relation object

            // Notify new owner
            if (currentLead.assignedToId !== targetUserId) {
                const leadName = `${currentLead.firstName} ${currentLead.lastName || ''}`.trim();
                NotificationService.send(
                    targetUserId,
                    'New Lead Assigned',
                    `Lead "${leadName}" has been assigned to you by ${requester.firstName}.`,
                    'info'
                ).catch(console.error);
            }
        }

        // Track Status Change
        if (updates.status && updates.status !== currentLead.status) {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'LEAD_STATUS_CHANGE',
                entity: 'Lead',
                entityId: leadId,
                actorId: requester.id,
                organisationId: currentLead.organisationId,
                details: { oldStatus: currentLead.status, newStatus: updates.status }
            });
        }

        // Track Follow-up Change and Create Task
        if (updates.nextFollowUp) {
            // Create interaction log
            await prisma.interaction.create({
                data: {
                    leadId: leadId,
                    type: 'other',
                    subject: 'Follow-up Scheduled',
                    description: `Next follow-up scheduled for ${new Date(updates.nextFollowUp).toLocaleDateString()}`,
                    createdById: requester.id,
                    organisationId: currentLead.organisationId
                }
            });

            // Auto-create a follow-up task
            const leadName = `${currentLead.firstName} ${currentLead.lastName || ''}`.trim();
            const dueDate = new Date(updates.nextFollowUp);
            // Preserving time instead of normalizing to start of day

            // Check if a task already exists for this lead on this date
            const existingTask = await prisma.task.findFirst({
                where: {
                    leadId: leadId,
                    dueDate: dueDate,
                    isDeleted: false,
                    subject: { contains: 'Follow up' }
                }
            });

            // Only create if no existing task
            if (!existingTask) {
                await prisma.task.create({
                    data: {
                        subject: `Follow up with ${leadName}`,
                        description: `Follow-up scheduled for ${leadName} from ${currentLead.company || 'Unknown Company'}`,
                        status: 'not_started',
                        priority: 'medium',
                        dueDate: dueDate,
                        createdBy: { connect: { id: requester.id } },
                        organisation: { connect: { id: currentLead.organisationId } },
                        lead: { connect: { id: leadId } },
                        // Assign to the newly assigned user, the existing assigned user, or the requester
                        ...(updates.assignedToId
                            ? { assignedTo: { connect: { id: updates.assignedToId } } }
                            : currentLead.assignedToId
                                ? { assignedTo: { connect: { id: currentLead.assignedToId } } }
                                : { assignedTo: { connect: { id: requester.id } } }
                        ),
                        ...(currentLead.branchId ? { branch: { connect: { id: currentLead.branchId } } } : {})
                    }
                });
            }
        }

        if (updates.customFields) {
            const { CustomFieldValidationService } = await import('../services/customFieldValidationService');
            await CustomFieldValidationService.validateFields('Lead', currentLead.organisationId, updates.customFields);
        }

        const whereObj: any = { id: leadId, isDeleted: false };
        if (requester.role !== 'super_admin') {
            const orgId = getOrgId(requester);
            if (!orgId) return res.status(403).json({ message: 'No org' });
            whereObj.organisationId = orgId;
            // Don't filter by branchId on update - users can update leads across branches if they have access
        }

        // List of allowed fields to prevent relation/schema mismatches crashing Prisma
        const allowedFields = [
            'firstName', 'lastName', 'email', 'phone', 'secondaryPhone', 'company', 'enquiryAbout', 'jobTitle', 'address',
            'status', 'source', 'sourceDetails', 'stage', 'tags', 'potentialValue',
            'nextFollowUp', 'customFields', 'isHotLead', 'lostReason', 'notes',
            'country', 'countryCode', 'phoneCountryCode', 'city', 'state', 'zip'
        ];

        const leadUpdates: any = {};
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                leadUpdates[field] = updates[field];
            }
        });

        // Add special handling for relation IDs if they are strings (Prisma connect is handled above)
        if (updates.assignedToId) leadUpdates.assignedToId = updates.assignedToId;
        if (updates.branchId) leadUpdates.branchId = updates.branchId;

        // Update Lead Basic Info
        const [lead] = await prisma.$transaction([
            prisma.lead.update({
                where: whereObj,
                data: leadUpdates,
                include: { assignedTo: { select: { firstName: true, lastName: true, email: true } } }
            }),
            ...(historyData ? [prisma.leadHistory.create({ data: historyData })] : [])
        ]);

        let finalLead = lead;

        // Handle Products Update (products field is optional)
        if (req.body.products !== undefined && Array.isArray(req.body.products)) {
            const productItems = req.body.products;

            // 1. Clear existing products (simplest approach for full replace)
            await prisma.leadProduct.deleteMany({ where: { leadId } });

            // 2. Add new products and calculate value (only if products array is not empty)
            let totalValue = 0;

            if (productItems.length > 0) {
                for (const item of productItems) {
                    // Validate that productId exists
                    if (!item.productId) {
                        continue; // Skip invalid items
                    }

                    const product = await prisma.product.findUnique({ where: { id: item.productId } });
                    if (product) {
                        const price = product.basePrice || 0;
                        const quantity = item.quantity || 1;
                        totalValue += price * quantity;

                        await prisma.leadProduct.create({
                            data: {
                                leadId,
                                productId: item.productId,
                                quantity: quantity,
                                price: price
                            }
                        });
                    }
                }
            }

            // 3. Update Lead Value
            finalLead = await prisma.lead.update({
                where: { id: leadId },
                data: { potentialValue: totalValue },
                include: {
                    assignedTo: { select: { firstName: true, lastName: true, email: true } },
                    products: { include: { product: true } }
                }
            });

            // Log History for Value Change
            if (currentLead.potentialValue !== totalValue) {
                await prisma.leadHistory.create({
                    data: {
                        leadId,
                        changedById: requester.id,
                        fieldName: 'potentialValue',
                        oldValue: currentLead.potentialValue?.toString() || '0',
                        newValue: totalValue.toString()
                    }
                });
            }
        }

        // Audit Log for update
        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'UPDATE_LEAD',
                entity: 'Lead',
                entityId: leadId,
                actorId: requester.id,
                organisationId: currentLead.organisationId,
                details: { name: `${currentLead.firstName} ${currentLead.lastName || ''}`.trim(), updatedFields: Object.keys(updates) }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.json(finalLead);

        // Webhook
        import('../services/webhookService').then(({ WebhookService }) => {
            WebhookService.triggerEvent('lead.updated', lead, lead.organisationId).catch(console.error);
        });

        // AI Scoring Trigger (if relevant fields changed)
        if (updates.jobTitle || updates.company || updates.email || updates.phone) {
            import('../services/leadScoringService').then(({ LeadScoringService }) => {
                LeadScoringService.scoreLead(leadId).catch(console.error);
            });
        }

        // Hierarchy Notification
        import('../services/notificationService').then(({ NotificationService }) => {
            const leadName = `${finalLead.firstName} ${finalLead.lastName || ''}`.trim();
            NotificationService.sendToHierarchy(
                requester.id,
                'Lead Updated',
                `${requester.firstName} updated lead: ${leadName}`,
                'info'
            ).catch(console.error);
        });

    } catch (error) {
        console.error('[updateLead] Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

export const deleteLead = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const leadId = req.params.id;

        // Role Check
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to delete leads' });
        }

        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Org Check
        if (user.role !== 'super_admin') {
            const userOrgId = getOrgId(user);
            if (lead.organisationId !== userOrgId) {
                return res.status(403).json({ message: 'Not authorized to delete this lead' });
            }
        }

        await prisma.$transaction([
            prisma.lead.update({
                where: { id: leadId },
                data: { isDeleted: true }
            }),
            // Cascade delete related entities
            prisma.contact.updateMany({
                where: { leadId: leadId },
                data: { isDeleted: true }
            }),
            prisma.account.updateMany({
                where: { leadId: leadId },
                data: { isDeleted: true }
            }),
            prisma.opportunity.updateMany({
                where: { leadId: leadId },
                data: { isDeleted: true }
            })
        ]);

        // Audit Log
        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'DELETE_LEAD',
                entity: 'Lead',
                entityId: leadId,
                actorId: user.id,
                organisationId: lead.organisationId,
                details: { name: `${lead.firstName} ${lead.lastName || ''}`.trim() }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.json({ message: 'Lead deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createBulkLeads = async (req: Request, res: Response) => {
    try {
        const { leads, assignmentRuleId, applyAssignmentRules } = req.body;
        const user = (req as any).user;

        // Support both direct array (legacy) and object with options
        const leadsData = Array.isArray(req.body) ? req.body : leads;
        const ruleId = Array.isArray(req.body) ? undefined : assignmentRuleId;
        const applyRules = Array.isArray(req.body) ? true : (applyAssignmentRules !== false); // Default to true if not explicitly false

        console.log('[createBulkLeads] Received:', leadsData?.length || 0, 'leads', 'RuleID:', ruleId);

        if (!Array.isArray(leadsData) || leadsData.length === 0) {
            return res.status(400).json({ message: 'Invalid input' });
        }

        // Map data
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const { AssignmentRuleService } = await import('../services/assignmentRuleService');
        const { GeoLocationService } = await import('../services/geoLocationService');
        let createdCount = 0;
        let duplicateCount = 0;
        let reEnquiryCount = 0;
        const errors: any[] = [];

        for (const l of leadsData) {
            try {
                // Sanitize phone
                let cleanPhone = l.phone?.toString().replace(/\D/g, '') || '';
                if (cleanPhone.length > 10) {
                    cleanPhone = cleanPhone.slice(-10);
                }

                // Check for duplicates
                const DuplicateLeadService = (await import('../services/duplicateLeadService')).default;
                const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, l.email, orgId, l.branchId || user.branchId || undefined);

                if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                    // Handle as re-enquiry
                    await DuplicateLeadService.handleReEnquiry(
                        duplicateCheck.existingLead,
                        {
                            firstName: l.firstName,
                            lastName: l.lastName || '',
                            email: l.email,
                            phone: cleanPhone,
                            company: l.company,
                            enquiryAbout: l.enquiryAbout,
                            source: l.source || 'import',
                            sourceDetails: l.sourceDetails
                        },
                        orgId
                    );
                    reEnquiryCount++;
                    continue;
                }

                // Try to detect country from phone if not provided
                let geoData = null;
                if (!l.country && !l.countryCode && cleanPhone) {
                    geoData = GeoLocationService.detectCountryFromPhone(cleanPhone);
                }

                // Determine final owner
                let finalOwnerId = l.assignedTo;

                // If no owner specified, apply assignment rules
                if (!finalOwnerId && applyRules) {
                    finalOwnerId = await AssignmentRuleService.assignLead(
                        l,
                        orgId,
                        l.branchId || user.branchId || undefined,
                        ruleId,
                        user.id // Importer fallback
                    ) || undefined;
                }

                const data: any = {
                    firstName: l.firstName,
                    lastName: l.lastName || '',
                    phone: cleanPhone,
                    email: l.email,
                    company: l.company,
                    country: l.country || geoData?.country || undefined,
                    countryCode: l.countryCode || geoData?.countryCode || undefined,
                    phoneCountryCode: l.phoneCountryCode || geoData?.phoneCountryCode || undefined,
                    organisation: { connect: { id: orgId } },
                    source: l.source || LeadSource.import,
                    status: l.status || LeadStatus.new,
                    leadScore: l.leadScore ? parseInt(l.leadScore.toString()) : 0,
                    stage: l.stage || undefined,
                    createdBy: { connect: { id: user.id } }
                };

                // Connect to branch if available
                const finalBranchId = l.branchId || user.branchId;
                if (finalBranchId) {
                    data.branch = { connect: { id: finalBranchId } };
                }

                // Connect to assigned user if determined
                // If finalOwnerId is null (e.g., no rule matched), it creates an unassigned lead 
                // (or you can fallback to the importer: user.id)
                // We'll fallback to user (the importer) if no rule matched and no manual assignment.
                const finalAssignedTo = finalOwnerId || user.id;
                if (finalAssignedTo) {
                    data.assignedTo = { connect: { id: finalAssignedTo } };
                }

                console.log('[createBulkLeads] Creating lead:', data.firstName, data.phone, 'Assigned to:', finalAssignedTo);

                const lead = await prisma.lead.create({ data });

                // AI Scoring
                import('../services/leadScoringService').then(({ LeadScoringService }) => {
                    LeadScoringService.scoreLead(lead.id).catch(console.error);
                });

                createdCount++;
            } catch (error: any) {
                console.error('[createBulkLeads] Error creating lead:', error.message, 'Lead data:', l);
                errors.push({ lead: l, error: error.message });
                duplicateCount++;
            }
        }

        console.log('[createBulkLeads] Results:', { created: createdCount, reEnquiries: reEnquiryCount, duplicates: duplicateCount, errors: errors.length });

        res.status(201).json({
            message: `Bulk import completed`,
            created: createdCount,
            reEnquiries: reEnquiryCount,
            duplicates: duplicateCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const bulkAssignLeads = async (req: Request, res: Response) => {
    try {
        const { leadIds, assignedTo, reason } = req.body;
        const requester = (req as any).user;

        if (requester.role !== 'super_admin' && requester.role !== 'admin') {
            const allowedIds = await getVisibleUserIds(requester.id);
            if (!allowedIds.includes(assignedTo)) {
                return res.status(403).json({ message: 'Forbidden assignment' });
            }
        }

        // Fetch current leads to track old owners
        const currentLeads = await prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, assignedToId: true }
        });

        // Update leads
        const result = await prisma.lead.updateMany({
            where: { id: { in: leadIds } },
            data: { assignedToId: assignedTo }
        });

        // Create history records for each lead
        const historyRecords = currentLeads.map(lead => ({
            leadId: lead.id,
            oldOwnerId: lead.assignedToId,
            newOwnerId: assignedTo,
            changedById: requester.id,
            reason: reason || 'Bulk Assignment'
        }));

        if (historyRecords.length > 0) {
            await prisma.leadHistory.createMany({
                data: historyRecords
            });
        }

        res.json({ message: 'Assigned successfully', count: result.count });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const convertLead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const leadId = id;

        const { dealName, amount, accountId } = req.body;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'No organisation context' });

        const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            include: {
                organisation: true,
                products: { include: { product: true } }
            }
        });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        if (lead.status === LeadStatus.converted) {
            return res.status(400).json({ message: 'Lead already converted' });
        }

        // Calculate opportunity amount from lead products if not provided
        let opportunityAmount = Number(amount) || 0;

        // If no amount provided, use lead's potentialValue or calculate from products
        if (!amount || opportunityAmount === 0) {
            if (lead.potentialValue && lead.potentialValue > 0) {
                console.log(`[convertLead] Using potentialValue ${lead.potentialValue} as fallback for amount`);
                opportunityAmount = lead.potentialValue;
            } else if (lead.products && lead.products.length > 0) {
                // Calculate from products
                opportunityAmount = lead.products.reduce((total, item) => {
                    return total + (item.price * item.quantity);
                }, 0);
                console.log(`[convertLead] Using product sum ${opportunityAmount} as fallback for amount`);
            }
        }

        // 0. Limit Check
        const org = lead.organisation;
        if (org.contactLimit > 0) {
            const contactCount = await prisma.contact.count({
                where: { organisationId: orgId, isDeleted: false }
            });
            if (contactCount >= org.contactLimit) {
                return res.status(403).json({
                    message: `Contact limit reached (${org.contactLimit}). Please upgrade your plan.`,
                    code: 'LIMIT_EXCEEDED',
                    limit: org.contactLimit
                });
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Handle Account
            let targetAccountId = accountId;
            let account;

            if (targetAccountId) {
                account = await tx.account.findUnique({ where: { id: targetAccountId } });
                if (!account) throw new Error('Target account not found');
            } else {
                // Create new Account
                account = await tx.account.create({
                    data: {
                        name: lead.company || `${lead.firstName} ${lead.lastName || ''}`.trim(),
                        organisationId: orgId,
                        ownerId: user.id, // Assign to converter
                        type: 'customer',
                        phone: lead.phone,
                        address: lead.address as any,
                        leadId: lead.id, // Link to original lead
                        branchId: lead.branchId
                    }
                });
                targetAccountId = account.id;
            }

            // 2. Create Contact
            const contact = await tx.contact.create({
                data: {
                    firstName: lead.firstName,
                    lastName: lead.lastName || '',
                    email: lead.email,
                    phones: lead.phone ? [{ type: 'mobile', number: lead.phone }] : [],
                    jobTitle: lead.jobTitle,
                    organisationId: orgId,
                    ownerId: user.id,
                    accountId: targetAccountId,
                    address: lead.address as any,
                    customFields: lead.customFields as any, // Migrate custom fields
                    leadId: lead.id, // Link to original lead
                    branchId: lead.branchId
                }
            });

            // 3. Create Opportunity
            const opportunity = await tx.opportunity.create({
                data: {
                    name: dealName || `Deal - ${lead.company || lead.lastName || lead.firstName}`,
                    amount: opportunityAmount,
                    stage: 'new',
                    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
                    organisationId: orgId,
                    ownerId: user.id,
                    accountId: targetAccountId,
                    leadId: lead.id,
                    branchId: lead.branchId,
                    contacts: { connect: { id: contact.id } }
                }
            });

            // 4. Migrate Products from Lead to Account
            const leadProducts = await tx.leadProduct.findMany({
                where: { leadId: leadId },
                include: { product: true }
            });

            if (leadProducts.length > 0) {
                // Create AccountProduct entries for each LeadProduct
                for (const leadProduct of leadProducts) {
                    await tx.accountProduct.create({
                        data: {
                            accountId: targetAccountId,
                            productId: leadProduct.productId,
                            organisationId: orgId,
                            quantity: leadProduct.quantity,
                            purchaseDate: new Date(),
                            status: 'active',
                            notes: `Converted from lead: ${lead.firstName} ${lead.lastName || ''}`.trim()
                        }
                    });
                }
            }

            // 5. Update Lead
            const updatedLead = await tx.lead.update({
                where: { id: leadId },
                data: {
                    status: LeadStatus.converted
                }
            });

            // 6. Migrate Interactions
            await tx.interaction.updateMany({
                where: { leadId: leadId },
                data: {
                    contactId: contact.id,
                    accountId: targetAccountId
                }
            });

            // 7. Migrate WhatsApp Messages
            await tx.whatsAppMessage.updateMany({
                where: { leadId: leadId },
                data: {
                    contactId: contact.id
                }
            });

            // 8. Migrate Tasks
            await tx.task.updateMany({
                where: { leadId: leadId },
                data: {
                    leadId: null, // Unlink from lead
                    contactId: contact.id,
                    accountId: targetAccountId
                }
            });

            return { account, contact, opportunity, lead: updatedLead, migratedProducts: leadProducts.length };
        });

        // Audit Log for conversion
        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'CONVERT_LEAD',
                entity: 'Lead',
                entityId: leadId,
                actorId: user.id,
                organisationId: orgId,
                details: {
                    name: `${lead.firstName} ${lead.lastName || ''}`.trim(),
                    company: lead.company,
                    accountId: result.account.id,
                    contactId: result.contact.id,
                    opportunityId: result.opportunity.id,
                    migratedProducts: result.migratedProducts
                }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.json({
            message: 'Lead converted successfully',
            data: result
        });

    } catch (error) {
        console.error('Lead conversion error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

import fs from 'fs';
import path from 'path';

const logDebug = (msg: string) => {
    try {
        const logPath = path.join(__dirname, '../../debug_crash.log');
        fs.appendFileSync(logPath, `${new Date().toISOString()} - [Leads] ${msg}\n`);
    } catch (e) {
        console.error('Failed to write log', e);
    }
};

export const getViolations = async (req: Request, res: Response) => {
    try {
        logDebug('Entered getViolations');
        const user = (req as any).user;
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        logDebug(`User: ${user?.id}, Role: ${user?.role}`);

        // User sees violations where they were the PREVIOUS owner (the one who failed)
        // OR if they are a manager, seeing violations of their subordinates?
        // Prompt says "user and their managers need to give an explanation".

        const where: any = {
            rotationViolation: true,
            isDeleted: false,
        };

        if (user.role !== 'super_admin') {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;

            let visibleUserIds: string[] = [];
            try {
                logDebug('Fetching visible users...');
                visibleUserIds = await getVisibleUserIds(user.id);
                logDebug(`Visible users found: ${visibleUserIds.length}`);
            } catch (subError) {
                logDebug(`Error fetching visible users: ${(subError as Error).message}`);
                console.error('[getViolations] Error fetching visible users:', subError);
                visibleUserIds = [user.id];
            }

            where.previousOwnerId = { in: visibleUserIds };
        }

        logDebug(`[Leads] Querying Prisma with where: ${JSON.stringify(where)}`);
        const violations = await prisma.lead.findMany({
            where,
            include: {
                previousOwner: { select: { firstName: true, lastName: true } },
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { violationTime: 'desc' }
        });

        logDebug(`[Leads] Violations found: ${violations.length}`);

        const total = await prisma.lead.count({ where });
        res.json({ violations, page, pages: Math.ceil(total / pageSize), total });

    } catch (error) {
        logDebug(`getViolations CRASHED: ${(error as Error).message}\nStack: ${(error as Error).stack}`);
        console.error('[getViolations] Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getLeadHistory = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as any).user;

        // Verify access (simple org check)
        const lead = await prisma.lead.findUnique({ where: { id } });
        const orgId = getOrgId(user);

        if (!lead || (orgId && lead.organisationId !== orgId && user.role !== 'super_admin')) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const history = await prisma.leadHistory.findMany({
            where: { leadId: id },
            include: {
                oldOwner: { select: { firstName: true, lastName: true } },
                newOwner: { select: { firstName: true, lastName: true } },
                changedBy: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(history);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};


export const submitExplanation = async (req: Request, res: Response) => {
    try {
        const { leadId, explanation, type } = req.body; // type = 'user' | 'manager'
        const user = (req as any).user;

        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        if (!lead.rotationViolation) {
            return res.status(400).json({ message: 'This lead is not flagged for violation' });
        }

        const data: any = {};

        if (type === 'user') {
            if (lead.previousOwnerId !== user.id && !isAdmin(user) && !user.isSuperAdmin) {
                return res.status(403).json({ message: 'Only the previous owner can submit a user explanation' });
            }
            data.userExplanation = explanation;
        } else if (type === 'manager') {
            // Check if user is manager of previousOwner
            // Ideally we check hierarchy properly.
            // For MVP, if user is admin or has subordinates including previousOwner
            const userRole = await prisma.role.findFirst({
                where: {
                    OR: [
                        { id: user.role },
                        { roleKey: user.role, organisationId: user.organisationId },
                        { roleKey: user.role, organisationId: null }
                    ]
                }
            });
            if (userRole && userRole.name === 'Sales Rep') {
                return res.status(403).json({ message: 'Sales reps cannot submit manager explanations' });
            }
            data.managerExplanation = explanation;
        } else {
            return res.status(400).json({ message: 'Invalid explanation type' });
        }

        const updatedLead = await prisma.lead.update({
            where: { id: leadId },
            data
        });

        res.json(updatedLead);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getPendingFollowUpsCount = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const now = new Date();
        const endOfToday = new Date(now.setHours(23, 59, 59, 999));

        const where: any = {
            nextFollowUp: { lte: endOfToday },
            status: { not: LeadStatus.converted },
            isDeleted: false
        };

        if (user.role !== 'super_admin') {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }

        // Daily Briefing is personal
        where.assignedToId = user.id;

        const leads = await prisma.lead.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                nextFollowUp: true,
                company: true
            },
            orderBy: { nextFollowUp: 'asc' }
        });

        res.json({ count: leads.length, leads });
    } catch (error) {
        console.error('[getPendingFollowUpsCount] Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const generateAIResponse = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { context } = req.body; // e.g. "Draft an intro email"

        const lead = await prisma.lead.findUnique({ where: { id } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Lazy load OpenAI
        const { OpenAI } = await import('openai');
        if (!process.env.OPENAI_API_KEY) {
            return res.json({ draft: `[Mock AI Draft]\n\nHi ${lead.firstName},\n\nI noticed you work at ${lead.company}. We'd love to chat.\n\nBest,\n[Your Name]` });
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful sales assistant. Draft a short, professional email." },
                { role: "user", content: `Lead: ${lead.firstName} ${lead.lastName} from ${lead.company}. Title: ${lead.jobTitle}. Context: ${context || 'Introduction'}` }
            ],
        });

        res.json({ draft: completion.choices[0].message.content });

    } catch (error) {
        console.error('[generateAIResponse] Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};



// GET /api/leads/re-enquiries - Get all re-enquiry leads
export const getReEnquiryLeads = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId((req as any).user);
        if (!orgId) return res.status(403).json({ message: 'No organisation context' });

        const DuplicateLeadService = (await import('../services/duplicateLeadService')).default;
        const reEnquiryLeads = await DuplicateLeadService.getReEnquiryLeads(orgId);

        res.json({
            leads: reEnquiryLeads,
            count: reEnquiryLeads.length
        });
    } catch (error) {
        console.error('getReEnquiryLeads Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// GET /api/leads/duplicates - Find all duplicate leads
export const getDuplicateLeads = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId((req as any).user);
        if (!orgId) return res.status(403).json({ message: 'No organisation context' });

        const DuplicateLeadService = (await import('../services/duplicateLeadService')).default;
        const duplicates = await DuplicateLeadService.findDuplicates(orgId);

        res.json({
            duplicates,
            count: duplicates.length
        });
    } catch (error) {
        console.error('getDuplicateLeads Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
