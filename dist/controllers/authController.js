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
exports.getMe = exports.resetPassword = exports.forgotPassword = exports.registerUser = exports.authUser = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const generateToken_1 = __importDefault(require("../utils/generateToken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// UserRole import removed
const auditLogger_1 = require("../utils/auditLogger");
const emailService_1 = require("../services/emailService");
// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);
    if (!email || !password) {
        console.log('Login failed: Missing email or password');
        res.status(400).json({ message: 'Please provide email and password' });
        return;
    }
    try {
        const user = await prisma_1.default.user.findFirst({
            where: {
                OR: [
                    { email: { equals: email, mode: 'insensitive' } },
                    { userId: email }
                ]
            },
            include: {
                organisation: true
            }
        });
        if (user && (await bcryptjs_1.default.compare(password, user.password))) {
            console.log(`Login SUCCESS for: ${email}`);
            // Check if user manages any branch
            const branchManaged = await prisma_1.default.branch.findFirst({
                where: { managerId: user.id, isDeleted: false }
            });
            const isBranchManager = !!branchManaged;
            // Check if active
            if (!user.isActive) {
                res.status(401).json({ message: 'User account is deactivated' });
                return;
            }
            if (user.organisationId) {
                // Fire and forget audit log
                (0, auditLogger_1.logAudit)({
                    action: 'LOGIN',
                    entity: 'User',
                    entityId: user.id,
                    actorId: user.id,
                    organisationId: user.organisationId,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
            res.json({
                _id: user.id, // Keep _id for frontend compatibility if needed
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                isBranchManager,
                organisation: user.organisation,
                branchId: user.branchId,
                token: (0, generateToken_1.default)(user.id),
            });
        }
        else {
            console.log(`Login FAILED for: ${email}`);
            res.status(401).json({ message: 'Invalid email or password' });
        }
    }
    catch (error) {
        console.error("Login Error Details:", error);
        res.status(500).json({ message: error.message });
    }
};
exports.authUser = authUser;
// @desc    Register a new user & organisation
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    const { firstName, lastName, email, password, companyName } = req.body;
    try {
        const userExists = await prisma_1.default.user.findUnique({
            where: { email }
        });
        if (userExists) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }
        if (password.length < 12) {
            res.status(400).json({ message: 'Password must be at least 12 characters long' });
            return;
        }
        // Enhanced password validation
        const { PasswordValidator } = await Promise.resolve().then(() => __importStar(require('../utils/passwordValidator')));
        const passwordValidation = PasswordValidator.validate(password, [email, firstName, lastName]);
        if (!passwordValidation.isValid) {
            res.status(400).json({
                message: 'Password does not meet security requirements',
                errors: passwordValidation.errors,
                suggestions: passwordValidation.suggestions
            });
            return;
        }
        // Find default plan (e.g., 'Starter' or 'Trial')
        const defaultPlan = await prisma_1.default.subscriptionPlan.findFirst({
            where: { name: 'Starter' } // Ensure 'Starter' exists in seed
        });
        const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substr(2, 4);
        // Transaction to ensure atomicity
        const result = await prisma_1.default.$transaction(async (tx) => {
            const org = await tx.organisation.create({
                data: {
                    name: companyName,
                    slug,
                    domain: email.split('@')[1] || 'unknown.com',
                    status: 'active',
                    subscription: {
                        status: 'trialing',
                        planId: defaultPlan?.id,
                        startDate: new Date(),
                        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
                        autoRenew: false
                    },
                    userIdCounter: 1
                }
            });
            // Generate userId
            const prefix = companyName.slice(0, 3).toUpperCase();
            const generatedUserId = `${prefix}001`;
            // Hash password
            const salt = await bcryptjs_1.default.genSalt(10);
            const hashedPassword = await bcryptjs_1.default.hash(password, salt);
            // 2. Create Admin User
            const user = await tx.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    password: hashedPassword,
                    role: 'admin', // Downgrade from super_admin to admin for tenant creators
                    organisationId: org.id,
                    userId: generatedUserId,
                    isActive: true
                }
            });
            // 3. Link Creator to Org
            await tx.organisation.update({
                where: { id: org.id },
                data: { createdBy: user.id }
            });
            return { user, org };
        });
        const { user, org } = result;
        if (user) {
            // Audit Log
            (0, auditLogger_1.logAudit)({
                action: 'REGISTER_ORGANISATION',
                entity: 'Organisation',
                entityId: org.id,
                actorId: user.id,
                organisationId: org.id,
                details: { companyName, email }
            });
            res.status(201).json({
                _id: user.id,
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                organisationId: org.id,
                branchId: user.branchId,
                token: (0, generateToken_1.default)(user.id),
            });
        }
        else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    }
    catch (error) {
        // Unique constraint P2002
        if (error.code === 'P2002') {
            if (error.meta?.target?.includes('slug')) {
                res.status(400).json({ message: 'Company name/slug already exists, please try a variation.' });
            }
            else {
                res.status(400).json({ message: 'User or Organisation already exists' });
            }
        }
        else {
            res.status(500).json({ message: error.message });
        }
    }
};
exports.registerUser = registerUser;
/**
 * @desc    Forgot Password - Send Reset Email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            // Security: Don't reveal user existence
            res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
            return;
        }
        // Generate Reset Token
        const resetToken = crypto_1.default.randomBytes(20).toString('hex');
        // Hash it
        const resetPasswordToken = crypto_1.default
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        // Expire in 10 minutes
        const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken,
                resetPasswordExpire
            }
        });
        const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;
        const message = `
            <h1>Password Reset Request</h1>
            <p>You requested a password reset. Please click the link below to reset your password:</p>
            <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
            <p>This link expires in 10 minutes.</p>
        `;
        const sent = await emailService_1.EmailService.sendEmail(user.email, 'Password Reset Request', message);
        if (sent) {
            // Log security event
            (0, auditLogger_1.logAudit)({
                action: 'AUTH_FORGOT_PASSWORD_REQUESTED',
                entity: 'User',
                entityId: user.id,
                actorId: user.id,
                organisationId: user.organisationId || 'SYSTEM',
                details: { email: user.email }
            });
            res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
        }
        else {
            // Revert on failure
            await prisma_1.default.user.update({
                where: { id: user.id },
                data: {
                    resetPasswordToken: null,
                    resetPasswordExpire: null
                }
            });
            res.status(500).json({ message: 'Email could not be sent' });
        }
    }
    catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
exports.forgotPassword = forgotPassword;
/**
 * @desc    Reset Password
 * @route   PUT /api/auth/reset-password/:resetToken
 * @access  Public
 */
