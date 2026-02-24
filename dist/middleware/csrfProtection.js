"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCSRFToken = exports.verifyCSRFToken = exports.setCSRFToken = exports.CSRFProtection = void 0;
const crypto_1 = __importDefault(require("crypto"));
/**
 * CSRF Protection Middleware
 * Implements double-submit cookie pattern for CSRF protection
 */
class CSRFProtection {
    /**
     * Generate a cryptographically secure CSRF token
     */
    static generateToken() {
        return crypto_1.default.randomBytes(this.CSRF_TOKEN_LENGTH).toString('hex');
    }
    /**
     * Middleware to generate and set CSRF token
     */
    static setToken() {
        return (req, res, next) => {
            const session = req.session;
            // Generate new token if not exists
            if (!session?.csrfToken) {
                req.session = req.session || {};
                req.session.csrfToken = CSRFProtection.generateToken();
            }
            // Set token in cookie for client access
            res.cookie(CSRFProtection.CSRF_COOKIE_NAME, req.session.csrfToken, {
                httpOnly: false, // Client needs to read this
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });
            // Make token available to request
            req.csrfToken = req.session.csrfToken;
            next();
        };
    }
    /**
     * Middleware to verify CSRF token
     */
    static verifyToken() {
        return (req, res, next) => {
            // Skip CSRF for safe methods
            if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
                return next();
            }
            // Skip CSRF for API key authentication
            if (req.headers['x-api-key']) {
                return next();
            }
            // Skip CSRF for webhooks (they have signature verification)
            if (req.path.includes('/webhook')) {
                return next();
            }
            const session = req.session;
            const sessionToken = session?.csrfToken;
            const headerToken = req.headers[CSRFProtection.CSRF_HEADER_NAME.toLowerCase()];
            const cookieToken = req.cookies[CSRFProtection.CSRF_COOKIE_NAME];
            // Check if tokens exist
            if (!sessionToken || !headerToken) {
                return res.status(403).json({
                    error: 'CSRF token missing',
                    code: 'CSRF_TOKEN_MISSING'
                });
            }
            // Verify tokens match (double-submit cookie pattern)
            if (!crypto_1.default.timingSafeEqual(Buffer.from(sessionToken, 'hex'), Buffer.from(headerToken, 'hex'))) {
                return res.status(403).json({
                    error: 'CSRF token mismatch',
                    code: 'CSRF_TOKEN_INVALID'
                });
            }
            // Verify cookie token matches (additional security)
            if (cookieToken && !crypto_1.default.timingSafeEqual(Buffer.from(sessionToken, 'hex'), Buffer.from(cookieToken, 'hex'))) {
                return res.status(403).json({
                    error: 'CSRF cookie mismatch',
                    code: 'CSRF_COOKIE_INVALID'
                });
            }
            next();
        };
    }
    /**
     * Endpoint to get CSRF token for client
     */
    static getTokenEndpoint() {
        return (req, res) => {
            const session = req.session;
            res.json({
                csrfToken: req.csrfToken || session?.csrfToken,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
        };
    }
}
exports.CSRFProtection = CSRFProtection;
CSRFProtection.CSRF_TOKEN_LENGTH = 32;
CSRFProtection.CSRF_HEADER_NAME = 'X-CSRF-Token';
CSRFProtection.CSRF_COOKIE_NAME = 'csrf-token';
// Export middleware functions
exports.setCSRFToken = CSRFProtection.setToken();
exports.verifyCSRFToken = CSRFProtection.verifyToken();
exports.getCSRFToken = CSRFProtection.getTokenEndpoint();
