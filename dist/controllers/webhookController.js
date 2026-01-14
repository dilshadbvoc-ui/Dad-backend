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
exports.deleteWebhook = exports.updateWebhook = exports.createWebhook = exports.getWebhooks = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getWebhooks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        const where = { isDeleted: false };
        if (orgId)
            where.organisationId = orgId;
        const webhooks = yield prisma_1.default.webhook.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json({ webhooks });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getWebhooks = getWebhooks;
const createWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const webhook = yield prisma_1.default.webhook.create({
            data: {
                name: req.body.name,
                url: req.body.url,
                events: req.body.events || [],
                secret: req.body.secret,
                headers: req.body.headers,
                isActive: true,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        res.status(201).json(webhook);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createWebhook = createWebhook;
const updateWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const webhook = yield prisma_1.default.webhook.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(webhook);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateWebhook = updateWebhook;
const deleteWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.webhook.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Webhook deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteWebhook = deleteWebhook;
