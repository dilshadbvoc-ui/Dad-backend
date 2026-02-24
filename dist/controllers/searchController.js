"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recentSearches = exports.searchSuggestions = exports.globalSearch = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const apiResponse_1 = require("../utils/apiResponse");
const logger_1 = require("../utils/logger");
// GET /api/search/global
const globalSearch = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    const query = req.query.q;
    const limit = Math.min(50, Number(req.query.limit) || 20);
    try {
        logger_1.logger.apiRequest('GET', '/api/search/global', userId, organisationId || undefined, { query, limit });
        if (!organisationId) {
            return apiResponse_1.ResponseHandler.forbidden(res, 'User not associated with an organisation');
        }
        if (!query || query.trim().length < 2) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Search query must be at least 2 characters');
        }
        const searchTerm = query.trim();
        const results = [];
        // Search Leads
        const leads = await prisma_1.default.lead.findMany({
            where: {
                organisationId,
                isDeleted: false,
                OR: [
                    { firstName: { contains: searchTerm, mode: 'insensitive' } },
                    { lastName: { contains: searchTerm, mode: 'insensitive' } },
                    { email: { contains: searchTerm, mode: 'insensitive' } },
                    { company: { contains: searchTerm, mode: 'insensitive' } },
                    { phone: { contains: searchTerm, mode: 'insensitive' } }
                ]
            },
            include: {
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            take: Math.ceil(limit * 0.4) // 40% of results for leads
        });
        leads.forEach(lead => {
            results.push({
                id: lead.id,
                type: 'lead',
                title: `${lead.firstName} ${lead.lastName}`,
                subtitle: lead.company || lead.email || 'No company',
                description: `${lead.status} • Score: ${lead.leadScore}`,
                status: lead.status,
                assignedTo: lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : undefined,
                createdAt: lead.createdAt,
                url: `/leads/${lead.id}`
            });
        });
        // Search Contacts
        const contacts = await prisma_1.default.contact.findMany({
            where: {
                organisationId,
                isDeleted: false,
                OR: [
                    { firstName: { contains: searchTerm, mode: 'insensitive' } },
                    { lastName: { contains: searchTerm, mode: 'insensitive' } },
                    { email: { contains: searchTerm, mode: 'insensitive' } },
                    { jobTitle: { contains: searchTerm, mode: 'insensitive' } }
                ]
            },
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            },
            take: Math.ceil(limit * 0.25) // 25% of results for contacts
        });
        contacts.forEach(contact => {
            results.push({
                id: contact.id,
                type: 'contact',
                title: `${contact.firstName} ${contact.lastName}`,
                subtitle: contact.account?.name || contact.jobTitle || 'No account',
                description: contact.email || 'No email',
                assignedTo: contact.owner ? `${contact.owner.firstName} ${contact.owner.lastName}` : undefined,
                createdAt: contact.createdAt,
                url: `/contacts/${contact.id}`
            });
        });
        // Search Accounts
        const accounts = await prisma_1.default.account.findMany({
            where: {
                organisationId,
                isDeleted: false,
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { industry: { contains: searchTerm, mode: 'insensitive' } },
                    { website: { contains: searchTerm, mode: 'insensitive' } }
                ]
            },
            include: {
                owner: { select: { firstName: true, lastName: true } },
                _count: { select: { contacts: true, opportunities: true } }
            },
            take: Math.ceil(limit * 0.2) // 20% of results for accounts
        });
        accounts.forEach(account => {
            results.push({
                id: account.id,
                type: 'account',
                title: account.name,
                subtitle: account.industry || account.type || 'No industry',
                description: `${account._count.contacts} contacts • ${account._count.opportunities} opportunities`,
                value: account.annualRevenue || undefined,
                assignedTo: account.owner ? `${account.owner.firstName} ${account.owner.lastName}` : undefined,
                createdAt: account.createdAt,
                url: `/accounts/${account.id}`
            });
        });
        // Search Opportunities
        const opportunities = await prisma_1.default.opportunity.findMany({
            where: {
                organisationId,
                isDeleted: false,
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { description: { contains: searchTerm, mode: 'insensitive' } },
                    { leadSource: { contains: searchTerm, mode: 'insensitive' } }
                ]
            },
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            },
            take: Math.ceil(limit * 0.1) // 10% of results for opportunities
        });
        opportunities.forEach(opportunity => {
            results.push({
                id: opportunity.id,
                type: 'opportunity',
                title: opportunity.name,
                subtitle: opportunity.account.name,
                description: `${opportunity.stage} • ${opportunity.probability}% probability`,
                status: opportunity.stage,
                value: opportunity.amount,
                assignedTo: opportunity.owner ? `${opportunity.owner.firstName} ${opportunity.owner.lastName}` : undefined,
                createdAt: opportunity.createdAt,
                url: `/opportunities/${opportunity.id}`
            });
        });
        // Search Tasks
        const tasks = await prisma_1.default.task.findMany({
            where: {
                organisationId,
                isDeleted: false,
                OR: [
                    { subject: { contains: searchTerm, mode: 'insensitive' } },
                    { description: { contains: searchTerm, mode: 'insensitive' } }
                ]
            },
            include: {
                assignedTo: { select: { firstName: true, lastName: true } },
                lead: { select: { firstName: true, lastName: true } },
                contact: { select: { firstName: true, lastName: true } },
                account: { select: { name: true } }
            },
            take: Math.ceil(limit * 0.05) // 5% of results for tasks
        });
        tasks.forEach(task => {
            let subtitle = 'Task';
            if (task.lead)
                subtitle = `Lead: ${task.lead.firstName} ${task.lead.lastName}`;
            else if (task.contact)
                subtitle = `Contact: ${task.contact.firstName} ${task.contact.lastName}`;
            else if (task.account)
                subtitle = `Account: ${task.account.name}`;
            results.push({
                id: task.id,
                type: 'task',
                title: task.subject,
                subtitle,
                description: `${task.status} • Priority: ${task.priority}`,
                status: task.status,
                assignedTo: task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : undefined,
                createdAt: task.createdAt,
                url: `/tasks/${task.id}`
            });
        });
        // Sort results by relevance (exact matches first, then by creation date)
        results.sort((a, b) => {
            const aExactMatch = a.title.toLowerCase().includes(searchTerm.toLowerCase());
            const bExactMatch = b.title.toLowerCase().includes(searchTerm.toLowerCase());
            if (aExactMatch && !bExactMatch)
                return -1;
            if (!aExactMatch && bExactMatch)
                return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        // Limit final results
        const finalResults = results.slice(0, limit);
        logger_1.logger.info(`Global search completed: ${finalResults.length} results`, 'SEARCH', userId, organisationId || undefined, { query: searchTerm });
        // Save search history
        if (userId && searchTerm.length >= 2) {
            await prisma_1.default.searchHistory.create({
                data: {
                    query: searchTerm,
                    userId
                }
            }).catch(err => {
                logger_1.logger.error('Failed to save search history', err, 'SEARCH_HISTORY', userId);
            });
        }
        return apiResponse_1.ResponseHandler.success(res, {
            results: finalResults,
            total: finalResults.length,
            query: searchTerm,
            searchTime: Date.now()
        }, 'Search completed successfully');
    }
    catch (error) {
        logger_1.logger.apiError('GET', '/api/search/global', error, userId, organisationId || undefined);
        return apiResponse_1.ResponseHandler.serverError(res, 'An error occurred while searching');
    }
};
exports.globalSearch = globalSearch;
// GET /api/search/suggestions
const searchSuggestions = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    const query = req.query.q;
    try {
        if (!organisationId) {
            return apiResponse_1.ResponseHandler.forbidden(res, 'User not associated with an organisation');
        }
        if (!query || query.trim().length < 1) {
            return apiResponse_1.ResponseHandler.success(res, { suggestions: [] }, 'No suggestions');
        }
        const searchTerm = query.trim();
        const suggestions = [];
        // Get suggestions from different entities
        const [leadSuggestions, contactSuggestions, accountSuggestions] = await Promise.all([
            // Lead name suggestions
            prisma_1.default.lead.findMany({
                where: {
                    organisationId,
                    isDeleted: false,
                    OR: [
                        { firstName: { startsWith: searchTerm, mode: 'insensitive' } },
                        { lastName: { startsWith: searchTerm, mode: 'insensitive' } },
                        { company: { startsWith: searchTerm, mode: 'insensitive' } }
                    ]
                },
                select: { firstName: true, lastName: true, company: true },
                take: 5
            }),
            // Contact name suggestions
            prisma_1.default.contact.findMany({
                where: {
                    organisationId,
                    OR: [
                        { firstName: { startsWith: searchTerm, mode: 'insensitive' } },
                        { lastName: { startsWith: searchTerm, mode: 'insensitive' } }
                    ]
                },
                select: { firstName: true, lastName: true },
                take: 3
            }),
            // Account name suggestions
            prisma_1.default.account.findMany({
                where: {
                    organisationId,
                    name: { startsWith: searchTerm, mode: 'insensitive' }
                },
                select: { name: true },
                take: 3
            })
        ]);
        // Add lead suggestions
        leadSuggestions.forEach(lead => {
            const fullName = `${lead.firstName} ${lead.lastName}`;
            if (!suggestions.includes(fullName)) {
                suggestions.push(fullName);
            }
            if (lead.company && !suggestions.includes(lead.company)) {
                suggestions.push(lead.company);
            }
        });
        // Add contact suggestions
        contactSuggestions.forEach(contact => {
            const fullName = `${contact.firstName} ${contact.lastName}`;
            if (!suggestions.includes(fullName)) {
                suggestions.push(fullName);
            }
        });
        // Add account suggestions
        accountSuggestions.forEach(account => {
            if (!suggestions.includes(account.name)) {
                suggestions.push(account.name);
            }
        });
        return apiResponse_1.ResponseHandler.success(res, {
            suggestions: suggestions.slice(0, 10), // Limit to 10 suggestions
            query: searchTerm
        }, 'Suggestions retrieved successfully');
    }
    catch (error) {
        logger_1.logger.apiError('GET', '/api/search/suggestions', error, userId, organisationId || undefined);
        return apiResponse_1.ResponseHandler.serverError(res, 'An error occurred while getting suggestions');
    }
};
exports.searchSuggestions = searchSuggestions;
// GET /api/search/recent
const recentSearches = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    try {
        const history = await prisma_1.default.searchHistory.groupBy({
            by: ['query'],
            where: {
                userId
            },
            _max: {
                createdAt: true
            },
            orderBy: {
                _max: {
                    createdAt: 'desc'
                }
            },
            take: 10
        });
        const recent = history.map(h => h.query);
        return apiResponse_1.ResponseHandler.success(res, {
            recent,
            message: 'Recent searches retrieved'
        }, 'Recent searches retrieved');
    }
    catch (error) {
        logger_1.logger.apiError('GET', '/api/search/recent', error, userId);
        return apiResponse_1.ResponseHandler.serverError(res, 'An error occurred while getting recent searches');
    }
};
exports.recentSearches = recentSearches;
