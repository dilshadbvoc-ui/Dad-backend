import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

export const getProducts = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const search = req.query.search as string;
        const skip = (page - 1) * limit;
        const user = (req as any).user;

        const where: Prisma.ProductWhereInput = { isDeleted: false };

        // Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        } else {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'User not associated with an organisation' });
            where.organisationId = orgId;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } }
            ];
        }

        const count = await prisma.product.count({ where });
        const products = await prisma.product.findMany({
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
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createProduct = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(403).json({ message: 'No org' });

        // Check for existing SKU
        if (req.body.sku) {
            const existing = await prisma.product.findFirst({
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

        const product = await prisma.product.create({
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

        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getProductById = async (req: Request, res: Response) => {
    try {
        const product = await prisma.product.findFirst({
            where: { id: req.params.id, isDeleted: false }
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateProduct = async (req: Request, res: Response) => {
    try {
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: req.body
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message }); // Handle RecordNotFound gracefully if needed
    }
};

export const deleteProduct = async (req: Request, res: Response) => {
    try {
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
