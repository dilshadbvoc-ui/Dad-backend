"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPassport = void 0;
const passport_1 = __importDefault(require("passport"));
const passport_saml_1 = require("passport-saml");
const prisma_1 = __importDefault(require("../config/prisma"));
// UserRole import removed
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const setupPassport = () => {
    passport_1.default.serializeUser((user, done) => {
        done(null, user.id);
    });
    passport_1.default.deserializeUser(async (id, done) => {
        try {
            const user = await prisma_1.default.user.findUnique({ where: { id } });
            done(null, user);
        }
        catch (err) {
            done(err, null);
        }
    });
    const strategy = new passport_saml_1.MultiSamlStrategy({
        passReqToCallback: true,
        getSamlOptions: async (req, done) => {
            try {
                const { orgId } = req.params;
                if (!orgId)
                    return done(new Error('Organization ID missing for SSO'));
                const org = await prisma_1.default.organisation.findUnique({
                    where: { id: orgId }
                });
                if (!org || !org.ssoConfig) {
                    return done(new Error('SSO not configured for this organization'));
                }
                const ssoConfig = org.ssoConfig;
                return done(null, {
                    path: `/api/auth/sso/callback/${orgId}`,
                    entryPoint: ssoConfig.entryPoint,
                    issuer: ssoConfig.issuer || 'mern-crm',
                    cert: ssoConfig.cert,
                    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
                });
            }
            catch (err) {
                done(err);
            }
        }
    }, // Cast options to any
    async (req, profile, done) => {
        // User finding/creation logic
        try {
            // Profile usually has nameID (email) or attributes
            const email = profile.nameID || profile.email;
            if (!email)
                return done(new Error('No email found in SAML response'));
            const { orgId } = req.params;
            // 1. Find User
            let user = await prisma_1.default.user.findFirst({
                where: {
                    email: { equals: email, mode: 'insensitive' },
                    organisationId: orgId
                }
            });
            // 2. JIT Provisioning
            if (!user) {
                // Create basic user
                const firstName = profile.firstName || profile.givenName || email.split('@')[0];
                const lastName = profile.lastName || profile.sn || '-';
                // Generate random password
                const randomPass = Math.random().toString(36).slice(-8);
                const salt = await bcryptjs_1.default.genSalt(10);
                const hashedPassword = await bcryptjs_1.default.hash(randomPass, salt);
                // Get Org for defaults
                const org = await prisma_1.default.organisation.findUnique({ where: { id: orgId } });
                if (!org)
                    return done(new Error('Org not found'));
                user = await prisma_1.default.user.create({
                    data: {
                        firstName,
                        lastName,
                        email,
                        password: hashedPassword,
                        role: 'sales_rep', // Default role
                        organisationId: orgId,
                        userId: `${org.name.slice(0, 3).toUpperCase()}_${Date.now()}`,
                        isActive: true
                    }
                });
            }
            return done(null, user);
        }
        catch (err) {
            console.error('SAML Verify Error:', err);
            return done(err);
        }
    });
    passport_1.default.use('saml', strategy);
};
exports.setupPassport = setupPassport;
//# sourceMappingURL=ssoService.js.map