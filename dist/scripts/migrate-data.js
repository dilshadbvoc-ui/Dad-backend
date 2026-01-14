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
const mongoose_1 = __importDefault(require("mongoose"));
const prisma_1 = require("../config/prisma"); // Use configured client
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Mongoose Models
const Organisation_1 = __importDefault(require("../models/Organisation"));
const User_1 = __importDefault(require("../models/User"));
const Lead_1 = __importDefault(require("../models/Lead"));
const Account_1 = __importDefault(require("../models/Account"));
const Contact_1 = __importDefault(require("../models/Contact"));
const Opportunity_1 = __importDefault(require("../models/Opportunity"));
const Product_1 = __importDefault(require("../models/Product"));
const Quote_1 = __importDefault(require("../models/Quote"));
const Task_1 = __importDefault(require("../models/Task"));
const Interaction_1 = __importDefault(require("../models/Interaction"));
const Event_1 = __importDefault(require("../models/Event"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
let systemUserId;
const connectMongo = () => __awaiter(void 0, void 0, void 0, function* () {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri)
        throw new Error('MONGODB_URI not defined');
    yield mongoose_1.default.connect(uri);
    console.log('Connected to MongoDB');
});
const getSystemUser = () => __awaiter(void 0, void 0, void 0, function* () {
    // Find first admin user in Postgres (after migration)
    const user = yield prisma_1.prisma.user.findFirst({ where: { role: 'super_admin' } });
    if (user)
        return user.id;
    // Fallback if no super_admin, try any user
    const anyUser = yield prisma_1.prisma.user.findFirst();
    if (anyUser)
        return anyUser.id;
    return undefined;
});
const clearPostgres = () => __awaiter(void 0, void 0, void 0, function* () {
    // Delete in reverse order of dependency
    console.log('Clearing PostgreSQL database...');
    // Add transaction or just await sequence
    // Using explicit deletes to ensure order
    yield prisma_1.prisma.workflowRule.deleteMany({});
    yield prisma_1.prisma.workflow.deleteMany({});
    yield prisma_1.prisma.campaign.deleteMany({});
    yield prisma_1.prisma.emailList.deleteMany({});
    yield prisma_1.prisma.quoteLineItem.deleteMany({});
    yield prisma_1.prisma.quote.deleteMany({});
    yield prisma_1.prisma.task.deleteMany({});
    yield prisma_1.prisma.interaction.deleteMany({});
    yield prisma_1.prisma.calendarEvent.deleteMany({});
    yield prisma_1.prisma.opportunity.deleteMany({});
    yield prisma_1.prisma.contact.deleteMany({});
    yield prisma_1.prisma.account.deleteMany({});
    yield prisma_1.prisma.lead.deleteMany({});
    yield prisma_1.prisma.product.deleteMany({});
    yield prisma_1.prisma.user.deleteMany({});
    yield prisma_1.prisma.organisation.deleteMany({});
    console.log('PostgreSQL database cleared.');
});
const migrateOrganisations = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Organisations...');
    const orgs = yield Organisation_1.default.find({});
    for (const org of orgs) {
        yield prisma_1.prisma.organisation.create({
            data: {
                id: org._id.toString(),
                name: org.name,
                domain: org.domain,
                slug: org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000),
                createdAt: org.createdAt || new Date(),
                updatedAt: org.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${orgs.length} Organisations.`);
});
const migrateUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Users...');
    const users = yield User_1.default.find({});
    for (const user of users) {
        if (!user.organisation) {
            console.warn(`Skipping user ${user.email} without organisation`);
            continue;
        }
        yield prisma_1.prisma.user.create({
            data: {
                id: user._id.toString(),
                email: user.email,
                password: user.password, // Correct field name
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                organisationId: user.organisation.toString(),
                isActive: true,
                createdAt: user.createdAt || new Date(),
                updatedAt: user.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${users.length} Users.`);
    // Set system user after users are migrated
    systemUserId = yield getSystemUser();
    if (!systemUserId)
        console.warn('WARNING: No system user found. Migration of dependent records might fail if createdBy is missing.');
    else
        console.log(`System Fallback User ID: ${systemUserId}`);
});
const migrateLeads = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Leads...');
    const leads = yield Lead_1.default.find({});
    for (const lead of leads) {
        yield prisma_1.prisma.lead.create({
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
});
const migrateAccounts = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Accounts...');
    const accounts = yield Account_1.default.find({});
    for (const acc of accounts) {
        // Ensure valid owner if set
        // But we rely on raw ID. If owner deleted, this might fail unless optional?
        // Schema: ownerId String?
        yield prisma_1.prisma.account.create({
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
});
const migrateContacts = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Contacts...');
    const contacts = yield Contact_1.default.find({});
    for (const con of contacts) {
        yield prisma_1.prisma.contact.create({
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
});
const migrateOpportunities = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Opportunities...');
    const opps = yield Opportunity_1.default.find({});
    for (const opp of opps) {
        if (!opp.account)
            continue;
        yield prisma_1.prisma.opportunity.create({
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
});
const migrateProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Products...');
    const products = yield Product_1.default.find({});
    for (const prod of products) {
        yield prisma_1.prisma.product.create({
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
                createdAt: prod.createdAt || new Date(),
                updatedAt: prod.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${products.length} Products.`);
});
const migrateQuotes = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Quotes...');
    const quotes = yield Quote_1.default.find({});
    for (const quote of quotes) {
        yield prisma_1.prisma.quote.create({
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
                createdById: quote.createdBy ? quote.createdBy.toString() : systemUserId,
                accountId: quote.account ? quote.account.toString() : undefined,
                contactId: quote.contact ? quote.contact.toString() : undefined,
                opportunityId: quote.opportunity ? quote.opportunity.toString() : undefined,
                lineItems: {
                    create: quote.lineItems ? quote.lineItems.map((item) => ({
                        productName: item.productName || 'Unknown Product',
                        quantity: item.quantity || 1,
                        unitPrice: item.unitPrice || 0,
                        total: item.total || 0,
                        productId: item.product ? item.product.toString() : undefined
                    })) : []
                },
                createdAt: quote.createdAt || new Date(),
                updatedAt: quote.updatedAt || new Date()
            }
        });
    }
    console.log(`Migrated ${quotes.length} Quotes.`);
});
const migrateTasks = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Tasks...');
    const tasks = yield Task_1.default.find({});
    for (const task of tasks) {
        const data = {
            id: task._id.toString(),
            subject: task.subject,
            description: task.description,
            status: task.status || 'pending',
            priority: task.priority || 'medium',
            dueDate: task.dueDate,
            organisationId: task.organisation.toString(),
            assignedToId: task.assignedTo ? task.assignedTo.toString() : undefined,
            createdById: task.createdBy ? task.createdBy.toString() : systemUserId,
            createdAt: task.createdAt || new Date(),
            updatedAt: task.updatedAt || new Date()
        };
        if (task.relatedTo && task.onModel) {
            const relId = task.relatedTo.toString();
            if (task.onModel === 'Lead')
                data.leadId = relId;
            else if (task.onModel === 'Contact')
                data.contactId = relId;
            else if (task.onModel === 'Account')
                data.accountId = relId;
            else if (task.onModel === 'Opportunity')
                data.opportunityId = relId;
        }
        try {
            yield prisma_1.prisma.task.create({ data });
        }
        catch (e) {
            console.error(`Failed to migrate Task ${task._id}:`, e);
        }
    }
    console.log(`Migrated ${tasks.length} Tasks.`);
});
const migrateInteractions = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Migrating Interactions...');
    const interactions = yield Interaction_1.default.find({});
    for (const int of interactions) {
        const data = {
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
            createdAt: int.createdAt || new Date(),
            updatedAt: int.updatedAt || new Date()
        };
        if (int.relatedTo && int.onModel) {
            const relId = int.relatedTo.toString();
            if (int.onModel === 'Lead')
                data.leadId = relId;
            else if (int.onModel === 'Contact')
                data.contactId = relId;
            else if (int.onModel === 'Account')
                data.accountId = relId;
            else if (int.onModel === 'Opportunity')
                data.opportunityId = relId;
        }
        try {
            yield prisma_1.prisma.interaction.create({ data });
        }
        catch (e) {
            console.error(`Failed to migrate Interaction ${int._id}:`, e);
            // Non-fatal, just skip
        }
    }
    console.log(`Migrated ${interactions.length} Interactions.`);
});
const migrateEvents = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log('Migrating Events (to CalendarEvent)...');
    const events = yield Event_1.default.find({});
    for (const event of events) {
        const data = {
            id: event._id.toString(),
            title: event.title,
            description: event.description,
            type: event.type || 'meeting',
            startTime: event.startTime || event.date || new Date(),
            endTime: event.endTime || new Date((((_a = event.startTime) === null || _a === void 0 ? void 0 : _a.getTime()) || Date.now()) + 3600000),
            allDay: event.allDay || false,
            location: event.location,
            organisationId: event.organisation.toString(),
            createdById: event.createdBy ? event.createdBy.toString() : undefined,
            createdAt: event.createdAt || new Date(),
            updatedAt: event.updatedAt || new Date()
        };
        if (event.lead)
            data.leadId = event.lead.toString();
        if (event.contact)
            data.contactId = event.contact.toString();
        try {
            yield prisma_1.prisma.calendarEvent.create({ data });
        }
        catch (e) {
            console.error(`Failed to migrate Event ${event._id}:`, e);
        }
    }
    console.log(`Migrated ${events.length} Events.`);
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield connectMongo();
        yield clearPostgres();
        yield migrateOrganisations();
        yield migrateUsers();
        yield migrateLeads();
        yield migrateAccounts();
        yield migrateContacts();
        yield migrateProducts();
        yield migrateOpportunities();
        yield migrateQuotes();
        yield migrateTasks();
        yield migrateInteractions();
        yield migrateEvents();
        console.log('--- Migration Complete ---');
        process.exit(0);
    }
    catch (err) {
        console.error('Migration Fatal Error:', err);
        process.exit(1);
    }
    finally {
        yield mongoose_1.default.disconnect();
    }
});
main();
