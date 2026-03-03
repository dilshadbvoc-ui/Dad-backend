"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncData = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const syncData = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const lastSync = req.query.lastSync ? new Date(req.query.lastSync) : new Date(0); // Default to epoch if no sync
        if (isNaN(lastSync.getTime())) {
            return res.status(400).json({ message: 'Invalid lastSync timestamp' });
        }
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        // optimize queries to only fetch what changed
        const whereClause = {
            organisationId: orgId,
            updatedAt: { gt: lastSync }
        };
        const [leads, contacts, tasks, events, opportunities] = await Promise.all([
            prisma_1.default.lead.findMany({ where: whereClause }),
            prisma_1.default.contact.findMany({ where: whereClause }),
            prisma_1.default.task.findMany({
                where: {
                    organisationId: orgId,
                    updatedAt: { gt: lastSync },
                    // Assuming tasks are also specific to user? Or org wide?
                    // Usually tasks assignedTo user. For now, scoping to Org to keep simple or check assignedTo?
                    // Let's stick to Org for simplicity unless it's too much data.
                    // Actually, for mobile, user usually wants their tasks.
                    // But let's respect permission scope later.
                }
            }),
            prisma_1.default.calendarEvent.findMany({ where: whereClause }),
            prisma_1.default.opportunity.findMany({ where: whereClause })
        ]);
        res.json({
            timestamp: new Date(),
            changes: {
                leads,
                contacts,
                tasks,
                events,
                opportunities
            }
        });
    }
    catch (error) {
        console.error('Sync Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.syncData = syncData;
