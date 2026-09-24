import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { resolveBridgeConfigForOrg } from '../services/telephonyBridgeService';

// Get call settings for the organisation (create defaults if not exists)
export const getCallSettings = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        // Try to find existing settings
        let settings = await prisma.callSettings.findUnique({
            where: { organisationId: orgId }
        });

        // If not exists, create with defaults
        if (!settings) {
            settings = await prisma.callSettings.create({
                data: {
                    organisationId: orgId
                }
            });
        }

        // Cloud recording (centralized server-number/conference-bridge
        // method — see Dad-dialer/CALL_RECORDING_SERVER_METHOD_PLAN.md):
        // the org-opt-in flag lives in Organisation.integrations.
        // callRecordingBridge, not a CallSettings column — deliberately,
        // to avoid a schema migration for a Phase 2/3 feature that's still
        // being validated. `resolveBridgeConfigForOrg` also hands back a
        // number from PypeCRM's own centrally-owned bridge pool (never
        // org-specific) when enabled. Merged into this same response so
        // the dialer's existing CallSettingsCache fetch picks it up with
        // no separate endpoint/poll needed.
        const bridgeConfig = await resolveBridgeConfigForOrg(orgId);

        res.json({
            ...settings,
            cloudRecordingEnabled: bridgeConfig.enabled,
            cloudRecordingBridgeNumber: bridgeConfig.bridgeNumber,
        });
    } catch (error) {
        console.error('Get call settings error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// Update call settings
export const updateCallSettings = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const {
            autoRecordOutbound,
            autoRecordInbound,
            recordingQuality,
            storageType,
            retentionDays,
            autoDeleteEnabled,
            popupOnIncoming,
            autoFollowupReminder,
            followupDelayMinutes,
            syncNonCrmContacts
        } = req.body;

        // Upsert settings
        const settings = await prisma.callSettings.upsert({
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
                followupDelayMinutes: followupDelayMinutes ?? undefined,
                syncNonCrmContacts: syncNonCrmContacts ?? undefined
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
                followupDelayMinutes: followupDelayMinutes ?? 30,
                syncNonCrmContacts: syncNonCrmContacts ?? true // Default to true if not specified on first create
            }
        });

        res.json(settings);
    } catch (error) {
        console.error('Update call settings error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
