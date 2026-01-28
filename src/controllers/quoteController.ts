import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

export const getQuotes = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const search = req.query.search as string;
        const skip = (page - 1) * limit;
        const user = (req as any).user;

        const where: Prisma.QuoteWhereInput = { isDeleted: false };

        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        } else {
            const orgId = getOrgId(user);
            if (orgId) where.organisationId = orgId;
        }

        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            where.OR = [
                { assignedToId: { in: subordinateIds } },
                { createdById: { in: subordinateIds } }
            ];
        }

        if (search) {
            const searchParams: Prisma.QuoteWhereInput[] = [
                { title: { contains: search, mode: 'insensitive' } },
                { quoteNumber: { contains: search, mode: 'insensitive' } }
            ];
            // If explicit OR already exists (from hierarchy), merge it carefully (Prisma doesn't implicitly merge top-level ORs logically the same way Mongoose does? 
            // Prisma AND: [ { OR: hierarchy }, { OR: search } ] is better
            if (where.OR) {
                where.AND = [
                    { OR: where.OR as Prisma.QuoteWhereInput[] },
                    { OR: searchParams }
                ];
                delete where.OR; // Move hierarchy restriction to AND block
            } else {
                where.OR = searchParams;
            }
        }

        const count = await prisma.quote.count({ where });
        const quotes = await prisma.quote.findMany({
            where,
            include: {
                account: { select: { name: true } },
                contact: { select: { firstName: true, lastName: true } },
                opportunity: { select: { name: true } }
            },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            quotes,
            page,
            totalPages: Math.ceil(count / limit),
            totalQuotes: count
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createQuote = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        // Generate quote number if not provided
        let quoteNumber = req.body.quoteNumber;
        if (!quoteNumber) {
            const count = await prisma.quote.count({ where: { organisationId: orgId } });
            quoteNumber = `QT-${String(count + 1).padStart(5, '0')}`;
        }

        const data: Prisma.QuoteCreateInput = {
            quoteNumber,
            title: req.body.title,
            description: req.body.description,
            subtotal: Number(req.body.subtotal),
            totalDiscount: Number(req.body.totalDiscount),
            totalTax: Number(req.body.totalTax),
            grandTotal: Number(req.body.grandTotal),
            validUntil: req.body.validUntil, // Date string
            status: req.body.status || 'draft',

            organisation: { connect: { id: orgId } },
            createdBy: { connect: { id: user.id } },
        };

        if (req.body.account) data.account = { connect: { id: req.body.account } };
        if (req.body.contact) data.contact = { connect: { id: req.body.contact } };
        if (req.body.opportunity) data.opportunity = { connect: { id: req.body.opportunity } };

        // Handle Line Items
        if (req.body.lineItems && Array.isArray(req.body.lineItems)) {
            data.lineItems = {
                create: req.body.lineItems.map((item: any) => ({
                    productName: item.productName,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    total: Number(item.total),
                    product: item.product ? { connect: { id: item.product } } : undefined
                    // Add other fields as per schema
                }))
            };
        }

        const quote = await prisma.quote.create({
            data,
            include: { lineItems: true } // Return with line items
        });

        res.status(201).json(quote);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getQuoteById = async (req: Request, res: Response) => {
    try {
        const quote = await prisma.quote.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: {
                account: true,
                contact: true,
                opportunity: true,
                lineItems: { include: { product: true } }
            }
        });
        if (!quote) return res.status(404).json({ message: 'Quote not found' });
        res.json(quote);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateQuote = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        const lineItemsData = updates.lineItems;
        delete updates.lineItems; // Handle separately

        // Relation scalar cleanup if any
        if (updates.account && typeof updates.account === 'string') updates.account = { connect: { id: updates.account } };

        // Simple update of Quote scalars
        const quoteUpdate = prisma.quote.update({
            where: { id },
            data: updates
        });

        // If line items are present, we might need a transaction to replace them?
        // Or using update -> deleteMany -> create logic inside nested write?
        // Prisma transaction is safer.
        const operations = [];

        if (lineItemsData) {
            operations.push(prisma.quoteLineItem.deleteMany({ where: { quoteId: id } }));
            operations.push(prisma.quote.update({
                where: { id },
                data: {
                    lineItems: {
                        create: lineItemsData.map((item: any) => ({
                            productName: item.productName,
                            quantity: Number(item.quantity),
                            unitPrice: Number(item.unitPrice),
                            total: Number(item.total),
                            product: item.product ? { connect: { id: item.product } } : undefined
                        }))
                    }
                }
            }));
        } else {
            operations.push(quoteUpdate);
        }

        // Just run the update (or transaction if lines updated)
        let result;
        if (lineItemsData) {
            // We need to run delete then update. But if we use transaction, we need the result of the LAST operation.
            // Warning: updates object shouldn't contain lineItems.
            // The second op in transaction does the update.
            // Note: 'updates' passed to quoteUpdate might clash if we run two updates.
            // Let's do:
            // 1. Delete items
            // 2. Update quote + Create new items
            await prisma.$transaction([
                prisma.quoteLineItem.deleteMany({ where: { quoteId: id } }),
                prisma.quote.update({
                    where: { id },
                    data: {
                        ...updates, // Scalars
                        lineItems: {
                            create: lineItemsData.map((item: any) => ({
                                productName: item.productName,
                                quantity: Number(item.quantity),
                                unitPrice: Number(item.unitPrice),
                                total: Number(item.total),
                                product: item.product ? { connect: { id: item.product } } : undefined
                            }))
                        }
                    },
                    include: { lineItems: true }
                })
            ]);
            result = await prisma.quote.findUnique({ where: { id }, include: { lineItems: true } });
        } else {
            result = await prisma.quote.update({
                where: { id },
                data: updates,
                include: { lineItems: true }
            });
        }

        if (!result) return res.status(404).json({ message: 'Quote not found' });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};


export const downloadQuotePdf = async (req: Request, res: Response) => {
    try {
        const quote = await prisma.quote.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: {
                account: true,
                contact: true,
                lineItems: true,
                organisation: true
            }
        });

        if (!quote) return res.status(404).json({ message: 'Quote not found' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${quote.quoteNumber}.pdf`);

        const { QuotePdfService } = await import('../services/QuotePdfService');
        QuotePdfService.generate(quote, res);

    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteQuote = async (req: Request, res: Response) => {
    try {
        await prisma.quote.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Quote deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
