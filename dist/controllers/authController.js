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
exports.registerUser = exports.authUser = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const generateToken_1 = __importDefault(require("../utils/generateToken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("../generated/client");
// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);
    if (!email || !password) {
        console.log('Login failed: Missing email or password');
        res.status(400).json({ message: 'Please provide email and password' });
        return;
    }
    try {
        const user = yield prisma_1.default.user.findFirst({
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
        if (user && (yield bcryptjs_1.default.compare(password, user.password))) {
            console.log(`Login SUCCESS for: ${email}`);
            // Check if active
            if (!user.isActive) {
                res.status(401).json({ message: 'User account is deactivated' });
                return;
            }
            res.json({
                _id: user.id, // Keep _id for frontend compatibility if needed
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                organisation: user.organisation,
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
});
exports.authUser = authUser;
// @desc    Register a new user & organisation
// @route   POST /api/auth/register
// @access  Public
const registerUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { firstName, lastName, email, password, companyName } = req.body;
    try {
        const userExists = yield prisma_1.default.user.findUnique({
            where: { email }
        });
        if (userExists) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }
        // 1. Create Organisation
        const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substr(2, 4);
        // Transaction to ensure atomicity
        const result = yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const org = yield tx.organisation.create({
                data: {
                    name: companyName,
                    slug,
                    domain: email.split('@')[1] || 'unknown.com',
                    status: 'active',
                    subscription: {
                        status: 'trial',
                        startDate: new Date(),
                        autoRenew: false
                    },
                    userIdCounter: 1
                }
            });
            // Generate userId
            const prefix = companyName.slice(0, 3).toUpperCase();
            const generatedUserId = `${prefix}001`;
            // Hash password
            const salt = yield bcryptjs_1.default.genSalt(10);
            const hashedPassword = yield bcryptjs_1.default.hash(password, salt);
            // 2. Create Admin User
            const user = yield tx.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    password: hashedPassword,
                    role: client_1.UserRole.super_admin,
                    organisationId: org.id,
                    userId: generatedUserId,
                    isActive: true
                }
            });
            // 3. Link Creator to Org
            yield tx.organisation.update({
                where: { id: org.id },
                data: { createdBy: user.id }
            });
            return { user, org };
        }));
        const { user, org } = result;
        if (user) {
            res.status(201).json({
                _id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                organisation: org.id,
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
            if ((_b = (_a = error.meta) === null || _a === void 0 ? void 0 : _a.target) === null || _b === void 0 ? void 0 : _b.includes('slug')) {
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
});
exports.registerUser = registerUser;
