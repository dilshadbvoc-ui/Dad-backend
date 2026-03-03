"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWhatsAppCampaign = exports.updateWhatsAppCampaign = exports.createWhatsAppCampaign = exports.getWhatsAppCampaigns = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const campaignProcessor_1 = require("../services/campaignProcessor");
const getWhatsAppCampaigns = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        const campaigns = await prisma_1.default.whatsAppCampaign.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                }
            }
        });
        res.json(campaigns);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getWhatsAppCampaigns = getWhatsAppCampaigns;
const createWhatsAppCampaign = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        const { recipients, testNumber, ...campaignData } = req.body;
        // Validate that we have either recipients or testNumber
        if (!recipients && !testNumber) {
            return res.status(400).json({
                message: 'Either recipients array or testNumber is required'
            });
        }
        // Initialize stats
        const initialStats = {
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            replied: 0
        };
        const campaign = await prisma_1.default.whatsAppCampaign.create({
            data: {
                ...campaignData,
                recipients: recipients || [],
                testNumber,
                organisationId: orgId, // Type assertion since we've validated orgId is not null
                createdById: user.id,
                stats: initialStats
            }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_WHATSAPP_CAMPAIGN',
                entity: 'WhatsAppCampaign',
                entityId: campaign.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: campaign.name, recipientCount: (recipients || []).length }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        // If status is 'sent', process the campaign immediately
        if (req.body.status === 'sent') {
            // Process campaign asynchronously
            campaignProcessor_1.CampaignProcessor.processWhatsAppCampaign(campaign.id)
                .catch(error => {
                console.error('Campaign processing error:', error);
            });
        }
        res.status(201).json(campaign);
    }
    catch (error) {
        console.error('WhatsApp Campaign Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.createWhatsAppCampaign = createWhatsAppCampaign;
const updateWhatsAppCampaign = async (req, res) => {
    try {
        const campaignId = req.params.id;
        // Check if campaign exists and belongs to user's organisation
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        const existingCampaign = await prisma_1.default.whatsAppCampaign.findFirst({
            where: {
                id: campaignId,
                organisationId: orgId,
                isDeleted: false
            }
        });
        if (!existingCampaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        // Prevent updating sent campaigns
        if (existingCampaign.status === 'sent' && req.body.status !== 'sent') {
            return res.status(400).json({ message: 'Cannot modify a campaign that has already been sent' });
        }
        const campaign = await prisma_1.default.whatsAppCampaign.update({
            where: { id: campaignId },
            data: req.body
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'UPDATE_WHATSAPP_CAMPAIGN',
                entity: 'WhatsAppCampaign',
                entityId: campaignId,
                actorId: user.id,
                organisationId: orgId,
                details: { name: campaign.name, updatedFields: Object.keys(req.body) }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        // If status changed to 'sent', process the campaign
        if (req.body.status === 'sent' && existingCampaign.status !== 'sent') {
            campaignProcessor_1.CampaignProcessor.processWhatsAppCampaign(campaign.id)
                .catch(error => {
                console.error('Campaign processing error:', error);
            });
        }
        res.json(campaign);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateWhatsAppCampaign = updateWhatsAppCampaign;
const deleteWhatsAppCampaign = async (req, res) => {
    try {
        const campaignId = req.params.id;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        // Check if campaign exists and belongs to user's organisation
        const existingCampaign = await prisma_1.default.whatsAppCampaign.findFirst({
            where: {
                id: campaignId,
                organisationId: orgId,
                isDeleted: false
            }
        });
        if (!existingCampaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        await prisma_1.default.whatsAppCampaign.update({
            where: { id: campaignId },
            data: { isDeleted: true }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'DELETE_WHATSAPP_CAMPAIGN',
                entity: 'WhatsAppCampaign',
                entityId: campaignId,
                actorId: user.id,
                organisationId: orgId,
                details: { name: existingCampaign.name }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'WhatsApp Campaign deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteWhatsAppCampaign = deleteWhatsAppCampaign;
