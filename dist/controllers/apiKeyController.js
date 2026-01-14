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
exports.deleteApiKey = exports.revokeApiKey = exports.createApiKey = exports.getApiKeys = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getApiKeys = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const apiKeys = yield prisma_1.default.apiKey.findMany({
            where: {
                organisationId: orgId,
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                keyPrefix: true, // Show prefix only
                status: true,
                createdAt: true,
                permissions: true
            }
        });
        res.json({ apiKeys });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getApiKeys = getApiKeys;
const createApiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const keyBytes = crypto_1.default.randomBytes(32).toString('hex');
        const rawKey = `crm_${keyBytes}`; // crm_ prefix for identification
        const keyHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
        const keyPrefix = rawKey.substring(0, 12); // e.g., crm_1a2b3c4d
        const apiKey = yield prisma_1.default.apiKey.create({
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
            apiKey: Object.assign(Object.assign({}, apiKey), { key: rawKey }), // Inject raw key for display
            message: 'Save this key - it will not be shown again'
        });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createApiKey = createApiKey;
const revokeApiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const apiKey = yield prisma_1.default.apiKey.update({
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
});
exports.revokeApiKey = revokeApiKey;
const deleteApiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const apiKey = yield prisma_1.default.apiKey.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'API key deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteApiKey = deleteApiKey;
