import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { WhatsAppFlowEngine } from '../services/whatsAppFlowEngine';

export const getFlows = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const flows = await prisma.whatsAppFlow.findMany({
            where: { organisationId: orgId as string, isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: {
                whatsappAccount: { select: { id: true, phoneNumber: true, displayName: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { sessions: true } }
            }
        });

        res.json(flows);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getFlowById = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const flow = await prisma.whatsAppFlow.findFirst({
            where: { id: req.params.id, organisationId: orgId as string, isDeleted: false }
        });
        if (!flow) return res.status(404).json({ message: 'Flow not found' });

        res.json(flow);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createFlow = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const { name, description, whatsappAccountId, triggerType, triggerKeywords, nodes, edges, isActive } = req.body;
        if (!name) return res.status(400).json({ message: 'name is required' });

        const flow = await prisma.whatsAppFlow.create({
            data: {
                organisationId: orgId as string,
                name,
                description,
                whatsappAccountId: whatsappAccountId || undefined,
                triggerType: triggerType || 'keyword',
                triggerKeywords: triggerKeywords || [],
                nodes: nodes || [],
                edges: edges || [],
                isActive: isActive ?? false,
                createdById: user.id
            }
        });

        try {
            const { logAudit } = await import('../utils/auditLogger');
            logAudit({
                action: 'CREATE_WHATSAPP_FLOW',
                entity: 'WhatsAppFlow',
                entityId: flow.id,
                actorId: user.id,
                organisationId: orgId as string,
                details: { name: flow.name }
            });
        } catch (e) {
            console.error('Audit Log Error:', e);
        }

        res.status(201).json(flow);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateFlow = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const existing = await prisma.whatsAppFlow.findFirst({
            where: { id: req.params.id, organisationId: orgId as string, isDeleted: false }
        });
        if (!existing) return res.status(404).json({ message: 'Flow not found' });

        const { name, description, whatsappAccountId, triggerType, triggerKeywords, nodes, edges, isActive } = req.body;

        const flow = await prisma.whatsAppFlow.update({
            where: { id: existing.id },
            data: {
                name: name ?? undefined,
                description: description ?? undefined,
                whatsappAccountId: whatsappAccountId === null ? null : (whatsappAccountId ?? undefined),
                triggerType: triggerType ?? undefined,
                triggerKeywords: triggerKeywords ?? undefined,
                nodes: nodes ?? undefined,
                edges: edges ?? undefined,
                isActive: isActive ?? undefined
            }
        });

        res.json(flow);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteFlow = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const existing = await prisma.whatsAppFlow.findFirst({
            where: { id: req.params.id, organisationId: orgId as string, isDeleted: false }
        });
        if (!existing) return res.status(404).json({ message: 'Flow not found' });

        await prisma.whatsAppFlow.update({ where: { id: existing.id }, data: { isDeleted: true } });
        res.json({ message: 'Flow deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getFlowSessions = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const flow = await prisma.whatsAppFlow.findFirst({
            where: { id: req.params.id, organisationId: orgId as string, isDeleted: false }
        });
        if (!flow) return res.status(404).json({ message: 'Flow not found' });

        const sessions = await prisma.whatsAppFlowSession.findMany({
            where: { flowId: flow.id },
            orderBy: { startedAt: 'desc' },
            take: 100
        });

        const summary = {
            total: sessions.length,
            active: sessions.filter(s => s.status === 'active').length,
            completed: sessions.filter(s => s.status === 'completed').length,
            handedOff: sessions.filter(s => s.status === 'handed_off').length
        };

        res.json({ summary, sessions });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const testFlow = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const flow = await prisma.whatsAppFlow.findFirst({
            where: { id: req.params.id, organisationId: orgId as string, isDeleted: false }
        });
        if (!flow) return res.status(404).json({ message: 'Flow not found' });

        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ message: 'phoneNumber is required' });

        // End any prior active test session on this number for this flow so a
        // repeated "Test" click restarts cleanly instead of piling up sessions.
        await prisma.whatsAppFlowSession.updateMany({
            where: { flowId: flow.id, phoneNumber, status: 'active' },
            data: { status: 'expired' }
        });

        const session = await WhatsAppFlowEngine.startFlow(
            flow,
            phoneNumber,
            flow.whatsappAccountId,
            orgId as string
        );

        res.json({ message: 'Test flow started', sessionId: session?.id });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
