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
exports.deleteQuote = exports.updateQuote = exports.getQuoteById = exports.createQuote = exports.getQuotes = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getQuotes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search;
        const skip = (page - 1) * limit;
        const user = req.user;
        const where = { isDeleted: false };
        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (orgId)
                where.organisationId = orgId;
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            where.OR = [
                { assignedToId: { in: subordinateIds } },
                { createdById: { in: subordinateIds } }
            ];
        }
        if (search) {
            const searchParams = [
                { title: { contains: search, mode: 'insensitive' } },
                { quoteNumber: { contains: search, mode: 'insensitive' } }
            ];
            // If explicit OR already exists (from hierarchy), merge it carefully (Prisma doesn't implicitly merge top-level ORs logically the same way Mongoose does? 
            // Prisma AND: [ { OR: hierarchy }, { OR: search } ] is better
            if (where.OR) {
                where.AND = [
                    { OR: where.OR },
                    { OR: searchParams }
                ];
                delete where.OR; // Move hierarchy restriction to AND block
            }
            else {
                where.OR = searchParams;
            }
        }
        const count = yield prisma_1.default.quote.count({ where });
        const quotes = yield prisma_1.default.quote.findMany({
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getQuotes = getQuotes;
const createQuote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        // Generate quote number if not provided
        let quoteNumber = req.body.quoteNumber;
        if (!quoteNumber) {
            const count = yield prisma_1.default.quote.count({ where: { organisationId: orgId } });
            quoteNumber = `QT-${String(count + 1).padStart(5, '0')}`;
        }
        const data = {
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
        if (req.body.account)
            data.account = { connect: { id: req.body.account } };
        if (req.body.contact)
            data.contact = { connect: { id: req.body.contact } };
        if (req.body.opportunity)
            data.opportunity = { connect: { id: req.body.opportunity } };
        // Handle Line Items
        if (req.body.lineItems && Array.isArray(req.body.lineItems)) {
            data.lineItems = {
                create: req.body.lineItems.map((item) => ({
                    productName: item.productName,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    total: Number(item.total),
                    product: item.product ? { connect: { id: item.product } } : undefined
                    // Add other fields as per schema
                }))
            };
        }
        const quote = yield prisma_1.default.quote.create({
            data,
            include: { lineItems: true } // Return with line items
        });
        res.status(201).json(quote);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createQuote = createQuote;
const getQuoteById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const quote = yield prisma_1.default.quote.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: {
                account: true,
                contact: true,
                opportunity: true,
                lineItems: { include: { product: true } }
            }
        });
        if (!quote)
            return res.status(404).json({ message: 'Quote not found' });
        res.json(quote);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getQuoteById = getQuoteById;
const updateQuote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = Object.assign({}, req.body);
        const lineItemsData = updates.lineItems;
        delete updates.lineItems; // Handle separately
        // Relation scalar cleanup if any
        if (updates.account && typeof updates.account === 'string')
            updates.account = { connect: { id: updates.account } };
        // Simple update of Quote scalars
        const quoteUpdate = prisma_1.default.quote.update({
            where: { id },
            data: updates
        });
        // If line items are present, we might need a transaction to replace them?
        // Or using update -> deleteMany -> create logic inside nested write?
        // Prisma transaction is safer.
        const operations = [];
        if (lineItemsData) {
            operations.push(prisma_1.default.quoteLineItem.deleteMany({ where: { quoteId: id } }));
            operations.push(prisma_1.default.quote.update({
                where: { id },
                data: {
                    lineItems: {
                        create: lineItemsData.map((item) => ({
                            productName: item.productName,
                            quantity: Number(item.quantity),
                            unitPrice: Number(item.unitPrice),
                            total: Number(item.total),
                            product: item.product ? { connect: { id: item.product } } : undefined
                        }))
                    }
                }
            }));
        }
        else {
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
            yield prisma_1.default.$transaction([
                prisma_1.default.quoteLineItem.deleteMany({ where: { quoteId: id } }),
                prisma_1.default.quote.update({
                    where: { id },
                    data: Object.assign(Object.assign({}, updates), { lineItems: {
                            create: lineItemsData.map((item) => ({
                                productName: item.productName,
                                quantity: Number(item.quantity),
                                unitPrice: Number(item.unitPrice),
                                total: Number(item.total),
                                product: item.product ? { connect: { id: item.product } } : undefined
                            }))
                        } }),
                    include: { lineItems: true }
                })
            ]);
            result = yield prisma_1.default.quote.findUnique({ where: { id }, include: { lineItems: true } });
        }
        else {
            result = yield prisma_1.default.quote.update({
                where: { id },
                data: updates,
                include: { lineItems: true }
            });
        }
        if (!result)
            return res.status(404).json({ message: 'Quote not found' });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateQuote = updateQuote;
const deleteQuote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.quote.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Quote deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteQuote = deleteQuote;
