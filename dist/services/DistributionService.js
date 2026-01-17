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
// Helper to get start of today (UTC midnight)
const getStartOfToday = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
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
                            case 'specific_user': {
                                // Assign directly if defined
                                const assignTo = rule.assignTo;
                                if (assignTo && assignTo.value) {
                                    assignedUserId = assignTo.value;
                                }
                                break;
                            }
                            case 'round_robin_role':
                                assignedUserId = yield this.executeRoundRobin(rule, organisationId);
                                break;
                            case 'top_performer':
                                assignedUserId = yield this.executeTopPerformer(rule, organisationId);
                                break;
                            case 'campaign_users':
                                // Round-robin among multiple specific users defined in assignTo.users
                                assignedUserId = yield this.executeCampaignUsers(rule);
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
                            // Increment quota tracker
                            yield this.incrementUserLeadCount(assignedUserId);
                            console.log(`[DistributionService] Assigned lead to user ${assignedUserId}`);
                            return assignedUserId;
                        }
                        // 5. FALLBACK: If no eligible user found (all at quota), escalate to manager
                        console.log('[DistributionService] No eligible users found (all at quota). Escalating to manager...');
                        const managerId = yield this.findManagerForRule(rule);
                        if (managerId) {
                            yield prisma_1.default.lead.update({
                                where: { id: lead.id },
                                data: { assignedToId: managerId }
                            });
                            // Don't increment quota for manager - they'll manually reassign
                            console.log(`[DistributionService] Escalated to manager ${managerId} for manual assignment`);
                            return managerId;
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
     * Supports nested field access like "sourceDetails.campaignName"
     */
    matchesRule(rule, lead) {
        const criteria = rule.criteria;
        if (!criteria || criteria.length === 0)
            return true;
        for (const criterion of criteria) {
            const leadValue = this.getNestedValue(lead, criterion.field);
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
                    if (typeof leadValue === 'string' && !leadValue.toLowerCase().includes(String(ruleValue).toLowerCase()))
                        return false;
                    if (typeof leadValue !== 'string')
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
                case 'in':
                    // Check if leadValue is in array of ruleValues
                    if (Array.isArray(ruleValue) && !ruleValue.includes(leadValue))
                        return false;
                    break;
                default:
                    break;
            }
        }
        return true;
    },
    /**
     * Get nested value from object using dot notation
     * e.g., getNestedValue(lead, "sourceDetails.campaignName")
     */
    getNestedValue(obj, path) {
        if (!obj || !path)
            return undefined;
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined)
                return undefined;
            current = current[part];
        }
        return current;
    },
    /**
     * Helper: Get eligible users for a rule (handling scope + quota)
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
            const users = yield prisma_1.default.user.findMany({
                where,
                include: {
                    leadQuotaTracking: {
                        where: {
                            date: getStartOfToday()
                        }
                    }
                },
                orderBy: { id: 'asc' }
            });
            // Filter out users who have reached their daily quota
            const eligibleUsers = users.filter((user) => {
                var _a, _b;
                if (!user.dailyLeadQuota)
                    return true; // No quota = unlimited
                const todayCount = ((_b = (_a = user.leadQuotaTracking) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.leadCount) || 0;
                const hasCapacity = todayCount < user.dailyLeadQuota;
                if (!hasCapacity) {
                    console.log(`[DistributionService] User ${user.id} skipped - quota reached (${todayCount}/${user.dailyLeadQuota})`);
                }
                return hasCapacity;
            });
            return eligibleUsers;
        });
    },
    /**
     * Increment user's daily lead count
     */
    incrementUserLeadCount(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const today = getStartOfToday();
            yield prisma_1.default.userLeadQuotaTracker.upsert({
                where: {
                    userId_date: {
                        userId,
                        date: today
                    }
                },
                update: {
                    leadCount: { increment: 1 }
                },
                create: {
                    userId,
                    date: today,
                    leadCount: 1
                }
            });
        });
    },
    /**
     * Find a manager to escalate leads to when all users are at quota.
     * First tries the rule creator's manager, then falls back to any admin.
     */
    findManagerForRule(rule) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // 1. Try to find the rule creator's manager
                if (rule.createdById) {
                    const creator = yield prisma_1.default.user.findUnique({
                        where: { id: rule.createdById },
                        select: { reportsToId: true }
                    });
                    if (creator === null || creator === void 0 ? void 0 : creator.reportsToId) {
                        console.log(`[DistributionService] Found manager ${creator.reportsToId} for escalation`);
                        return creator.reportsToId;
                    }
                }
                // 2. Fallback to target manager if defined on rule
                if (rule.targetManagerId) {
                    console.log(`[DistributionService] Using rule target manager ${rule.targetManagerId}`);
                    return rule.targetManagerId;
                }
                // 3. Fallback to any admin in the organisation
                const admin = yield prisma_1.default.user.findFirst({
                    where: {
                        organisationId: rule.organisationId,
                        role: 'admin',
                        isActive: true
                    },
                    select: { id: true }
                });
                if (admin) {
                    console.log(`[DistributionService] Fallback to admin ${admin.id}`);
                    return admin.id;
                }
                console.warn('[DistributionService] No manager or admin found for escalation');
                return null;
            }
            catch (error) {
                console.error('[DistributionService] Error finding manager:', error);
                return null;
            }
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
    },
    /**
     * Campaign Users: Round-robin among multiple specific users defined for a campaign
     * The assignTo field should be: { users: ["userId1", "userId2", "userId3"] }
     */
    executeCampaignUsers(rule) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const assignTo = rule.assignTo;
                if (!assignTo || !assignTo.users || !Array.isArray(assignTo.users) || assignTo.users.length === 0) {
                    console.warn('[DistributionService] Campaign rule has no users defined');
                    return null;
                }
                const userIds = assignTo.users;
                const today = getStartOfToday();
                // Fetch users with their quota info for today
                const users = yield prisma_1.default.user.findMany({
                    where: {
                        id: { in: userIds },
                        isActive: true
                    },
                    include: {
                        leadQuotaTracking: {
                            where: { date: today }
                        }
                    }
                });
                // Filter out users at quota
                const eligibleUsers = users.filter((user) => {
                    var _a, _b;
                    if (!user.dailyLeadQuota)
                        return true;
                    const todayCount = ((_b = (_a = user.leadQuotaTracking) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.leadCount) || 0;
                    return todayCount < user.dailyLeadQuota;
                });
                if (eligibleUsers.length === 0) {
                    console.log('[DistributionService] All campaign users at quota');
                    return null;
                }
                // Round-robin among eligible users
                let nextIndex = 0;
                if (rule.lastAssignedUserId) {
                    const lastIndex = eligibleUsers.findIndex((u) => u.id === rule.lastAssignedUserId);
                    if (lastIndex !== -1) {
                        nextIndex = (lastIndex + 1) % eligibleUsers.length;
                    }
                }
                const nextUser = eligibleUsers[nextIndex];
                // Update rule state
                yield prisma_1.default.assignmentRule.update({
                    where: { id: rule.id },
                    data: { lastAssignedUserId: nextUser.id }
                });
                return nextUser.id;
            }
            catch (e) {
                console.error('[DistributionService] Campaign Users Error:', e);
                return null;
            }
        });
    }
};
