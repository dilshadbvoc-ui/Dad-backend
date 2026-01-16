"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkUserMeetingReminders = exports.generateMeetingReminders = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/**
 * Checks for meetings scheduled within the next 24 hours
 * and creates reminder notifications for the creator and their hierarchy.
 *
 * This should be called periodically (e.g., via cron job, or on server startup).
 */
const generateMeetingReminders = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000); // Window to avoid duplicates
    console.log(`[MeetingReminder] Checking for meetings between ${in23Hours.toISOString()} and ${in24Hours.toISOString()}`);
    // Find meetings starting in ~24 hours that haven't been notified
    const upcomingMeetings = yield prisma_1.default.calendarEvent.findMany({
        where: {
            type: 'meeting',
            isDeleted: false,
            status: 'scheduled',
            startTime: {
                gte: in23Hours,
                lt: in24Hours
            }
        },
        include: {
            createdBy: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    reportsToId: true
                }
            },
            lead: {
                select: { firstName: true, lastName: true }
            }
        }
    });
    console.log(`[MeetingReminder] Found ${upcomingMeetings.length} meetings requiring notifications`);
    for (const meeting of upcomingMeetings) {
        const notifyUserIds = [];
        // 1. Add the creator
        if (meeting.createdById) {
            notifyUserIds.push(meeting.createdById);
        }
        // 2. Add the hierarchy (managers up the chain)
        if ((_a = meeting.createdBy) === null || _a === void 0 ? void 0 : _a.reportsToId) {
            let currentManagerId = meeting.createdBy.reportsToId;
            let depth = 0;
            const maxDepth = 5; // Safety limit
            while (currentManagerId && depth < maxDepth) {
                notifyUserIds.push(currentManagerId);
                const manager = yield prisma_1.default.user.findUnique({
                    where: { id: currentManagerId },
                    select: { reportsToId: true }
                });
                currentManagerId = (manager === null || manager === void 0 ? void 0 : manager.reportsToId) || null;
                depth++;
            }
        }
        // 3. Create notifications for each user
        const leadName = meeting.lead
            ? `${meeting.lead.firstName} ${meeting.lead.lastName}`
            : 'Unknown';
        for (const userId of notifyUserIds) {
            // Check if notification already exists (to avoid duplicates)
            const existing = yield prisma_1.default.notification.findFirst({
                where: {
                    recipientId: userId,
                    relatedResource: 'CalendarEvent',
                    relatedId: meeting.id,
                    title: { contains: 'Upcoming Meeting' }
                }
            });
            if (!existing) {
                yield prisma_1.default.notification.create({
                    data: {
                        title: 'Upcoming Meeting Tomorrow',
                        message: `Meeting with ${leadName}: "${meeting.title}" scheduled for ${new Date(meeting.startTime).toLocaleString()}`,
                        type: 'reminder',
                        relatedResource: 'CalendarEvent',
                        relatedId: meeting.id,
                        recipientId: userId
                    }
                });
                console.log(`[MeetingReminder] Created notification for user ${userId} for meeting ${meeting.id}`);
            }
        }
    }
    return upcomingMeetings.length;
});
exports.generateMeetingReminders = generateMeetingReminders;
/**
 * Alternative: On-demand check when user loads dashboard/notifications.
 * This function can be called from a controller.
 */
const checkUserMeetingReminders = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    // Find meetings the user created that are coming up
    const upcomingMeetings = yield prisma_1.default.calendarEvent.findMany({
        where: {
            createdById: userId,
            type: 'meeting',
            isDeleted: false,
            status: 'scheduled',
            startTime: {
                gte: now,
                lt: in48Hours
            }
        },
        include: {
            lead: { select: { firstName: true, lastName: true } }
        },
        orderBy: { startTime: 'asc' }
    });
    return upcomingMeetings;
});
exports.checkUserMeetingReminders = checkUserMeetingReminders;
