"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimeline = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// Helper function to format action names
function getHumanReadableAction(action, entity) {
    const actionMap = {
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
const getTimeline = async (req, res) => {
    try {
        const { id, type } = req.params; // type = 'lead' | 'contact' | 'account'
        // Basic validation
        if (!['lead', 'contact', 'account'].includes(type) || !id) {
            return res.status(400).json({ message: 'Invalid entity type or ID' });
        }
        // Fetch related data concurrently
        const [interactions, tasks, events, auditLogs] = await Promise.all([
            prisma_1.default.interaction.findMany({
                where: { [`${type}Id`]: id },
                orderBy: { date: 'desc' },
                include: { createdBy: { select: { firstName: true, lastName: true } } }
            }),
            prisma_1.default.task.findMany({
                where: { [`${type}Id`]: id },
                orderBy: { createdAt: 'desc' },
                include: { assignedTo: { select: { firstName: true, lastName: true } } }
            }),
            prisma_1.default.calendarEvent.findMany({
                where: { [`${type}Id`]: id },
                orderBy: { startTime: 'desc' },
                include: { createdBy: { select: { firstName: true, lastName: true } } }
            }),
            prisma_1.default.auditLog.findMany({
                where: { entityId: id }, // AuditLog stores entityId generically
                orderBy: { createdAt: 'desc' },
                include: { actor: { select: { firstName: true, lastName: true } } }
            })
        ]);
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
                meta: { direction: i.direction }
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
                const details = a.details;
                switch (a.action) {
                    case 'CREATE_LEAD':
                    case 'CREATE':
                        description = details?.name ? `Created: ${details.name}` : 'Created new record';
                        if (details?.company)
                            description += ` at ${details.company}`;
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
                        }
                        else if (typeof details === 'object' && details !== null) {
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
            })
        ];
        // Sort by date descending
        timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        res.json(timeline);
    }
    catch (error) {
        console.error('Timeline Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getTimeline = getTimeline;
//# sourceMappingURL=timelineController.js.map