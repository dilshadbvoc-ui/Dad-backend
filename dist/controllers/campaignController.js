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
exports.getCampaignById = exports.createCampaign = exports.getCampaigns = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getCampaigns = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(403).json({ message: 'User not associated with an organisation' });
        const where = { organisationId: orgId, isDeleted: false };
        if (user.role === 'super_admin' && req.query.organisationId) {
            where.organisationId = String(req.query.organisationId);
        }
        const campaigns = yield prisma_1.default.campaign.findMany({
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
});
exports.getCampaigns = getCampaigns;
const createCampaign = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const campaign = yield prisma_1.default.campaign.create({
            data
        });
        res.status(201).json(campaign);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createCampaign = createCampaign;
const getCampaignById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const campaign = yield prisma_1.default.campaign.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: { emailList: true }
        });
        if (!campaign)
            return res.status(404).json({ message: 'Campaign not found' });
        res.json(campaign);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getCampaignById = getCampaignById;
