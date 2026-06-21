"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.admin = exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../config/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const roleUtils_1 = require("../utils/roleUtils");
const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            console.log(`[AuthDebug] Incoming token: ${token.substring(0, 20)}...`);
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret_key_change_this');
            console.log('[AuthDebug] Decoded payload:', decoded);
            // Fetch user from Postgres using Prisma
            const user = await prisma_1.default.user.findUnique({
                where: { id: decoded.id },
                include: { organisation: true }
            });
            if (!user) {
                console.warn(`[AuthDebug] User not found for ID: ${decoded.id}`);
                res.status(401).json({ message: 'Not authorized, token failed' });
                return;
            }
            console.log(`[AuthDebug] Authenticated user: ${user.email} (Role: ${user.role})`);
            // Exclude password from the object attached to request
            const userWithoutPassword = { ...user };
            delete userWithoutPassword.password;
            // Check if user manages any branch
            const branchManaged = await prisma_1.default.branch.findFirst({
                where: { managerId: user.id, isDeleted: false }
            });
            // Attach user to request
            req.user = {
                ...userWithoutPassword,
                isSuperAdmin: (0, roleUtils_1.isSuperAdmin)(user),
                isBranchManager: !!branchManaged
            };
            // console.log(`[AuthMiddleware] Authenticated user: ${ user.email } `); 
            return next();
        }
        catch (error) {
            // Real token verification failures get 401 (forces logout)
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message?.includes('jwt')) {
                console.warn(`[AuthMiddleware] JWT verification failed: ${error.message || error.name}`);
                res.status(401).json({ message: 'Not authorized, token failed' });
            }
            else {
                console.error('[AuthMiddleware] Database or Internal Error:', error);
                // Database or internal connection errors get 503 (keeps users logged in, doesn't wipe localStorage)
                res.status(503).json({ message: 'Database service temporarily unavailable, please try again' });
            }
        }
    }
    // Check for API Key if no Bearer token
    if (!token && req.headers['x-api-key']) {
        try {
            const rawKey = req.headers['x-api-key'];
            // Key format: crm_HEXSTRING (ignore prefix for hash if needed, but model says keyHash stores hash of full key)
            // Model says: verifyKey = sha256 of key.
            const keyHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
            const apiKey = await prisma_1.default.apiKey.findUnique({
                where: { keyHash, isDeleted: false, status: 'active' }
            });
            if (apiKey) {
                // Update usage stats (optional, could be fire-and-forget)
                // await prisma.apiKey.update({ where: { id: apiKey.id }, data: { usage: { ...apiKey.usage, lastUsedAt: new Date() } } });
                const user = await prisma_1.default.user.findUnique({
                    where: { id: apiKey.createdById },
                    include: { organisation: true }
                });
                if (user) {
                    const userWithoutPassword = { ...user };
                    delete userWithoutPassword.password;
                    // Check if user manages any branch
                    const branchManaged = await prisma_1.default.branch.findFirst({
                        where: { managerId: user.id, isDeleted: false }
                    });
                    req.user = {
                        ...userWithoutPassword,
                        isSuperAdmin: (0, roleUtils_1.isSuperAdmin)(user),
                        isBranchManager: !!branchManaged
                    };
                    return next();
                }
            }
        }
        catch (error) {
            console.error('[AuthMiddleware] API Key Error:', error);
            // Fallthrough to 401
        }
    }
    if (!token && !req.user) {
        res.status(401).json({ message: 'Not authorized, no token' });
        return;
    }
};
exports.protect = protect;
const admin = (req, res, next) => {
    if (req.user && ((0, roleUtils_1.normalizeRole)(req.user.role) === 'admin' || (0, roleUtils_1.isSuperAdmin)(req.user))) {
        next();
    }
    else {
        res.status(403).json({ message: 'Not authorized as an admin' });
    }
};
exports.admin = admin;
const authorize = (...roles) => {
    return (req, res, next) => {
        const userRole = req.user ? (0, roleUtils_1.normalizeRole)(req.user.role) : '';
        const normRoles = roles.map(r => r.toLowerCase().replace(/[\s-]/g, '_'));
        if (!req.user || !normRoles.includes(userRole)) {
            return res.status(403).json({ message: `User role ${req.user?.role} is not authorized` });
        }
        next();
    };
};
exports.authorize = authorize;
