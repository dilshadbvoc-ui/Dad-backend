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
exports.deleteCampaign = exports.updateCampaign = exports.getCampaignById = exports.createCampaign = exports.getCampaigns = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getCampaigns = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(403).json({ message: 'User not associated with an organisation' });
        const where = { organisationId: orgId, isDeleted: false };
        if (user.role === 'super_admin' && req.query.organisationId) {
            where.organisationId = String(req.query.organisationId);
        }
        const campaigns = await prisma_1.default.campaign.findMany({
            where,
            include: {
                emailList: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ campaigns });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCampaigns = getCampaigns;
const createCampaign = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const data = {
            name: req.body.name,
            subject: req.body.subject,
            content: req.body.content,
            status: req.body.status || 'draft',
            scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
            organisation: { connect: { id: orgId } },
            createdBy: { connect: { id: user.id } }
        };
        if (req.body.emailList) {
            data.emailList = { connect: { id: req.body.emailList } };
        }
        const campaign = await prisma_1.default.campaign.create({
            data
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_CAMPAIGN',
                entity: 'Campaign',
                entityId: campaign.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: campaign.name, subject: campaign.subject }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(campaign);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createCampaign = createCampaign;
const getCampaignById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
        }
        const campaign = await prisma_1.default.campaign.findFirst({
            where,
            include: { emailList: true }
        });
        if (!campaign)
            return res.status(404).json({ message: 'Campaign not found' });
        res.json(campaign);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCampaignById = getCampaignById;
const updateCampaign = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const campaignId = req.params.id;
        // Verify campaign exists and belongs to org
        const existing = await prisma_1.default.campaign.findFirst({
            where: { id: campaignId, isDeleted: false }
        });
        if (!existing) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        if (existing.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to update this campaign' });
        }
        const updateData = {};
        if (req.body.name !== undefined)
            updateData.name = req.body.name;
        if (req.body.subject !== undefined)
            updateData.subject = req.body.subject;
        if (req.body.content !== undefined)
            updateData.content = req.body.content;
        if (req.body.status !== undefined)
            updateData.status = req.body.status;
        if (req.body.scheduledAt !== undefined) {
            updateData.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
        }
        if (req.body.emailList !== undefined) {
            updateData.emailList = req.body.emailList
                ? { connect: { id: req.body.emailList } }
                : { disconnect: true };
        }
        const campaign = await prisma_1.default.campaign.update({
            where: { id: campaignId },
            data: updateData,
            include: { emailList: { select: { name: true } } }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'UPDATE_CAMPAIGN',
                entity: 'Campaign',
                entityId: campaignId,
                actorId: user.id,
                organisationId: orgId,
                details: { name: campaign.name, updatedFields: Object.keys(updateData) }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json(campaign);
        // Process campaign if status is set to 'sent' or 'scheduled'
        if (req.body.status === 'sent' || req.body.status === 'scheduled') {
            const { CampaignProcessor } = await Promise.resolve().then(() => __importStar(require('../services/CampaignProcessor')));
            CampaignProcessor.processEmailCampaign(campaignId).catch(err => {
                console.error('[CampaignController] Error triggering campaign processing:', err);
            });
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateCampaign = updateCampaign;
const deleteCampaign = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const campaignId = req.params.id;
        // Verify campaign exists
        const existing = await prisma_1.default.campaign.findFirst({
            where: { id: campaignId, isDeleted: false }
        });
        if (!existing) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        if (existing.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to delete this campaign' });
        }
        // Soft delete
        await prisma_1.default.campaign.update({
            where: { id: campaignId },
            data: { isDeleted: true }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'DELETE_CAMPAIGN',
                entity: 'Campaign',
                entityId: campaignId,
                actorId: user.id,
                organisationId: orgId,
                details: { name: existing.name }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'Campaign deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteCampaign = deleteCampaign;
