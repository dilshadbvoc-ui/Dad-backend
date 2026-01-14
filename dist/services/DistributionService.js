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
exports.DistributionService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
exports.DistributionService = {
    /**
     * Assign a lead to a user based on active assignment rules (Round Robin, Top Performer, etc.)
     */
    assignLead(lead, organisationId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`[DistributionService] Attempting to assign lead ${lead.id}`);
                // 1. Fetch active rules for this organisation, sorted by priority
                const rules = yield prisma_1.default.assignmentRule.findMany({
                    where: {
                        organisationId: organisationId,
                        isActive: true,
                        isDeleted: false
                    },
                    orderBy: { priority: 'asc' }
                });
                if (!rules || rules.length === 0) {
                    console.log('[DistributionService] No active assignment rules found.');
                    return null;
                }
                // 2. Iterate through rules to find a match
                for (const rule of rules) {
                    if (this.matchesRule(rule, lead)) {
                        console.log(`[DistributionService] Matched rule: ${rule.name} (${rule.distributionType})`);
                        let assignedUserId = null;
                        // 3. Dispatch based on Distribution Type
                        switch (rule.distributionType) {
                            case 'specific_user':
                                // Assign directly if defined
                                const assignTo = rule.assignTo;
                                if (assignTo && assignTo.value) {
                                    assignedUserId = assignTo.value;
                                }
                                break;
                            case 'round_robin_role':
                                assignedUserId = yield this.executeRoundRobin(rule, organisationId);
                                break;
                            case 'top_performer':
                                assignedUserId = yield this.executeTopPerformer(rule, organisationId);
                                break;
                            default:
                                console.warn(`[DistributionService] Unsupported distribution type: ${rule.distributionType}`);
                        }
                        // 4. If user found, assign and save
                        if (assignedUserId) {
                            yield prisma_1.default.lead.update({
                                where: { id: lead.id },
                                data: { assignedToId: assignedUserId }
                            });
                            console.log(`[DistributionService] Assigned lead to user ${assignedUserId}`);
                            return assignedUserId;
                        }
                    }
                }
                return null; // No rule matched or no user available
            }
            catch (error) {
                console.error('[DistributionService] Error assigning lead:', error);
                return null;
            }
        });
    },
    /**
     * Check if lead matches the rule criteria
     */
    matchesRule(rule, lead) {
        const criteria = rule.criteria;
        if (!criteria || criteria.length === 0)
            return true;
        for (const criterion of criteria) {
            const leadValue = lead[criterion.field];
            const ruleValue = criterion.value;
            switch (criterion.operator) {
                case 'equals':
                    if (leadValue != ruleValue)
                        return false;
                    break;
                case 'not_equals':
                    if (leadValue == ruleValue)
                        return false;
                    break;
                case 'contains':
                    if (typeof leadValue === 'string' && !leadValue.includes(String(ruleValue)))
                        return false;
                    break;
                case 'greater_than':
                case 'gt':
                    if (!(leadValue > ruleValue))
                        return false;
                    break;
                case 'less_than':
                case 'lt':
                    if (!(leadValue < ruleValue))
                        return false;
                    break;
                default:
                    break;
            }
        }
        return true;
    },
    /**
     * Helper: Get eligible users for a rule (handling scope)
     */
    getEligibleUsers(rule, organisationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const where = {
                organisationId: organisationId,
                isActive: true
            };
            if (rule.targetRole) {
                where.role = rule.targetRole;
            }
            // Handle Scope
            if (rule.distributionScope === 'direct_subordinates') {
                if (rule.createdById) {
                    where.reportsToId = rule.createdById;
                }
                else {
                    console.warn('[DistributionService] Rule has direct_subordinates scope but no createdBy user.');
                    return [];
                }
            }
            return yield prisma_1.default.user.findMany({
                where,
                orderBy: { id: 'asc' }
            });
        });
    },
    /**
     * Round Robin Logic: Find next user in the role
     */
    executeRoundRobin(rule, organisationId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!rule.targetRole)
                    return null;
                // Fetch eligible users using helper
                const users = yield this.getEligibleUsers(rule, organisationId);
                if (users.length === 0)
                    return null;
                // Find index of last assigned user
                let nextIndex = 0;
                if (rule.lastAssignedUserId) {
                    const lastIndex = users.findIndex((u) => u.id === rule.lastAssignedUserId);
                    if (lastIndex !== -1) {
                        nextIndex = (lastIndex + 1) % users.length;
                    }
                }
                const nextUser = users[nextIndex];
                // Update rule state
                yield prisma_1.default.assignmentRule.update({
                    where: { id: rule.id },
                    data: { lastAssignedUserId: nextUser.id }
                });
                return nextUser.id;
            }
            catch (e) {
                console.error('[DistributionService] RR Error:', e);
                return null;
            }
        });
    },
    /**
     * Top Performer Logic: Find user with most Sales (Closed Won Opportunities)
     */
    executeTopPerformer(rule, organisationId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!rule.targetRole)
                    return null;
                // Fetch eligible users
                const users = yield this.getEligibleUsers(rule, organisationId);
                if (users.length === 0)
                    return null;
                // 30 Days lookback window
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
                // Group By Owner and Sum Amount
                const topPerformer = yield prisma_1.default.opportunity.groupBy({
                    by: ['ownerId'],
                    where: {
                        organisationId: organisationId,
                        ownerId: { in: users.map(u => u.id) },
                        stage: 'closed_won',
                        createdAt: { gte: startDate }
                    },
                    _sum: {
                        amount: true
                    },
                    orderBy: {
                        _sum: {
                            amount: 'desc'
                        }
                    },
                    take: 1
                });
                if (topPerformer.length > 0 && topPerformer[0].ownerId) {
                    return topPerformer[0].ownerId; // ownerId can be null if not filtered properly, but query has ownerId in list
                }
                // Fallback: If no sales data, pick random or first user
                return users[0].id;
            }
            catch (e) {
                console.error('[DistributionService] Top Performer Error:', e);
                return null;
            }
        });
    }
};
