import { cronPrisma } from '../config/prisma';
import { Prisma } from '../generated/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTACHMENT_RETENTION_MS = 1 * DAY_MS;
const CHAT_RETENTION_MS = 7 * DAY_MS;
const ISSUE_RETENTION_MS = 30 * DAY_MS;

interface AttachmentLike {
    documentId?: string | null;
    url?: string | null;
    name: string;
    removed?: boolean;
}

function stripToPlaceholders(attachments: unknown): Prisma.InputJsonValue {
    if (!Array.isArray(attachments)) return [];
    return (attachments as AttachmentLike[]).map(a => ({ name: a.name, removed: true })) as unknown as Prisma.InputJsonValue;
}

function collectDocumentIds(attachments: unknown): string[] {
    if (!Array.isArray(attachments)) return [];
    return (attachments as AttachmentLike[])
        .filter(a => a && a.documentId && !a.removed)
        .map(a => a.documentId as string);
}

/**
 * Retention cleanup for closed issue reports, run once a day:
 *   1. Attachments — real file bytes deleted 1 day after closing, replaced with a
 *      lightweight placeholder ({name, removed: true}) so the thread still shows
 *      "a file was here" without holding onto the data.
 *   2. Chat history — the full reply thread is deleted 1 week after closing.
 *   3. The issue itself — removed entirely 1 month after closing.
 * Each stage is idempotent (checks whether there's still something to do), so a
 * missed run just gets caught on the next tick.
 */
export async function runIssueRetentionCleanup() {
    const now = Date.now();

    // --- Stage 1: strip attachments (>= 1 day closed) ---
    try {
        const attachmentCutoff = new Date(now - ATTACHMENT_RETENTION_MS);
        const issuesNeedingAttachmentCleanup = await cronPrisma.issueReport.findMany({
            where: {
                status: 'closed',
                closedAt: { lte: attachmentCutoff },
                isDeleted: false
            },
            select: {
                id: true,
                attachments: true,
                replies: { select: { id: true, attachments: true } }
            }
        });

        let strippedIssues = 0;
        let strippedReplies = 0;
        let deletedDocuments = 0;

        for (const issue of issuesNeedingAttachmentCleanup) {
            const issueDocIds = collectDocumentIds(issue.attachments);
            const replyDocIdPairs = issue.replies
                .map(r => ({ replyId: r.id, docIds: collectDocumentIds(r.attachments) }))
                .filter(r => r.docIds.length > 0);

            if (issueDocIds.length === 0 && replyDocIdPairs.length === 0) continue;

            const allDocIds = [...issueDocIds, ...replyDocIdPairs.flatMap(r => r.docIds)];
            if (allDocIds.length > 0) {
                const deleted = await cronPrisma.document.deleteMany({ where: { id: { in: allDocIds } } });
                deletedDocuments += deleted.count;
            }

            if (issueDocIds.length > 0) {
                await cronPrisma.issueReport.update({
                    where: { id: issue.id },
                    data: { attachments: stripToPlaceholders(issue.attachments) }
                });
                strippedIssues++;
            }

            for (const { replyId, docIds } of replyDocIdPairs) {
                if (docIds.length === 0) continue;
                const reply = issue.replies.find(r => r.id === replyId);
                await cronPrisma.issueReply.update({
                    where: { id: replyId },
                    data: { attachments: stripToPlaceholders(reply?.attachments) }
                });
                strippedReplies++;
            }
        }

        if (strippedIssues || strippedReplies || deletedDocuments) {
            console.log(`[Cron] Issue cleanup: stripped attachments on ${strippedIssues} issue(s) and ${strippedReplies} repl(y/ies), deleted ${deletedDocuments} document(s).`);
        }
    } catch (error) {
        console.error('[Cron] Error stripping issue attachments:', error);
    }

    // --- Stage 2: clear chat history (>= 1 week closed) ---
    try {
        const chatCutoff = new Date(now - CHAT_RETENTION_MS);
        const issuesNeedingChatClear = await cronPrisma.issueReport.findMany({
            where: {
                status: 'closed',
                closedAt: { lte: chatCutoff },
                isDeleted: false,
                replies: { some: {} }
            },
            select: { id: true }
        });

        if (issuesNeedingChatClear.length > 0) {
            const deleted = await cronPrisma.issueReply.deleteMany({
                where: { issueId: { in: issuesNeedingChatClear.map(i => i.id) } }
            });
            console.log(`[Cron] Issue cleanup: cleared chat history on ${issuesNeedingChatClear.length} issue(s), ${deleted.count} repl(y/ies) removed.`);
        }
    } catch (error) {
        console.error('[Cron] Error clearing issue chat history:', error);
    }

    // --- Stage 3: remove the issue entirely (>= 1 month closed) ---
    try {
        const issueCutoff = new Date(now - ISSUE_RETENTION_MS);
        const issuesToRemove = await cronPrisma.issueReport.findMany({
            where: {
                status: 'closed',
                closedAt: { lte: issueCutoff },
                isDeleted: false
            },
            select: { id: true, attachments: true }
        });

        if (issuesToRemove.length > 0) {
            // Safety net in case stage 1 somehow hasn't run for one of these yet —
            // never delete the row while a real file is still referenced.
            const remainingDocIds = issuesToRemove.flatMap(i => collectDocumentIds(i.attachments));
            if (remainingDocIds.length > 0) {
                await cronPrisma.document.deleteMany({ where: { id: { in: remainingDocIds } } });
            }

            const deleted = await cronPrisma.issueReport.deleteMany({
                where: { id: { in: issuesToRemove.map(i => i.id) } }
            });
            console.log(`[Cron] Issue cleanup: permanently removed ${deleted.count} closed issue(s) older than 1 month.`);
        }
    } catch (error) {
        console.error('[Cron] Error removing expired issues:', error);
    }
}
