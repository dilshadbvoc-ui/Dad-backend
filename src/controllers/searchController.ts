
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const globalSearch = async (req: Request, res: Response) => {
    try {
        const query = req.query.q as string;
        if (!query || query.length < 2) {
            return res.json({ results: [] });
        }

        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.json({ results: [] });
        }

        // Perform parallel searches
        const [leads, contacts, accounts, opportunities] = await Promise.all([
            // LEADS
            prisma.lead.findMany({
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
            prisma.contact.findMany({
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
            prisma.account.findMany({
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
            prisma.opportunity.findMany({
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

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Search failed' });
    }
};
