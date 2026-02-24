"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCallSettings = exports.getCallSettings = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// Get call settings for the organisation (create defaults if not exists)
const getCallSettings = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        // Try to find existing settings
        let settings = await prisma_1.default.callSettings.findUnique({
            where: { organisationId: orgId }
        });
        // If not exists, create with defaults
        if (!settings) {
            settings = await prisma_1.default.callSettings.create({
                data: {
                    organisationId: orgId
                }
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error('Get call settings error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getCallSettings = getCallSettings;
// Update call settings
const updateCallSettings = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const { autoRecordOutbound, autoRecordInbound, recordingQuality, storageType, retentionDays, autoDeleteEnabled, popupOnIncoming, autoFollowupReminder, followupDelayMinutes } = req.body;
        // Upsert settings
        const settings = await prisma_1.default.callSettings.upsert({
            where: { organisationId: orgId },
            update: {
                autoRecordOutbound: autoRecordOutbound ?? undefined,
                autoRecordInbound: autoRecordInbound ?? undefined,
                recordingQuality: recordingQuality ?? undefined,
                storageType: storageType ?? undefined,
                retentionDays: retentionDays ?? undefined,
                autoDeleteEnabled: autoDeleteEnabled ?? undefined,
                popupOnIncoming: popupOnIncoming ?? undefined,
                autoFollowupReminder: autoFollowupReminder ?? undefined,
                followupDelayMinutes: followupDelayMinutes ?? undefined
            },
            create: {
                organisationId: orgId,
                autoRecordOutbound: autoRecordOutbound ?? true,
                autoRecordInbound: autoRecordInbound ?? true,
                recordingQuality: recordingQuality ?? 'high',
                storageType: storageType ?? 'local',
                retentionDays: retentionDays ?? 90,
                autoDeleteEnabled: autoDeleteEnabled ?? false,
                popupOnIncoming: popupOnIncoming ?? true,
                autoFollowupReminder: autoFollowupReminder ?? true,
                followupDelayMinutes: followupDelayMinutes ?? 30
            }
        });
        res.json(settings);
    }
    catch (error) {
        console.error('Update call settings error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.updateCallSettings = updateCallSettings;
//# sourceMappingURL=callSettingsController.js.map