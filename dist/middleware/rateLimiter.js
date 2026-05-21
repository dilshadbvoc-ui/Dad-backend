"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignLimiter = exports.webhookLimiter = exports.metaLimiter = exports.whatsappLimiter = exports.authLimiter = exports.generalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// General API rate limiting
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100000, // Limit each IP to 100000 requests per windowMs (very high limit for production use)
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for health checks and login endpoints to prevent lockouts
    skip: (req) => {
        const path = req.originalUrl || req.path || '';
        return path.includes('/health') || path.includes('/login');
    },
});
// Strict rate limiting for authentication endpoints
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // Limit each IP to 10000 login attempts per windowMs (very high for production)
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
    skip: (req) => {
        const path = req.originalUrl || req.path || '';
        return path.includes('/login');
    },
});
// WhatsApp API rate limiting (more restrictive)
exports.whatsappLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 500, // Increased from 80 to allow more internal operations
    message: {
        error: 'WhatsApp rate limit exceeded. Please try again in a moment.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Meta API rate limiting
exports.metaLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000, // Increased from 200 to allow more internal operations
    message: {
        error: 'Meta API rate limit exceeded. Please try again later.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Webhook rate limiting (prevent DoS attacks)
exports.webhookLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // Increased from 100 to allow more webhook traffic
    message: {
        error: 'Webhook rate limit exceeded.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Campaign sending rate limiting
exports.campaignLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Increased from 10 to allow more campaign operations
    message: {
        error: 'Campaign rate limit exceeded. Please try again later.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
