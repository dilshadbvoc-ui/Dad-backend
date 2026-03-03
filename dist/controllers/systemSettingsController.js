"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicSystemSettings = exports.updateSystemSettings = exports.getSystemSettings = void 0;
const prisma_1 = require("../config/prisma");
const getSystemSettings = async (req, res) => {
    try {
        const { group } = req.query;
        const where = group ? { group: String(group) } : {};
        const settings = await prisma_1.prisma.systemSetting.findMany({
            where
        });
        // Convert array to object for easier frontend consumption
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
        res.json(settingsMap);
    }
    catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
};
exports.getSystemSettings = getSystemSettings;
const updateSystemSettings = async (req, res) => {
    try {
        const settings = req.body; // Expecting { key: value, key2: value2 }
        const group = req.query.group || 'general';
        const updates = Object.entries(settings).map(([key, value]) => {
            return prisma_1.prisma.systemSetting.upsert({
                where: { key },
                update: { value: String(value), group },
                create: { key, value: String(value), group }
            });
        });
        await prisma_1.prisma.$transaction(updates);
        res.json({ message: 'Settings updated successfully' });
    }
    catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ message: 'Failed to update settings' });
    }
};
exports.updateSystemSettings = updateSystemSettings;
const getPublicSystemSettings = async (req, res) => {
    try {
        // Only return specific public settings (SEO, Branding)
        // Avoid exposing sensitive keys if any
        const publicKeys = [
            'app_name',
            'seo_title',
            'seo_description',
            'seo_keywords',
            'og_image',
            'favicon_url',
            'logo_url'
        ];
        const settings = await prisma_1.prisma.systemSetting.findMany({
            where: {
                key: { in: publicKeys }
            }
        });
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
        res.json(settingsMap);
    }
    catch (error) {
        console.error('Get public settings error:', error);
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
};
exports.getPublicSystemSettings = getPublicSystemSettings;
