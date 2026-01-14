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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../config/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const protect = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret_key_change_this');
            // Fetch user from Postgres using Prisma
            const user = yield prisma_1.default.user.findUnique({
                where: { id: decoded.id },
                include: { organisation: true }
            });
            if (!user) {
                res.status(401).json({ message: 'Not authorized, token failed' });
                return;
            }
            // Exclude password from the object attached to request
            const { password } = user, userWithoutPassword = __rest(user, ["password"]);
            // Attach user to request
            req.user = Object.assign(Object.assign({}, userWithoutPassword), { isSuperAdmin: user.role === 'super_admin' });
            // console.log(`[AuthMiddleware] Authenticated user: ${user.email}`); 
            return next();
        }
        catch (error) {
            console.error('[AuthMiddleware] Error:', error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }
    // Check for API Key if no Bearer token
    if (!token && req.headers['x-api-key']) {
        try {
            const rawKey = req.headers['x-api-key'];
            // Key format: crm_HEXSTRING (ignore prefix for hash if needed, but model says keyHash stores hash of full key)
            // Model says: verifyKey = sha256 of key.
            const keyHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
            const apiKey = yield prisma_1.default.apiKey.findUnique({
                where: { keyHash, isDeleted: false, status: 'active' }
            });
            if (apiKey) {
                // Update usage stats (optional, could be fire-and-forget)
                // await prisma.apiKey.update({ where: { id: apiKey.id }, data: { usage: { ...apiKey.usage, lastUsedAt: new Date() } } });
                const user = yield prisma_1.default.user.findUnique({
                    where: { id: apiKey.createdById },
                    include: { organisation: true }
                });
                if (user) {
                    const { password } = user, userWithoutPassword = __rest(user, ["password"]);
                    req.user = Object.assign(Object.assign({}, userWithoutPassword), { isSuperAdmin: user.role === 'super_admin' });
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
    }
});
exports.protect = protect;
