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
exports.globalSearch = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const globalSearch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.json({ results: [] });
        }
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return res.json({ results: [] });
        }
        // Perform parallel searches
        const [leads, contacts, accounts, opportunities] = yield Promise.all([
            // LEADS
            prisma_1.default.lead.findMany({
                where: {
                    organisationId: orgId,
                    OR: [
                        { firstName: { contains: query, mode: 'insensitive' } },
                        { lastName: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' } },
                        { company: { contains: query, mode: 'insensitive' } },
                        { phone: { contains: query, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, firstName: true, lastName: true, email: true, company: true }
            }),
            // CONTACTS
            prisma_1.default.contact.findMany({
                where: {
                    organisationId: orgId,
                    OR: [
                        { firstName: { contains: query, mode: 'insensitive' } },
                        { lastName: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' } }
                        // Excluding phone search for now as it is a JSON field or requires complex query
                    ]
                },
                take: 5,
                select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true }
            }),
            // ACCOUNTS
            prisma_1.default.account.findMany({
                where: {
                    organisationId: orgId,
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { industry: { contains: query, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, name: true, industry: true, website: true }
            }),
            // OPPORTUNITIES
            prisma_1.default.opportunity.findMany({
                where: {
                    organisationId: orgId,
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } }
                    ]
                },
                take: 5,
                select: { id: true, name: true, amount: true, stage: true }
            })
        ]);
        // Format results
        const formattedResults = [
            ...leads.map(l => ({ type: 'lead', id: l.id, title: `${l.firstName} ${l.lastName}`, subtitle: l.company || l.email })),
            ...contacts.map(c => ({ type: 'contact', id: c.id, title: `${c.firstName} ${c.lastName}`, subtitle: c.jobTitle || c.email })),
            ...accounts.map(a => ({ type: 'account', id: a.id, title: a.name, subtitle: a.industry || a.website })),
            ...opportunities.map(o => ({ type: 'opportunity', id: o.id, title: o.name, subtitle: `Stage: ${o.stage}` }))
        ];
        res.json({ results: formattedResults });
    }
    catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Search failed' });
    }
});
exports.globalSearch = globalSearch;
