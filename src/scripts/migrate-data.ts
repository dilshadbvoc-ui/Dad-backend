
import mongoose from 'mongoose';
import { prisma } from '../config/prisma'; // Use configured client
import dotenv from 'dotenv';
import path from 'path';

// Mongoose Models
import Organisation from '../models/Organisation';
import User from '../models/User';
import Lead from '../models/Lead';
import Account from '../models/Account';
import Contact from '../models/Contact';
import Opportunity from '../models/Opportunity';
import Product from '../models/Product';
import Quote from '../models/Quote';
import Task from '../models/Task';
import Interaction from '../models/Interaction';
import Event from '../models/Event';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let systemUserId: string | undefined;

const connectMongo = async () => {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI not defined');
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
};

const getSystemUser = async () => {
    // Find first admin user in Postgres (after migration)
    const user = await prisma.user.findFirst({ where: { role: 'super_admin' } });
    if (user) return user.id;
    // Fallback if no super_admin, try any user
    const anyUser = await prisma.user.findFirst();
    if (anyUser) return anyUser.id;
    return undefined;
};


const clearPostgres = async () => {
    // Delete in reverse order of dependency
    console.log('Clearing PostgreSQL database...');
    // Add transaction or just await sequence
    // Using explicit deletes to ensure order
    await prisma.workflowRule.deleteMany({});
    await prisma.workflow.deleteMany({});
    await prisma.campaign.deleteMany({});
    await prisma.emailList.deleteMany({});

    await prisma.quoteLineItem.deleteMany({});
    await prisma.quote.deleteMany({});

    await prisma.task.deleteMany({});
    await prisma.interaction.deleteMany({});
    await prisma.calendarEvent.deleteMany({});

    await prisma.opportunity.deleteMany({});
    await prisma.contact.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.lead.deleteMany({});
    await prisma.product.deleteMany({});

    await prisma.user.deleteMany({});
    await prisma.organisation.deleteMany({});
    console.log('PostgreSQL database cleared.');
};

