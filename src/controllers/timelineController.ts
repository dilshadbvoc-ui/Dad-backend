import { Request, Response } from 'express';
import prisma from '../config/prisma';

// Helper function to format action names
function getHumanReadableAction(action: string, entity: string): string {
    const actionMap: Record<string, string> = {
        'LOGIN': 'Logged in',
        'CREATE': `Created ${entity}`,
        'CREATE_LEAD': 'Created Lead',
        'CREATE_CONTACT': 'Created Contact',
        'CREATE_ACCOUNT': 'Created Account',
        'UPDATE': `Updated ${entity}`,
        'DELETE': `Deleted ${entity}`,
        'EXPORT': 'Exported Data',
        'LEAD_STATUS_CHANGE': 'Changed Lead Status',
        'BULK_IMPORT_COMPLETED': 'Completed Bulk Import'
    };

    return actionMap[action] || `${action.replace(/_/g, ' ')} ${entity}`;
}

export const getTimeline = async (req: Request, res: Response) => {
    try {
        const { id, type } = req.params; // type = 'lead' | 'contact' | 'account'

        // Basic validation
        if (!['lead', 'contact', 'account'].includes(type) || !id) {
            return res.status(400).json({ message: 'Invalid entity type or ID' });
        }

        // Fetch related data concurrently
        const [interactions, tasks, events, auditLogs, callRecordings] = await Promise.all([
            prisma.interaction.findMany({
                where: { 
                    [`${type}Id`]: id,
                    isDeleted: false
                },
                orderBy: { date: 'desc' },
                include: { createdBy: { select: { firstName: true, lastName: true } } }
            }),
            prisma.task.findMany({
                where: { 
                    [`${type}Id`]: id,
                    isDeleted: false
                },
                orderBy: { createdAt: 'desc' },
                include: { assignedTo: { select: { firstName: true, lastName: true } } }
            }),
            prisma.calendarEvent.findMany({
                where: { 
                    [`${type}Id`]: id,
                    isDeleted: false
                },
                orderBy: { startTime: 'desc' },
                include: { createdBy: { select: { firstName: true, lastName: true } } }
            }),
            prisma.auditLog.findMany({
                where: { entityId: id }, // AuditLog stores entityId generically
                orderBy: { createdAt: 'desc' },
                include: { actor: { select: { firstName: true, lastName: true } } }
            }),
            prisma.callRecording.findMany({
                where: { leadId: id },
                orderBy: { timestamp: 'desc' }
            })
        ]);

        // Filter out CallRecordings that are already represented by Interactions to avoid timeline duplicates.
        // A recording is considered "covered" by an interaction if:
        //   1. Its fileUrl matches the interaction's recordingUrl, OR
        //   2. It has an empty fileUrl AND shares the same leadId as an interaction within a 2-minute window.
        const interactionRecordingUrls = new Set(interactions.map(i => i.recordingUrl).filter(Boolean));
        const interactionLeadTimestamps = interactions.map(i => ({
            leadId: i.leadId,
            time: new Date(i.date).getTime()
        }));

        const standaloneRecordings = callRecordings.filter(c => {
            // If the fileUrl matches an interaction's recordingUrl, it's a duplicate
            if (c.fileUrl && interactionRecordingUrls.has(c.fileUrl)) return false;

            // If the recording has an empty fileUrl (metadata-only from bulk sync),
            // check if an Interaction already covers this lead+timestamp window
            if (!c.fileUrl || c.fileUrl === '') {
                const recTime = new Date(c.timestamp).getTime();
                const hasCoveringInteraction = interactionLeadTimestamps.some(
                    it => it.leadId === c.leadId && Math.abs(it.time - recTime) < 120_000
                );
                if (hasCoveringInteraction) return false;
            }

            return true;
        });

        // Normalize data for UI
        const timeline = [
            ...interactions.map(i => ({
                id: i.id,
                type: 'interaction',
                subType: i.type, // call, email, meeting
                title: i.subject,
                description: i.description,
                date: i.date,
                actor: i.createdBy,
                meta: {
                    direction: i.direction,
                    duration: i.duration,
                    recordingDuration: i.recordingDuration,
                    recordingUrl: i.recordingUrl
                }
            })),
            ...tasks.map(t => ({
                id: t.id,
                type: 'task',
                subType: t.status, // not_started, in_progress, etc.
                title: t.subject,
                description: t.description,
                date: t.dueDate || t.createdAt,
                actor: t.assignedTo,
                meta: { priority: t.priority }
            })),
            ...events.map(e => ({
                id: e.id,
                type: 'event',
                subType: e.type,
                title: e.title,
                description: e.description,
                date: e.startTime,
                actor: e.createdBy,
                meta: { location: e.location }
            })),
            ...auditLogs.map(a => {
                // Format audit log description based on action type
                let description = '';
                const details = a.details as any;

                switch (a.action) {
                    case 'CREATE_LEAD':
                    case 'CREATE':
                        description = details?.name ? `Created: ${details.name}` : 'Created new record';
                        if (details?.company) description += ` at ${details.company}`;
                        break;
                    case 'UPDATE':
                        description = 'Updated record';
                        break;
                    case 'DELETE':
                        description = 'Deleted record';
                        break;
                    case 'LOGIN':
                        description = 'Logged into the system';
                        break;
                    case 'EXPORT':
                        description = 'Exported data';
                        break;
                    case 'LEAD_STATUS_CHANGE':
                        description = details?.oldStatus && details?.newStatus
                            ? `Status changed from ${details.oldStatus} to ${details.newStatus}`
                            : 'Status changed';
                        break;
                    case 'BULK_IMPORT_COMPLETED':
                        description = details?.successCount
                            ? `Imported ${details.successCount} records`
                            : 'Bulk import completed';
                        break;
                    default:
                        // For unknown actions, try to extract meaningful info
                        if (details?.name) {
                            description = details.name;
                        } else if (typeof details === 'object' && details !== null) {
                            // Extract first meaningful value
                            const values = Object.values(details).filter(v => v && typeof v === 'string');
                            description = values.length > 0 ? String(values[0]) : '';
                        }
                }

                return {
                    id: a.id,
                    type: 'audit',
                    subType: a.action,
                    title: getHumanReadableAction(a.action, a.entity),
                    description: description || 'Activity recorded',
                    date: a.createdAt,
                    actor: a.actor,
                    meta: {}
                };
            }),
            ...standaloneRecordings.map(c => ({
                id: c.id,
                type: 'recording',
                subType: c.callType,
                title: `Call: ${c.callType}`,
                description: `Duration: ${Math.floor(c.duration / 60)}m ${c.duration % 60}s`,
                date: c.timestamp,
                actor: null, // Call logs are from the device, usually specific to the assigned user
                meta: { fileUrl: c.fileUrl, duration: c.duration, callType: c.callType }
            }))
        ];

        // Sort by date descending
        timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(timeline);
    } catch (error) {
        console.error('Timeline Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
