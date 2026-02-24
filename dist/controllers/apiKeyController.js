"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteApiKey = exports.revokeApiKey = exports.createApiKey = exports.getApiKeys = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getApiKeys = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const apiKeys = await prisma_1.default.apiKey.findMany({
            where: {
                organisationId: orgId,
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                status: true,
                createdAt: true,
                permissions: true
            }
        });
        // Map for frontend compatibility
        const mappedKeys = apiKeys.map(k => ({
            ...k,
            isActive: k.status === 'active',
            firstEight: k.keyPrefix
        }));
        res.json({ apiKeys: mappedKeys });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getApiKeys = getApiKeys;
const createApiKey = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const keyBytes = crypto_1.default.randomBytes(32).toString('hex');
        const rawKey = `crm_${keyBytes}`; // crm_ prefix for identification
        const keyHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
        const keyPrefix = rawKey.substring(0, 12); // e.g., crm_1a2b3c4d
        const apiKey = await prisma_1.default.apiKey.create({
            data: {
                name: req.body.name || 'New API Key',
                description: req.body.description,
                keyHash,
                keyPrefix,
                permissions: req.body.permissions || [], // Default no permissions or all? Logic in middleware doesn't check yet.
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } },
                status: 'active'
            }
        });
        // Return the raw key ONLY once
        res.status(201).json({
            apiKey: { ...apiKey, key: rawKey }, // Inject raw key for display
            message: 'Save this key - it will not be shown again'
        });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createApiKey = createApiKey;
const revokeApiKey = async (req, res) => {
    try {
        const apiKey = await prisma_1.default.apiKey.update({
            where: { id: req.params.id },
            data: {
                status: 'revoked',
                // usage/revokedAt handling if schema supported it, currently only status
            }
        });
        res.json({ message: 'API key revoked', apiKey });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.revokeApiKey = revokeApiKey;
const deleteApiKey = async (req, res) => {
    try {
        await prisma_1.default.apiKey.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'API key deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteApiKey = deleteApiKey;
//# sourceMappingURL=apiKeyController.js.map