const migrateOrganisations = async () => {
    console.log('Migrating Organisations...');
    const orgs = await Organisation.find({});
    for (const org of orgs) {
        await prisma.organisation.create({
            data: {
                id: org._id.toString(),
                name: org.name,
                domain: org.domain,
                slug: org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000),
                createdAt: (org as any).createdAt || new Date(),
                updatedAt: (org as any).updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${orgs.length} Organisations.`);
};

const migrateUsers = async () => {
    console.log('Migrating Users...');
    const users = await User.find({});
    for (const user of users) {
        if (!user.organisation) {
            console.warn(`Skipping user ${user.email} without organisation`);
            continue;
        }

        await prisma.user.create({
            data: {
                id: user._id.toString(),
                email: user.email,
                password: user.password, // Correct field name
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                organisationId: user.organisation.toString(),
                isActive: true,
                createdAt: (user as any).createdAt || new Date(),
                updatedAt: (user as any).updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${users.length} Users.`);

    // Set system user after users are migrated
    systemUserId = await getSystemUser();
    if (!systemUserId) console.warn('WARNING: No system user found. Migration of dependent records might fail if createdBy is missing.');
    else console.log(`System Fallback User ID: ${systemUserId}`);
};

const migrateLeads = async () => {
    console.log('Migrating Leads...');
    const leads = await Lead.find({});
    for (const lead of leads) {
        await prisma.lead.create({
            data: {
                id: lead._id.toString(),
                firstName: lead.firstName || 'Unknown',
                lastName: lead.lastName,
                email: lead.email,
                phone: lead.phone,
                company: lead.company,
                status: lead.status || 'new',
                source: lead.source || 'other',
                leadScore: lead.leadScore || 0,

                organisationId: lead.organisation.toString(),
                assignedToId: lead.assignedTo ? lead.assignedTo.toString() : undefined,

                createdAt: lead.createdAt || new Date(),
                updatedAt: lead.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${leads.length} Leads.`);
};

const migrateAccounts = async () => {
    console.log('Migrating Accounts...');
    const accounts = await Account.find({});
    for (const acc of accounts) {
        // Ensure valid owner if set
        // But we rely on raw ID. If owner deleted, this might fail unless optional?
        // Schema: ownerId String?
        await prisma.account.create({
            data: {
                id: acc._id.toString(),
                name: acc.name,
                industry: acc.industry,
                website: acc.website,
                size: acc.size,
                annualRevenue: acc.annualRevenue,
                type: acc.type || 'prospect',
                phone: acc.phone,
                address: acc.address ? JSON.parse(JSON.stringify(acc.address)) : undefined,

                organisationId: acc.organisation.toString(),
                ownerId: acc.owner ? acc.owner.toString() : undefined,

                createdAt: acc.createdAt || new Date(),
                updatedAt: acc.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${accounts.length} Accounts.`);
};

const migrateContacts = async () => {
    console.log('Migrating Contacts...');
    const contacts = await Contact.find({});
    for (const con of contacts) {
        await prisma.contact.create({
            data: {
                id: con._id.toString(),
                firstName: con.firstName,
                lastName: con.lastName,
                email: con.email,
                phones: con.phones,
                jobTitle: con.jobTitle,
                department: con.department,
                address: con.address ? JSON.parse(JSON.stringify(con.address)) : undefined,

                organisationId: con.organisation.toString(),
                ownerId: con.owner ? con.owner.toString() : undefined,
                accountId: con.account ? con.account.toString() : undefined,

                createdAt: con.createdAt || new Date(),
                updatedAt: con.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${contacts.length} Contacts.`);
};

const migrateOpportunities = async () => {
    console.log('Migrating Opportunities...');
    const opps = await Opportunity.find({});
    for (const opp of opps) {
        if (!opp.account) continue;

        await prisma.opportunity.create({
            data: {
                id: opp._id.toString(),
                name: opp.name,
                amount: opp.amount || 0,
                stage: opp.stage || 'new',
                probability: opp.probability,
                closeDate: opp.closeDate,
                description: opp.description,
                leadSource: opp.leadSource,

                organisationId: opp.organisation.toString(),
                ownerId: opp.owner ? opp.owner.toString() : undefined,
                accountId: opp.account.toString(),

                createdAt: opp.createdAt || new Date(),
                updatedAt: opp.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${opps.length} Opportunities.`);
};

const migrateProducts = async () => {
    console.log('Migrating Products...');
    const products = await Product.find({});
    for (const prod of products) {
        await prisma.product.create({
            data: {
                id: prod._id.toString(),
                name: prod.name,
                sku: prod.sku,
                description: prod.description,
                basePrice: prod.basePrice || 0,
                category: prod.category,
                tags: prod.tags || [],
                isActive: prod.isActive !== undefined ? prod.isActive : true,

                organisationId: prod.organisation.toString(),
                createdById: prod.createdBy ? prod.createdBy.toString() : undefined,

                createdAt: (prod as any).createdAt || new Date(),
                updatedAt: (prod as any).updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${products.length} Products.`);
};

const migrateQuotes = async () => {
    console.log('Migrating Quotes...');
    const quotes = await Quote.find({});
    for (const quote of quotes) {
        await prisma.quote.create({
            data: {
                id: quote._id.toString(),
                quoteNumber: quote.quoteNumber,
                title: quote.title,
                status: quote.status || 'draft',
                validUntil: quote.validUntil,
                subtotal: quote.subtotal || 0,
                totalDiscount: quote.totalDiscount || 0,
                totalTax: quote.totalTax || 0,
                grandTotal: quote.grandTotal || 0,
                description: quote.description,

                organisationId: quote.organisation.toString(),
                createdById: quote.createdBy ? quote.createdBy.toString() : systemUserId!,
                accountId: quote.account ? quote.account.toString() : undefined,
                contactId: quote.contact ? quote.contact.toString() : undefined,
                opportunityId: quote.opportunity ? quote.opportunity.toString() : undefined,

                lineItems: {
                    create: quote.lineItems ? quote.lineItems.map((item: any) => ({
                        productName: item.productName || 'Unknown Product',
                        quantity: item.quantity || 1,
                        unitPrice: item.unitPrice || 0,
                        total: item.total || 0,
                        productId: item.product ? item.product.toString() : undefined
                    })) : []
                },

                createdAt: (quote as any).createdAt || new Date(),
                updatedAt: (quote as any).updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${quotes.length} Quotes.`);
};

const migrateTasks = async () => {
    console.log('Migrating Tasks...');
    const tasks = await Task.find({});
    for (const task of tasks) {
        const data: any = {
            id: task._id.toString(),
            subject: task.subject,
            description: task.description,
            status: task.status || 'pending',
            priority: task.priority || 'medium',
            dueDate: task.dueDate,

            organisationId: task.organisation.toString(),
            assignedToId: task.assignedTo ? task.assignedTo.toString() : undefined,
            createdById: task.createdBy ? task.createdBy.toString() : systemUserId!,

            createdAt: (task as any).createdAt || new Date(),
            updatedAt: (task as any).updatedAt || new Date()
        };

        if (task.relatedTo && task.onModel) {
            const relId = task.relatedTo.toString();
            if (task.onModel === 'Lead') data.leadId = relId;
            else if (task.onModel === 'Contact') data.contactId = relId;
            else if (task.onModel === 'Account') data.accountId = relId;
            else if (task.onModel === 'Opportunity') data.opportunityId = relId;
        }

        try {
            await prisma.task.create({ data });
        } catch (e) {
            console.error(`Failed to migrate Task ${task._id}:`, e);
        }
    }
    console.log(`Migrated ${tasks.length} Tasks.`);
};

const migrateInteractions = async () => {
    console.log('Migrating Interactions...');
    const interactions = await Interaction.find({});
    for (const int of interactions) {
        const data: any = {
            id: int._id.toString(),
            type: int.type,
            direction: int.direction,
            subject: int.subject,
            description: int.description,
            date: int.date,

            callStatus: int.callStatus,
            duration: int.duration,
            phoneNumber: int.phoneNumber,
            recordingUrl: int.recordingUrl,

            organisationId: int.organisation.toString(),
            createdById: int.createdBy ? int.createdBy.toString() : undefined,

            createdAt: (int as any).createdAt || new Date(),
            updatedAt: (int as any).updatedAt || new Date()
        };

        if (int.relatedTo && int.onModel) {
            const relId = int.relatedTo.toString();
            if (int.onModel === 'Lead') data.leadId = relId;
            else if (int.onModel === 'Contact') data.contactId = relId;
            else if (int.onModel === 'Account') data.accountId = relId;
            else if (int.onModel === 'Opportunity') data.opportunityId = relId;
        }

        try {
            await prisma.interaction.create({ data });
        } catch (e) {
            console.error(`Failed to migrate Interaction ${int._id}:`, e);
            // Non-fatal, just skip
        }
    }
    console.log(`Migrated ${interactions.length} Interactions.`);
};

const migrateEvents = async () => {
    console.log('Migrating Events (to CalendarEvent)...');
    const events = await Event.find({});
    for (const event of events) {
        const data: any = {
            id: event._id.toString(),
            title: event.title,
            description: event.description,
            type: event.type || 'meeting',
            startTime: (event as any).startTime || (event as any).date || new Date(),
            endTime: (event as any).endTime || new Date(((event as any).startTime?.getTime() || Date.now()) + 3600000),
            allDay: (event as any).allDay || false,
            location: event.location,

            organisationId: event.organisation.toString(),
            createdById: event.createdBy ? event.createdBy.toString() : undefined,

            createdAt: (event as any).createdAt || new Date(),
            updatedAt: (event as any).updatedAt || new Date()
        };

        if (event.lead) data.leadId = event.lead.toString();
        if (event.contact) data.contactId = event.contact.toString();

        try {
            await prisma.calendarEvent.create({ data });
        } catch (e) {
            console.error(`Failed to migrate Event ${event._id}:`, e);
        }
    }
    console.log(`Migrated ${events.length} Events.`);
};

const main = async () => {
    try {
        await connectMongo();
        await clearPostgres();

        await migrateOrganisations();
        await migrateUsers();
        await migrateLeads();
        await migrateAccounts();
        await migrateContacts();
        await migrateProducts();
        await migrateOpportunities();
        await migrateQuotes();

        await migrateTasks();
        await migrateInteractions();
        await migrateEvents();

        console.log('--- Migration Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('Migration Fatal Error:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
};

main();
