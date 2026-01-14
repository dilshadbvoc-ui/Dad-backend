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
exports.deactivateUser = exports.inviteUser = exports.updateUser = exports.getUserById = exports.getUsers = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const client_1 = require("../generated/client");
const getUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[UserController] getUsers called');
        const currentUser = req.user;
        const where = { isActive: true }; // Default to active? Original was isDeleted: {$ne: true}, but schema uses isActive.
        // Wait, Mongoose schema had isDeleted check?
        // Original: const query: any = { isDeleted: { $ne: true } };
        // Prisma schema: isPlaceholder (default false). 
        // Lead has isDeleted, User has isActive.
        // Let's assume we want all existing users? 
        // Or if we want to filter logically deleted users? 
        // User model in Prisma doesn't have isDeleted, only isActive.
        // Let's stick to showing all users for now or check if soft delete is intended.
        // Original Mongoose find({ isDeleted: { $ne: true } }) implies a soft delete field exists.
        // In my Prisma schema for User I missed isDeleted. I have isActive.
        // I'll use isActive for now as a proxy or just show all for this phase.
        // 1. Organisation Scoping
        if (currentUser.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = req.query.organisationId;
            }
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(currentUser);
            if (!orgId) {
                return res.status(403).json({ message: 'User has no organisation' });
            }
            where.organisationId = orgId;
        }
        let users = yield prisma_1.default.user.findMany({
            where,
            include: {
                organisation: { select: { name: true } }, // Equivalent to populate role? No role is enum.
                reportsTo: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        position: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        console.log('[UserController] Query where:', JSON.stringify(where));
        console.log('[UserController] Users found:', users.length);
        // Transform results to match frontend expectations
        const transformedUsers = users.map(u => (Object.assign(Object.assign({}, u), { _id: u.id, id: u.id, role: { id: u.role, name: u.role }, reportsTo: u.reportsTo ? Object.assign(Object.assign({}, u.reportsTo), { id: u.reportsTo.id, _id: u.reportsTo.id }) : null })));
        res.json({ users: transformedUsers });
    }
    catch (error) {
        console.error('getUsers Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.getUsers = getUsers;
const getUserById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUser = req.user;
        const user = yield prisma_1.default.user.findUnique({
            where: { id: req.params.id },
            include: { organisation: true }
        });
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        // Security check
        if (currentUser.role !== 'super_admin') {
            const currentOrgId = (0, hierarchyUtils_1.getOrgId)(currentUser);
            const targetOrgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (currentOrgId !== targetOrgId) {
                return res.status(403).json({ message: 'Not authorized to view this user' });
            }
        }
        // Exclude password
        const { password } = user, userWithoutPassword = __rest(user, ["password"]);
        res.json(userWithoutPassword);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getUserById = getUserById;
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUser = req.user;
        const _a = req.body, { password } = _a, updateData = __rest(_a, ["password"]);
        const userId = req.params.id;
        // Security Check
        if (currentUser.role !== 'super_admin') {
            const tempUser = yield prisma_1.default.user.findUnique({ where: { id: userId }, include: { organisation: true } });
            if (!tempUser)
                return res.status(404).json({ message: 'User not found' });
            const isSelfUpdate = userId === currentUser.id;
            const currentOrgId = (0, hierarchyUtils_1.getOrgId)(currentUser);
            const targetOrgId = (0, hierarchyUtils_1.getOrgId)(tempUser);
            const orgMatch = currentOrgId && targetOrgId && currentOrgId === targetOrgId;
            if (!isSelfUpdate && !orgMatch) {
                return res.status(403).json({ message: 'Not authorized to update this user' });
            }
        }
        // Process Update Data
        const dataToUpdate = Object.assign({}, updateData);
        // Handle reportsTo mapping
        if (updateData.reportsTo) {
            if (updateData.reportsTo === userId) {
                return res.status(400).json({ message: 'User cannot report to themselves' });
            }
            const manager = yield prisma_1.default.user.findUnique({ where: { id: updateData.reportsTo } });
            if (!manager)
                return res.status(400).json({ message: 'Manager not found' });
            // Check Org
            const managerOrgId = (0, hierarchyUtils_1.getOrgId)(manager);
            const targetUser = yield prisma_1.default.user.findUnique({ where: { id: userId } });
            const targetOrgId = (0, hierarchyUtils_1.getOrgId)(targetUser) || (0, hierarchyUtils_1.getOrgId)(currentUser);
            if (targetOrgId !== managerOrgId) {
                return res.status(400).json({ message: 'Manager must belong to same organisation' });
            }
            dataToUpdate.reportsTo = { connect: { id: updateData.reportsTo } };
        }
        if (password && password.trim() !== '') {
            const salt = yield bcryptjs_1.default.genSalt(10);
            dataToUpdate.password = yield bcryptjs_1.default.hash(password, salt);
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: userId },
            data: dataToUpdate
        });
        const { password: _ } = updatedUser, userNoPass = __rest(updatedUser, ["password"]);
        res.json(userNoPass);
    }
    catch (error) {
        console.error('[UpdateUser Error]', error);
        res.status(500).json({ message: error.message });
    }
});
exports.updateUser = updateUser;
const inviteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, firstName, lastName, role, organisationId, position, reportsTo, password } = req.body;
        const currentUser = req.user;
        if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
            return res.status(403).json({ message: 'Only administrators can invite users' });
        }
        const existingUser = yield prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }
        let targetOrgId = (0, hierarchyUtils_1.getOrgId)(currentUser);
        if (currentUser.role === 'super_admin' && organisationId) {
            targetOrgId = organisationId;
        }
        if (!targetOrgId)
            return res.status(400).json({ message: 'Organisation is required' });
        // Check limits and increment counter
        const org = yield prisma_1.default.organisation.findUnique({ where: { id: targetOrgId } });
        if (org) {
            const userCount = yield prisma_1.default.user.count({ where: { organisationId: targetOrgId, isActive: true } });
            if (userCount >= org.userLimit) {
                return res.status(403).json({ message: 'User limit reached' });
            }
        }
        // Generate UserID
        let generatedUserId;
        if (org) {
            // Atomic update
            const updatedOrg = yield prisma_1.default.organisation.update({
                where: { id: targetOrgId },
                data: { userIdCounter: { increment: 1 } }
            });
            const prefix = updatedOrg.name.slice(0, 3).toUpperCase();
            const counter = updatedOrg.userIdCounter;
            generatedUserId = `${prefix}${counter.toString().padStart(3, '0')}`;
        }
        const tempPassword = password || Math.random().toString(36).slice(-8);
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedPassword = yield bcryptjs_1.default.hash(tempPassword, salt);
        const newUser = yield prisma_1.default.user.create({
            data: {
                email,
                firstName,
                lastName,
                password: hashedPassword,
                role: role || client_1.UserRole.sales_rep,
                organisation: { connect: { id: targetOrgId } },
                position,
                userId: generatedUserId,
                reportsTo: reportsTo ? { connect: { id: reportsTo } } : undefined,
                isActive: true
            }
        });
        res.status(201).json({
            user: { id: newUser.id, email: newUser.email, firstName: newUser.firstName },
            message: 'User invited successfully'
        });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.inviteUser = inviteUser;
const deactivateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield prisma_1.default.user.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });
        res.json({ message: 'User deactivated', user });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deactivateUser = deactivateUser;
