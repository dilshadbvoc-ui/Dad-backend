import { Request, Response } from 'express';
import prisma from '../config/prisma';
import archiver from 'archiver';
import path from 'path';

export const generateBackup = async (req: Request, res: Response) => {
    try {
        const { organisationId } = req.params;
        const user = (req as any).user;

        // Extra safety check just in case
        if (user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Forbidden. Only super admins can backup data.' });
        }

        const org = await prisma.organisation.findUnique({
            where: { id: organisationId },
            select: { name: true, slug: true }
        });

        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }

        // Fetch data simultaneously
        const [
            users, teams, branches, leads, contacts, accounts, opportunities,
            products, quotes, quoteLineItems, tasks, interactions, calendarEvents,
            customFields, campaigns, emailLists
        ] = await Promise.all([
            prisma.user.findMany({ where: { organisationId } }),
            prisma.team.findMany({ where: { organisationId } }),
            prisma.branch.findMany({ where: { organisationId } }),
            prisma.lead.findMany({ where: { organisationId } }),
            prisma.contact.findMany({ where: { organisationId } }),
            prisma.account.findMany({ where: { organisationId } }),
            prisma.opportunity.findMany({ where: { organisationId } }),
            prisma.product.findMany({ where: { organisationId } }),
            prisma.quote.findMany({ where: { organisationId } }),
            prisma.quoteLineItem.findMany({ where: { quote: { organisationId } } }), // Line items are tied to Quotes
            prisma.task.findMany({ where: { organisationId } }),
            prisma.interaction.findMany({ where: { organisationId } }),
            prisma.calendarEvent.findMany({ where: { organisationId } }),
            prisma.customField.findMany({ where: { organisationId } }),
            prisma.campaign.findMany({ where: { organisationId } }),
            prisma.emailList.findMany({ where: { organisationId } })
        ]);

        const backupData = {
            metadata: {
                organisation: org,
                generatedAt: new Date().toISOString(),
                generatedBy: user.id
            },
            data: {
                users,
                teams,
                branches,
                customFields,
                leads,
                accounts,
                contacts,
                opportunities,
                products,
                quotes,
                quoteLineItems,
                tasks,
                interactions,
                calendarEvents,
                campaigns,
                emailLists
            }
        };

        // Stream as a Zip file
        const filename = `backup-${org.slug}-${new Date().toISOString().split('T')[0]}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).send({ error: err.message });
        });

        archive.pipe(res);

        // Append the JSON data to the zip file as 'backup.json'
        archive.append(JSON.stringify(backupData, null, 2), { name: 'backup.json' });

        await archive.finalize();

    } catch (error) {
        console.error('Backup Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: (error as Error).message });
        }
    }
};

import AdmZip from 'adm-zip';

export const restoreBackup = async (req: Request, res: Response) => {
    try {
        const { organisationId } = req.params;
        const user = (req as any).user;

        // Extra safety check just in case
        if (user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Forbidden. Only super admins can restore data.' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No backup file uploaded' });
        }

        const org = await prisma.organisation.findUnique({
            where: { id: organisationId }
        });

        if (!org) {
            return res.status(404).json({ message: 'Target Organisation not found' });
        }

        // 1. Read the Zip file from memory
        const zip = new AdmZip(req.file.buffer);
        const backupEntry = zip.getEntry('backup.json');

        if (!backupEntry) {
            return res.status(400).json({ message: 'Invalid backup archive. Missing backup.json.' });
        }

        // 2. Parse the JSON
        const backupDataString = backupEntry.getData().toString('utf8');
        const parsed = JSON.parse(backupDataString);

        const data = parsed.data;

        if (!data) {
            return res.status(400).json({ message: 'Malformed backup data.' });
        }

        // 3. Clear existing organisation data and insert new data in a single transaction
        await prisma.$transaction(async (tx) => {
            // Retrieve Quote IDs to delete line items
            const quotes = await tx.quote.findMany({ where: { organisationId }, select: { id: true } });
            const quoteIds = quotes.map(q => q.id);

            // Delete child properties first to prevent FK constraint violations
            if (quoteIds.length > 0) {
                await tx.quoteLineItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
            }
            await tx.quote.deleteMany({ where: { organisationId } });
            await tx.calendarEvent.deleteMany({ where: { organisationId } });
            await tx.interaction.deleteMany({ where: { organisationId } });
            await tx.task.deleteMany({ where: { organisationId } });
            await tx.opportunity.deleteMany({ where: { organisationId } });
            await tx.contact.deleteMany({ where: { organisationId } });
            await tx.account.deleteMany({ where: { organisationId } });
            await tx.lead.deleteMany({ where: { organisationId } });
            await tx.product.deleteMany({ where: { organisationId } });
            await tx.customField.deleteMany({ where: { organisationId } });
            await tx.branch.deleteMany({ where: { organisationId } });
            await tx.emailList.deleteMany({ where: { organisationId } });
            await tx.campaign.deleteMany({ where: { organisationId } });

            // Delete users and teams last
            await tx.team.deleteMany({ where: { organisationId } });

            // Do not delete super_admins if they happen to exist in an org (highly rare)
            await tx.user.deleteMany({
                where: {
                    organisationId,
                    role: { not: 'super_admin' }
                }
            });

            // 4. Insert imported data in dependency order
            // Users and teams
            if (data.users?.length > 0) await tx.user.createMany({ data: data.users });
            if (data.teams?.length > 0) await tx.team.createMany({ data: data.teams });
            if (data.branches?.length > 0) await tx.branch.createMany({ data: data.branches });
            if (data.customFields?.length > 0) await tx.customField.createMany({ data: data.customFields });
            if (data.campaigns?.length > 0) await tx.campaign.createMany({ data: data.campaigns });
            if (data.emailLists?.length > 0) await tx.emailList.createMany({ data: data.emailLists });

            // CRM Core
            if (data.accounts?.length > 0) await tx.account.createMany({ data: data.accounts });
            if (data.contacts?.length > 0) await tx.contact.createMany({ data: data.contacts });
            if (data.leads?.length > 0) await tx.lead.createMany({ data: data.leads });
            if (data.opportunities?.length > 0) await tx.opportunity.createMany({ data: data.opportunities });

            // Products & Quotes
            if (data.products?.length > 0) await tx.product.createMany({ data: data.products });
            if (data.quotes?.length > 0) await tx.quote.createMany({ data: data.quotes });
            if (data.quoteLineItems?.length > 0) await tx.quoteLineItem.createMany({ data: data.quoteLineItems });

            // Activities
            if (data.tasks?.length > 0) await tx.task.createMany({ data: data.tasks });
            if (data.interactions?.length > 0) await tx.interaction.createMany({ data: data.interactions });
            if (data.calendarEvents?.length > 0) await tx.calendarEvent.createMany({ data: data.calendarEvents });
        }, {
            timeout: 120000 // Allow up to 2 mins for large restorations
        });

        res.json({ message: 'Backup restored successfully!' });
    } catch (error) {
        console.error('Restore Error:', error);
        res.status(500).json({ message: 'Failed to restore backup.', error: (error as Error).message });
    }
};
