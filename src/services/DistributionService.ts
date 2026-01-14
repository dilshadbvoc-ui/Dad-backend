
import prisma from '../config/prisma';
import { UserRole } from '../generated/client';

export const DistributionService = {
    /**
     * Assign a lead to a user based on active assignment rules (Round Robin, Top Performer, etc.)
     */
    async assignLead(lead: any, organisationId: string): Promise<string | null> {
        try {
            console.log(`[DistributionService] Attempting to assign lead ${lead.id}`);

            // 1. Fetch active rules for this organisation, sorted by priority
            const rules = await prisma.assignmentRule.findMany({
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
                    let assignedUserId: string | null = null;

                    // 3. Dispatch based on Distribution Type
                    switch (rule.distributionType) {
                        case 'specific_user':
                            // Assign directly if defined
                            const assignTo = rule.assignTo as any;
                            if (assignTo && assignTo.value) {
                                assignedUserId = assignTo.value;
                            }
                            break;

                        case 'round_robin_role':
                            assignedUserId = await this.executeRoundRobin(rule, organisationId);
                            break;

                        case 'top_performer':
                            assignedUserId = await this.executeTopPerformer(rule, organisationId);
                            break;

                        default:
                            console.warn(`[DistributionService] Unsupported distribution type: ${rule.distributionType}`);
                    }

                    // 4. If user found, assign and save
                    if (assignedUserId) {
                        await prisma.lead.update({
                            where: { id: lead.id },
                            data: { assignedToId: assignedUserId }
                        });
                        console.log(`[DistributionService] Assigned lead to user ${assignedUserId}`);
                        return assignedUserId;
                    }
                }
            }

            return null; // No rule matched or no user available

        } catch (error) {
            console.error('[DistributionService] Error assigning lead:', error);
            return null;
        }
    },

    /**
     * Check if lead matches the rule criteria
     */
    matchesRule(rule: any, lead: any): boolean {
        const criteria = rule.criteria as any[];
        if (!criteria || criteria.length === 0) return true;

        for (const criterion of criteria) {
            const leadValue = lead[criterion.field];
            const ruleValue = criterion.value;

            switch (criterion.operator) {
                case 'equals':
                    if (leadValue != ruleValue) return false;
                    break;
                case 'not_equals':
                    if (leadValue == ruleValue) return false;
                    break;
                case 'contains':
                    if (typeof leadValue === 'string' && !leadValue.includes(String(ruleValue))) return false;
                    break;
                case 'greater_than':
                case 'gt':
                    if (!(leadValue > ruleValue)) return false;
                    break;
                case 'less_than':
                case 'lt':
                    if (!(leadValue < ruleValue)) return false;
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
    async getEligibleUsers(rule: any, organisationId: string): Promise<any[]> {
        const where: any = {
            organisationId: organisationId,
            isActive: true
        };

        if (rule.targetRole) {
            where.role = rule.targetRole as UserRole;
        }

        // Handle Scope
        if (rule.distributionScope === 'direct_subordinates') {
            if (rule.createdById) {
                where.reportsToId = rule.createdById;
            } else {
                console.warn('[DistributionService] Rule has direct_subordinates scope but no createdBy user.');
                return [];
            }
        }

        return await prisma.user.findMany({
            where,
            orderBy: { id: 'asc' }
        });
    },

    /**
     * Round Robin Logic: Find next user in the role
     */
    async executeRoundRobin(rule: any, organisationId: string): Promise<string | null> {
        try {
            if (!rule.targetRole) return null;

            // Fetch eligible users using helper
            const users = await this.getEligibleUsers(rule, organisationId);

            if (users.length === 0) return null;

            // Find index of last assigned user
            let nextIndex = 0;
            if (rule.lastAssignedUserId) {
                const lastIndex = users.findIndex((u: any) => u.id === rule.lastAssignedUserId);
                if (lastIndex !== -1) {
                    nextIndex = (lastIndex + 1) % users.length;
                }
            }

            const nextUser = users[nextIndex];

            // Update rule state
            await prisma.assignmentRule.update({
                where: { id: rule.id },
                data: { lastAssignedUserId: nextUser.id }
            });

            return nextUser.id;

        } catch (e) {
            console.error('[DistributionService] RR Error:', e);
            return null;
        }
    },

    /**
     * Top Performer Logic: Find user with most Sales (Closed Won Opportunities)
     */
    async executeTopPerformer(rule: any, organisationId: string): Promise<string | null> {
        try {
            if (!rule.targetRole) return null;

            // Fetch eligible users
            const users = await this.getEligibleUsers(rule, organisationId);

            if (users.length === 0) return null;

            // 30 Days lookback window
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            // Group By Owner and Sum Amount
            const topPerformer = await prisma.opportunity.groupBy({
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

        } catch (e) {
            console.error('[DistributionService] Top Performer Error:', e);
            return null;
        }
    }
};
