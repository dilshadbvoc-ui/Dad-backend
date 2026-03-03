"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLandingPageBySlug = exports.deleteLandingPage = exports.updateLandingPage = exports.createLandingPage = exports.getLandingPages = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getLandingPages = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const pages = await prisma_1.default.landingPage.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(pages);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getLandingPages = getLandingPages;
const createLandingPage = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const page = await prisma_1.default.landingPage.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(page);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createLandingPage = createLandingPage;
const updateLandingPage = async (req, res) => {
    try {
        const page = await prisma_1.default.landingPage.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(page);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateLandingPage = updateLandingPage;
const deleteLandingPage = async (req, res) => {
    try {
        await prisma_1.default.landingPage.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Landing Page deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteLandingPage = deleteLandingPage;
const getLandingPageBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const page = await prisma_1.default.landingPage.findFirst({
            where: {
                slug,
                isDeleted: false
            }
        });
        if (!page) {
            return res.status(404).json({ message: 'Landing page not found' });
        }
        res.json(page);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getLandingPageBySlug = getLandingPageBySlug;
