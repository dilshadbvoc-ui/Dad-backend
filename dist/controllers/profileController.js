"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.updateProfile = exports.getProfile = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: { organisation: true }
        });
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        const userWithoutPassword = { ...user };
        delete userWithoutPassword.password;
        res.json({
            ...userWithoutPassword,
            role: { id: user.role, name: user.role } // Transform for frontend
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProfile = getProfile;
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const updateData = { ...req.body };
        // DEBUG LOGGING
        if (updateData.profileImage) {
            console.log(`[ProfileController] updateUser called with profileImage: ${updateData.profileImage}`);
        }
        else {
            console.log(`[ProfileController] updateUser called without profileImage`);
        }
        delete updateData.password;
        delete updateData.email;
        const user = await prisma_1.default.user.update({
            where: { id: userId },
            data: updateData
        });
        const userWithoutPassword = { ...user };
        delete userWithoutPassword.password;
        res.json(userWithoutPassword);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateProfile = updateProfile;
const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        const user = await prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        const isMatch = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        await prisma_1.default.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.changePassword = changePassword;