const resetPassword = async (req, res) => {
    const { resetToken } = req.params;
    const { password } = req.body;
    if (!password) {
        res.status(400).json({ message: 'Please provide a new password' });
        return;
    }
    try {
        // Hash the token from params to compare with DB
        const resetPasswordToken = crypto_1.default
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        const user = await prisma_1.default.user.findFirst({
            where: {
                resetPasswordToken,
                resetPasswordExpire: { gt: new Date() }
            }
        });
        if (!user) {
            res.status(400).json({ message: 'Invalid or expired token' });
            return;
        }
        // CRITICAL: Monitor super admin password changes
        const { monitorSuperAdminPasswordChange } = await Promise.resolve().then(() => __importStar(require('../middleware/superAdminProtection')));
        await monitorSuperAdminPasswordChange(user.id, user.id, req.ip);
        // Set new password
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpire: null
            }
        });
        // Log security event
        (0, auditLogger_1.logAudit)({
            action: 'AUTH_PASSWORD_RESET_SUCCESS',
            entity: 'User',
            entityId: user.id,
            actorId: user.id,
            organisationId: user.organisationId || 'SYSTEM',
            details: { email: user.email }
        });
        res.status(200).json({ message: 'Password reset successful' });
    }
    catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
exports.resetPassword = resetPassword;
/**
 * @desc    Get current user profile (session refresh)
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: 'Not authorized' });
        }
        res.json({
            _id: user.id,
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isBranchManager: user.isBranchManager,
            isSuperAdmin: user.isSuperAdmin,
            organisation: user.organisation,
            branchId: user.branchId,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMe = getMe;
//# sourceMappingURL=authController.js.map