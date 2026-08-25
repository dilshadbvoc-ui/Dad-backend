import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { isSuperAdmin as checkSuperAdmin } from '../utils/roleUtils';
import { NotificationService } from '../services/notificationService';

const AUTHOR_SELECT = { id: true, firstName: true, lastName: true, email: true, profileImage: true, role: true };

const VALID_ISSUE_TYPES = ['bug', 'feature_request', 'question', 'other'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// Any authenticated user can report an issue about the CRM itself, from any org.
export const createIssue = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation context' });

        const { title, description, issueType, priority, attachments } = req.body;
        if (!title || !String(title).trim()) return res.status(400).json({ message: 'Title is required' });
        if (!description || !String(description).trim()) return res.status(400).json({ message: 'Description is required' });

        const issue = await prisma.issueReport.create({
            data: {
                title: String(title).trim(),
                description: String(description).trim(),
                issueType: VALID_ISSUE_TYPES.includes(issueType) ? issueType : 'bug',
                priority: VALID_PRIORITIES.includes(priority) ? priority : 'medium',
                attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined,
                organisationId: orgId,
                reportedById: user.id
            },
            include: { reportedBy: { select: AUTHOR_SELECT } }
        });

        res.status(201).json(issue);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

// The reporter's own issues, most recent first.
export const getMyIssues = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation context' });

        const issues = await prisma.issueReport.findMany({
            where: { organisationId: orgId, reportedById: user.id, isDeleted: false },
            include: {
                reportedBy: { select: AUTHOR_SELECT },
                _count: { select: { replies: true } }
            },
            orderBy: { updatedAt: 'desc' }
        });

        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Cross-organisation — platform super admin only.
export const getAllIssuesForAdmin = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!checkSuperAdmin(user)) {
            return res.status(403).json({ message: 'Not authorized — super admin access required' });
        }

        const { status } = req.query;
        const where: any = { isDeleted: false };
        if (status && VALID_STATUSES.includes(status as string)) where.status = status;

        const issues = await prisma.issueReport.findMany({
            where,
            include: {
                reportedBy: { select: AUTHOR_SELECT },
                organisation: { select: { id: true, name: true } },
                _count: { select: { replies: true } }
            },
            orderBy: { updatedAt: 'desc' }
        });

        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Fetch a single issue with its full reply thread — the reporter or the super admin only.
export const getIssueById = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        const issue = await prisma.issueReport.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: {
                reportedBy: { select: AUTHOR_SELECT },
                organisation: { select: { id: true, name: true } },
                replies: {
                    include: { author: { select: AUTHOR_SELECT } },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!issue) return res.status(404).json({ message: 'Issue not found' });

        const isOwner = issue.reportedById === user.id && issue.organisationId === orgId;
        if (!isOwner && !checkSuperAdmin(user)) {
            return res.status(403).json({ message: 'Not authorized to view this issue' });
        }

        res.json(issue);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Add a reply — either the original reporter or the super admin. Both sides of the
// thread use this single endpoint; `isFromAdmin` is derived server-side, never trusted
// from the client.
export const addReply = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const { message, attachments } = req.body;

        if (!message || !String(message).trim()) {
            return res.status(400).json({ message: 'Reply message is required' });
        }

        const issue = await prisma.issueReport.findFirst({
            where: { id: req.params.id, isDeleted: false }
        });
        if (!issue) return res.status(404).json({ message: 'Issue not found' });

        const isOwner = issue.reportedById === user.id && issue.organisationId === orgId;
        const isSuperAdminUser = checkSuperAdmin(user);
        if (!isOwner && !isSuperAdminUser) {
            return res.status(403).json({ message: 'Not authorized to reply to this issue' });
        }

        // A closed issue is final — neither side can add further replies. The admin
        // has to explicitly reopen it (status change) before the conversation can
        // continue; this also keeps the retention cleanup timeline (see
        // issueCleanupService.ts) meaningful, since closedAt stops moving once locked.
        if (issue.status === 'closed') {
            return res.status(400).json({ message: 'This issue is closed and no longer accepting replies.' });
        }

        const reply = await prisma.issueReply.create({
            data: {
                issueId: issue.id,
                authorId: user.id,
                message: String(message).trim(),
                attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined,
                isFromAdmin: isSuperAdminUser
            },
            include: { author: { select: AUTHOR_SELECT } }
        });

        // Bump the issue so it re-sorts to the top of whichever list is showing it,
        // and re-open it if the admin had marked it resolved and the reporter is
        // following up again. 'closed' is excluded — that's blocked above entirely.
        await prisma.issueReport.update({
            where: { id: issue.id },
            data: {
                updatedAt: new Date(),
                status: (!isSuperAdminUser && issue.status === 'resolved') ? 'open' : undefined
            }
        });

        // Notify whichever side didn't just write the reply.
        try {
            if (isSuperAdminUser) {
                await NotificationService.send(
                    issue.reportedById,
                    'Reply to your issue report',
                    `An admin replied to "${issue.title}"`,
                    'info'
                );
            } else {
                const superAdmins = await prisma.user.findMany({
                    where: { role: 'super_admin', isActive: true },
                    select: { id: true }
                });
                await Promise.all(superAdmins.map(a =>
                    NotificationService.send(a.id, 'New reply on an issue report', `"${issue.title}" has a new reply`, 'info')
                ));
            }
        } catch (notifyErr) {
            console.error('[IssueController] Failed to send reply notification:', notifyErr);
        }

        res.status(201).json(reply);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

// Super admin only — change an issue's status.
export const updateIssueStatus = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!checkSuperAdmin(user)) {
            return res.status(403).json({ message: 'Not authorized — super admin access required' });
        }

        const { status } = req.body;
        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ message: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
        }

        const issue = await prisma.issueReport.findFirst({ where: { id: req.params.id, isDeleted: false } });
        if (!issue) return res.status(404).json({ message: 'Issue not found' });

        // closedAt anchors the retention cleanup schedule (attachments stripped after
        // 1 day, replies cleared after 1 week, the issue itself removed after 1 month —
        // see issueCleanupService.ts). Reopening clears it so a later re-close restarts
        // the clock cleanly.
        const updated = await prisma.issueReport.update({
            where: { id: req.params.id },
            data: {
                status,
                closedAt: status === 'closed' ? (issue.closedAt ?? new Date()) : null
            },
            include: { reportedBy: { select: AUTHOR_SELECT } }
        });

        try {
            await NotificationService.send(
                issue.reportedById,
                'Issue status updated',
                `"${issue.title}" is now ${status.replace('_', ' ')}`,
                'info'
            );
        } catch (notifyErr) {
            console.error('[IssueController] Failed to send status notification:', notifyErr);
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
