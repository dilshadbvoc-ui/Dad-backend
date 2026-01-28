import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getAssignmentRules = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        let orgId: string | undefined;

        if (user.role === 'super_admin') {
            orgId = (req.query.organisationId as string) || undefined;
        } else {
            orgId = getOrgId(user) || undefined;
            if (!orgId) return res.status(403).json({ message: 'User not associated with an organisation' });
        }

        const where: any = { isDeleted: false };
        if (orgId) where.organisationId = orgId;

        const rules = await prisma.assignmentRule.findMany({
            where,
            include: {
                targetManager: { select: { id: true, firstName: true, lastName: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } }
            },
            orderBy: { priority: 'asc' }
        });

        res.json({ assignmentRules: rules });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createAssignmentRule = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation' });

        const rule = await prisma.assignmentRule.create({
            data: {
                name: req.body.name,
                description: req.body.description,
                isActive: req.body.isActive ?? true,
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
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateAssignmentRule = async (req: Request, res: Response) => {
    try {
        const rule = await prisma.assignmentRule.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteAssignmentRule = async (req: Request, res: Response) => {
    try {
        await prisma.assignmentRule.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Assignment rule deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Get available rule types for UI
export const getRuleTypes = async (req: Request, res: Response) => {
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
