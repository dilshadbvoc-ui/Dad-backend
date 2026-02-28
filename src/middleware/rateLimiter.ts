import rateLimit from 'express-rate-limit';

// General API rate limiting
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100000, // Limit each IP to 100000 requests per windowMs (very high limit for production use)
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for health checks
    skip: (req) => req.path === '/api/health',
});

// Strict rate limiting for authentication endpoints
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 100 : 20, // Limit each IP to 20 (100 in dev) login attempts per windowMs
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
});

// WhatsApp API rate limiting (more restrictive)
export const whatsappLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 80, // WhatsApp allows 80 messages per minute per phone number
    message: {
        error: 'WhatsApp rate limit exceeded. Maximum 80 messages per minute.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Meta API rate limiting
export const metaLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200, // Meta API allows 200 calls per hour per app
    message: {
        error: 'Meta API rate limit exceeded. Maximum 200 calls per hour.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Webhook rate limiting (prevent DoS attacks)
export const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Allow 100 webhook calls per minute per IP
    message: {
        error: 'Webhook rate limit exceeded.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Campaign sending rate limiting
export const campaignLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Maximum 10 campaigns per hour per organization
    message: {
        error: 'Campaign rate limit exceeded. Maximum 10 campaigns per hour.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});