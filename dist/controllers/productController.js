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
exports.getSharedProduct = exports.generateProductShareLink = exports.getProductShareConfig = exports.deleteProduct = exports.updateProduct = exports.getProductById = exports.createProduct = exports.getProducts = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search;
        const skip = (page - 1) * limit;
        const user = req.user;
        const where = { isDeleted: false };
        // Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'User not associated with an organisation' });
            where.organisationId = orgId;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } }
            ];
        }
        const count = await prisma_1.default.product.count({ where });
        const products = await prisma_1.default.product.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        });
        res.json({
            products,
            page,
            totalPages: Math.ceil(count / limit),
            totalProducts: count
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProducts = getProducts;
const createProduct = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(403).json({ message: 'No org' });
        // Check for existing SKU
        if (req.body.sku) {
            const existing = await prisma_1.default.product.findFirst({
                where: {
                    sku: req.body.sku,
                    isDeleted: false,
                    organisationId: orgId
                }
            });
            if (existing) {
                return res.status(400).json({ message: 'Product with this SKU already exists' });
            }
        }
        const product = await prisma_1.default.product.create({
            data: {
                name: req.body.name,
                sku: req.body.sku,
                description: req.body.description,
                basePrice: Number(req.body.basePrice),
                category: req.body.category,
                tags: req.body.tags,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_PRODUCT',
                entity: 'Product',
                entityId: product.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: product.name, sku: product.sku }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(product);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createProduct = createProduct;
const getProductById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
        }
        const product = await prisma_1.default.product.findFirst({ where });
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProductById = getProductById;
const updateProduct = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { id } = req.params;
        // First, verify the product exists and belongs to the organization
        const existingProduct = await prisma_1.default.product.findUnique({
            where: { id }
        });
        if (!existingProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }
        // Check organization ownership (unless super admin)
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            if (existingProduct.organisationId !== orgId) {
                return res.status(403).json({ message: 'Not authorized to update this product' });
            }
        }
        // Update the product
        const product = await prisma_1.default.product.update({
            where: { id },
            data: req.body
        });
        // Audit Log
        const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
        logAudit({
            action: 'UPDATE_PRODUCT',
            entity: 'Product',
            entityId: product.id,
            actorId: user.id,
            organisationId: product.organisationId,
            details: { name: product.name, sku: product.sku }
        });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateProduct = updateProduct;
const deleteProduct = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
        }
        const product = await prisma_1.default.product.findFirst({ where });
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        await prisma_1.default.product.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        // Audit Log
        const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
        logAudit({
            action: 'DELETE_PRODUCT',
            entity: 'Product',
            entityId: req.params.id,
            actorId: user.id,
            organisationId: product.organisationId,
            details: { name: product.name, sku: product.sku }
        });
        res.json({ message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteProduct = deleteProduct;
const getProductShareConfig = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { productId } = req.params;
        if (!orgId)
            return res.status(403).json({ message: 'No org' });
        const share = await prisma_1.default.productShare.findFirst({
            where: { productId, organisationId: orgId }
        });
        if (!share) {
            // Return empty config if not shared yet
            return res.json({
                youtubeUrl: '',
                customTitle: '',
                customDescription: ''
            });
        }
        res.json({
            youtubeUrl: share.youtubeUrl || '',
            customTitle: share.customTitle || '',
            customDescription: share.customDescription || '',
            slug: share.slug,
            views: share.views,
            url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/shared-product/${share.slug}`
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProductShareConfig = getProductShareConfig;
const generateProductShareLink = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { productId } = req.params;
        const { youtubeUrl, customTitle, customDescription, leadId } = req.body;
        if (!orgId)
            return res.status(403).json({ message: 'No org' });
        // Check if product exists and belongs to org
        const product = await prisma_1.default.product.findFirst({
            where: { id: productId, organisationId: orgId }
        });
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        // Check if share link already exists
        let share = await prisma_1.default.productShare.findFirst({
            where: { productId }
        });
        if (!share) {
            // Create new share link
            // Generate a random slug (8 chars)
            const slug = Math.random().toString(36).substring(2, 10);
            share = await prisma_1.default.productShare.create({
                data: {
                    productId,
                    organisationId: orgId,
                    createdById: user.id,
                    slug,
                    notificationsEnabled: true,
                    youtubeUrl,
                    customTitle,
                    customDescription
                }
            });
        }
        else {
            // Update existing share with new details if provided
            share = await prisma_1.default.productShare.update({
                where: { id: share.id },
                data: {
                    youtubeUrl,
                    customTitle,
                    customDescription
                }
            });
        }
        // Create timeline entry if leadId is provided
        if (leadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
            try {
                const lead = await prisma_1.default.lead.findUnique({
                    where: { id: leadId, organisationId: orgId },
                    select: { id: true, firstName: true, lastName: true }
                });
                if (lead) {
                    // Create interaction record for timeline
                    await prisma_1.default.interaction.create({
                        data: {
                            type: 'other',
                            direction: 'outbound',
                            subject: `Product Link Shared: ${product.name}`,
                            description: `Shareable product link for "${product.name}" was generated and sent to ${lead.firstName} ${lead.lastName}.`,
                            date: new Date(),
                            leadId: lead.id,
                            createdById: user.id,
                            organisationId: orgId
                        }
                    });
                }
            }
            catch (e) {
                console.error('Error creating timeline entry for share:', e);
            }
        }
        const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const shareUrl = `${baseUrl}/shared-product/${share.slug}`;
        res.json({
            slug: share.slug,
            url: shareUrl,
            views: share.views,
            youtubeUrl: share.youtubeUrl,
            customTitle: share.customTitle,
            customDescription: share.customDescription
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.generateProductShareLink = generateProductShareLink;
const getSharedProduct = async (req, res) => {
    try {
        const { slug } = req.params;
        const leadId = req.query.leadId;
        const share = await prisma_1.default.productShare.findUnique({
            where: { slug },
            include: {
                product: true,
                createdBy: { select: { firstName: true, lastName: true, id: true, email: true, phone: true } },
                organisation: { select: { isDeleted: true, name: true } }
            }
        });
        if (!share)
            return res.status(404).json({ message: 'Product link not found' });
        // Security checks: ensure product and organisation are not deleted
        if (share.product.isDeleted || share.organisation.isDeleted) {
            return res.status(404).json({ message: 'Product is no longer available' });
        }
        // Increment views (async, don't await)
        prisma_1.default.productShare.update({
            where: { id: share.id },
            data: { views: { increment: 1 } }
        }).catch(console.error);
        // Log interaction in lead timeline if leadId is provided
        if (leadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
            try {
                const lead = await prisma_1.default.lead.findUnique({
                    where: { id: leadId },
                    select: { id: true, firstName: true, lastName: true, company: true, organisationId: true }
                });
                if (lead) {
                    // Create interaction record for timeline
                    await prisma_1.default.interaction.create({
                        data: {
                            type: 'other',
                            direction: 'outbound',
                            subject: `Product Shared: ${share.product.name}`,
                            description: `Product "${share.product.name}" was shared with this lead. The lead viewed the product details via shareable link.`,
                            date: new Date(),
                            leadId: lead.id,
                            createdById: share.createdById,
                            organisationId: lead.organisationId
                        }
                    });
                }
            }
            catch (e) {
                console.error('Error creating timeline interaction:', e);
            }
        }
        // Send Notification (if enabled)
        if (share.notificationsEnabled) {
            const { NotificationService } = await Promise.resolve().then(() => __importStar(require('../services/notificationService')));
            const { getIO } = await Promise.resolve().then(() => __importStar(require('../socket')));
            const viewedAt = new Date();
            const time = viewedAt.toLocaleString('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
            let viewerName = 'A customer';
            let leadInfo = null;
            // If leadId is provided, try to fetch lead details (with UUID validation)
            if (leadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
                try {
                    const lead = await prisma_1.default.lead.findUnique({
                        where: { id: leadId },
                        select: { id: true, firstName: true, lastName: true, company: true, phone: true, email: true }
                    });
                    if (lead) {
                        viewerName = `${lead.firstName} ${lead.lastName}${lead.company ? ` from ${lead.company}` : ''}`;
                        leadInfo = {
                            id: lead.id,
                            name: `${lead.firstName} ${lead.lastName}`,
                            company: lead.company,
                            phone: lead.phone,
                            email: lead.email
                        };
                    }
                }
                catch (e) {
                    console.error('Error fetching lead for view tracking:', e);
                }
            }
            const notificationMessage = `${viewerName} viewed your product "${share.product.name}" at ${time}.`;
            // Send database notification
            NotificationService.send(share.createdById, 'Product Viewed', notificationMessage, 'info').catch(console.error);
            // Send real-time Socket.io notification
            const io = getIO();
            if (io) {
                io.to(share.createdById).emit('product_view_notification', {
                    type: 'product_view',
                    title: 'Product Viewed',
                    message: notificationMessage,
                    productId: share.product.id,
                    productName: share.product.name,
                    shareSlug: share.slug,
                    viewedAt: viewedAt.toISOString(),
                    viewerName,
                    lead: leadInfo,
                    timestamp: Date.now()
                });
                console.log(`[Real-time] Product view notification sent to user ${share.createdById}`);
            }
        }
        // Fetch lead data if leadId is provided
        let leadData = null;
        if (leadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
            try {
                const lead = await prisma_1.default.lead.findUnique({
                    where: { id: leadId },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        company: true,
                        organisationId: true
                    }
                });
                if (lead) {
                    leadData = {
                        firstName: lead.firstName,
                        lastName: lead.lastName,
                        phone: lead.phone
                    };
                }
            }
            catch (e) {
                console.error('Error fetching lead data:', e);
            }
        }
        res.json({
            product: share.product,
            seller: share.createdBy,
            organisation: {
                name: share.organisation.name
            },
            shareConfig: {
                youtubeUrl: share.youtubeUrl,
                customTitle: share.customTitle,
                customDescription: share.customDescription
            },
            lead: leadData
        });
        // Debug logging
        console.log('Shared product data sent:', {
            productName: share.product.name,
            hasBrochure: !!share.product.brochureUrl,
            brochureUrl: share.product.brochureUrl,
            hasYoutubeUrl: !!share.youtubeUrl,
            youtubeUrl: share.youtubeUrl,
            customTitle: share.customTitle,
            customDescription: share.customDescription
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getSharedProduct = getSharedProduct;
