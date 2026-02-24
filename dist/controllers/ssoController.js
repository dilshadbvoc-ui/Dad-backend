"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ssoCallback = exports.ssoLogin = exports.initSSO = void 0;
const passport_1 = __importDefault(require("passport"));
const prisma_1 = __importDefault(require("../config/prisma"));
const generateToken_1 = __importDefault(require("../utils/generateToken"));
// @desc    Initialize SSO Login
// @route   POST /api/auth/sso/init
// @access  Public
const initSSO = async (req, res) => {
    const { email, slug } = req.body;
    try {
        let org;
        if (slug) {
            org = await prisma_1.default.organisation.findUnique({ where: { slug } });
        }
        else if (email) {
            // Try to find by domain logic or just user lookup (risky if email not unique across orgs, but schema says email is unique?)
            // Schema: email is NOT unique globally in User model? 
            // Checking schema: User model has "email String". Not marked unique.
            // But usually SaaS has unique email.
            // Let's assume unique email for simplicity for now, OR find user first.
            const user = await prisma_1.default.user.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } },
                include: { organisation: true }
            });
            org = user?.organisation;
        }
        if (!org) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        if (!org.ssoConfig) {
            return res.status(400).json({ message: 'SSO is not configured for this organization' });
        }
        // Return the redirect URL for the frontend to navigate to
        // We redirect to a backend route that triggers passport
        // /api/auth/sso/login/:orgId
        return res.json({ redirectUrl: `/api/auth/sso/login/${org.id}` });
    }
    catch (error) {
        console.error('SSO Init Error:', error);
        return res.status(500).json({ message: 'Server error during SSO init' });
    }
};
exports.initSSO = initSSO;
// @desc    Trigger SAML Redirect
// @route   GET /api/auth/sso/login/:orgId
const ssoLogin = (req, res, next) => {
    passport_1.default.authenticate('saml', {
        failureRedirect: '/login?error=sso_failed',
        failureFlash: true
    })(req, res, next);
};
exports.ssoLogin = ssoLogin;
const auditLogger_1 = require("../utils/auditLogger");
// @desc    SAML Callback
// @route   POST /api/auth/sso/callback/:orgId
const ssoCallback = (req, res, next) => {
    passport_1.default.authenticate('saml', { session: false }, async (err, user) => {
        if (err || !user) {
            console.error('SSO Authenticate Error:', err);
            return res.redirect('http://localhost:5173/login?error=sso_failed');
        }
        // Generate JWT
        const token = (0, generateToken_1.default)(user.id);
        // Audit Log
        await (0, auditLogger_1.logAudit)({
            action: 'AUTH_SSO_LOGIN_SUCCESS',
            entity: 'User',
            entityId: user.id,
            actorId: user.id,
            organisationId: user.organisationId,
            details: { email: user.email, provider: 'saml' }
        });
        // Redirect to Frontend Dashboard with Token
        // NOTE: In production, consider a more secure way than query param (e.g. cookie + redirect, or temp code)
        // For MVP, query param is acceptable if short-lived.
        // Better: Set cookie here and redirect.
        // We'll revert to simply passing it in query for now to match current localStorage flow
        const userInfo = JSON.stringify({
            _id: user.id,
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            organisation: user.organisationId, // Simplified
            token: token
        });
        // Encode to pass safely
        const safeInfo = encodeURIComponent(userInfo);
        res.redirect(`http://localhost:5173/sso-callback?data=${safeInfo}`);
    })(req, res, next);
};
exports.ssoCallback = ssoCallback;
//# sourceMappingURL=ssoController.js.map