
import prisma from '../config/prisma';
// UserRole import removed

// Helper to get start of today (UTC midnight)
const getStartOfToday = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export const DistributionService = {
    /**
     * Assign a lead to a user based on active assignment rules (Round Robin, Top Performer, etc.)
     */
    async assignLead(lead: any, organisationId: string): Promise<string | null> {
        try {
            console.log(`[DistributionService] Attempting to assign lead ${lead.id} (Branch: ${lead.branchId || 'None'})`);

            // 1. Fetch active rules for this organisation, filtered by branch
            const rules = await prisma.assignmentRule.findMany({
                where: {
                    organisationId: organisationId,
                    isActive: true,
                    isDeleted: false,
                    OR: [
                        { branchId: lead.branchId }, // Match specific branch
                        { branchId: null }           // OR Global rules
                    ]
                },
                orderBy: [
                    { priority: 'asc' }
                ]
            });

            if (!rules || rules.length === 0) {
                console.log('[DistributionService] No active assignment rules found.');
                return null;
            }

            // 2. Iterate through rules to find a match
            for (const rule of rules) {
                // strict check: if rule has branchId, it MUST match (already covered by query, but double check)
                if (rule.branchId && rule.branchId !== lead.branchId) continue;

                if (this.matchesRule(rule, lead)) {
                    console.log(`[DistributionService] Matched rule: ${rule.name} (${rule.distributionType})`);
                    let assignedUserId: string | null = null;

                    // 3. Dispatch based on Distribution Type
                    switch (rule.distributionType) {
                        case 'specific_user': {
                            // Assign directly if defined
                            const assignTo = rule.assignTo as any;
                            if (assignTo && assignTo.value) {
                                assignedUserId = assignTo.value;
                            }
                            break;
                        }

                        case 'round_robin_role':
                            assignedUserId = await this.executeRoundRobin(rule, organisationId, lead.branchId);
                            break;

                        case 'top_performer':
                            assignedUserId = await this.executeTopPerformer(rule, organisationId, lead.branchId);
                            break;

                        case 'campaign_users':
                            // Round-robin among multiple specific users defined in assignTo.users
                            assignedUserId = await this.executeCampaignUsers(rule);
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

                        // Increment quota tracker
                        await this.incrementUserLeadCount(assignedUserId);

                        // Notify User
                        this.notifyUser(assignedUserId, lead, organisationId);

                        console.log(`[DistributionService] Assigned lead to user ${assignedUserId}`);
                        return assignedUserId;
                    }

                    // 5. FALLBACK: If no eligible user found (all at quota), escalate to manager
                    console.log('[DistributionService] No eligible users found (all at quota). Escalating to manager...');
                    const managerId = await this.findManagerForRule(rule);
                    if (managerId) {
                        await prisma.lead.update({
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

        } catch (error) {
            console.error('[DistributionService] Error assigning lead:', error);
            return null;
        }
    },

    /**
     * Check if lead matches the rule criteria
     * Supports nested field access like "sourceDetails.campaignName"
     */
    matchesRule(rule: any, lead: any): boolean {
        const criteria = rule.criteria as any[];
        if (!criteria || criteria.length === 0) return true;

        for (const criterion of criteria) {
            const leadValue = this.getNestedValue(lead, criterion.field);
            const ruleValue = criterion.value;

            switch (criterion.operator) {
                case 'equals':
                    if (leadValue != ruleValue) return false;
                    break;
                case 'not_equals':
                    if (leadValue == ruleValue) return false;
                    break;
                case 'contains':
                    if (typeof leadValue === 'string' && !leadValue.toLowerCase().includes(String(ruleValue).toLowerCase())) return false;
                    if (typeof leadValue !== 'string') return false;
                    break;
                case 'greater_than':
                case 'gt':
                    if (!(leadValue > ruleValue)) return false;
                    break;
                case 'less_than':
                case 'lt':
                    if (!(leadValue < ruleValue)) return false;
                    break;
                case 'in':
                    // Check if leadValue is in array of ruleValues
                    if (Array.isArray(ruleValue) && !ruleValue.includes(leadValue)) return false;
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
    getNestedValue(obj: any, path: string): any {
        if (!obj || !path) return undefined;

        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }

        return current;
    },

    /**
     * Helper: Get eligible users for a rule (handling scope + quota)
     */
    async getEligibleUsers(rule: any, organisationId: string, branchId?: string | null): Promise<any[]> {
        const where: any = {
            organisationId: organisationId,
            isActive: true
        };

        const targetBranchId = rule.branchId || branchId;
        if (targetBranchId) {
            where.branchId = targetBranchId;
        }

        if (rule.targetRole) {
            where.role = rule.targetRole;
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

        const users = await prisma.user.findMany({
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

        // Filter out users who have reached their daily quota or are outside working hours
        return users.filter((user: any) => {
            // 1. Quota Check
            if (user.dailyLeadQuota) {
                const todayCount = user.leadQuotaTracking?.[0]?.leadCount || 0;
                if (todayCount >= user.dailyLeadQuota) {
                    console.log(`[DistributionService] User ${user.id} skipped - quota reached (${todayCount}/${user.dailyLeadQuota})`);
                    return false;
                }
            }

            // 2. Working Hours & Availability Check
            if (!this.isUserAvailable(user)) {
                console.log(`[DistributionService] User ${user.id} skipped - outside working hours or unavailable`);
                return false;
            }

            return true;
        });
    },

    /**
     * Increment user's daily lead count
     */
    async incrementUserLeadCount(userId: string): Promise<void> {
        const today = getStartOfToday();

        await prisma.userLeadQuotaTracker.upsert({
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
    },

    /**
     * Find a manager to escalate leads to when all users are at quota.
     * First tries the rule creator's manager, then falls back to any admin.
     */
    async findManagerForRule(rule: any): Promise<string | null> {
        try {
            // 1. Try to find the rule creator's manager
            if (rule.createdById) {
                const creator = await prisma.user.findUnique({
                    where: { id: rule.createdById },
                    select: { reportsToId: true }
                });

                if (creator?.reportsToId) {
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
            const admin = await prisma.user.findFirst({
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
        } catch (error) {
            console.error('[DistributionService] Error finding manager:', error);
            return null;
        }
    },

    /**
     * Round Robin Logic: Find next user in the role
     */
    async executeRoundRobin(rule: any, organisationId: string, branchId?: string | null): Promise<string | null> {
        try {
            if (!rule.targetRole) return null;

            // Fetch eligible users using helper
            const users = await this.getEligibleUsers(rule, organisationId, branchId);

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
    async executeTopPerformer(rule: any, organisationId: string, branchId?: string | null): Promise<string | null> {
        try {
            if (!rule.targetRole) return null;

            // Fetch eligible users
            const users = await this.getEligibleUsers(rule, organisationId, branchId);

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
    },

    /**
     * Campaign Users: Round-robin among multiple specific users defined for a campaign
     * The assignTo field should be: { users: ["userId1", "userId2", "userId3"] }
     */
    async executeCampaignUsers(rule: any): Promise<string | null> {
        try {
            const assignTo = rule.assignTo as any;
            if (!assignTo || !assignTo.users || !Array.isArray(assignTo.users) || assignTo.users.length === 0) {
                console.warn('[DistributionService] Campaign rule has no users defined');
                return null;
            }

            const userIds: string[] = assignTo.users;
            const today = getStartOfToday();

            // Fetch users with their quota info for today
            const users = await prisma.user.findMany({
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

            // Filter out users at quota or outside working hours
            const eligibleUsers = users.filter((user: any) => {
                if (user.dailyLeadQuota) {
                    const todayCount = user.leadQuotaTracking?.[0]?.leadCount || 0;
                    if (todayCount >= user.dailyLeadQuota) return false;
                }
                return this.isUserAvailable(user);
            });

            if (eligibleUsers.length === 0) {
                console.log('[DistributionService] All campaign users at quota or unavailable');
                return null;
            }

            // Round-robin among eligible users
            let nextIndex = 0;
            if (rule.lastAssignedUserId) {
                const lastIndex = eligibleUsers.findIndex((u: any) => u.id === rule.lastAssignedUserId);
                if (lastIndex !== -1) {
                    nextIndex = (lastIndex + 1) % eligibleUsers.length;
                }
            }

            const nextUser = eligibleUsers[nextIndex];

            // Update rule state
            await prisma.assignmentRule.update({
                where: { id: rule.id },
                data: { lastAssignedUserId: nextUser.id }
            });

            return nextUser.id;

        } catch (e) {
            console.error('[DistributionService] Campaign Users Error:', e);
            return null;
        }
    },

    /**
     * Check if user is currently within their working hours
     */
    isUserAvailable(user: any): boolean {
        // If no working hours defined, assume available 24/7
        if (!user.workingHours) return true;

        try {
            const tz = user.timezone || 'UTC';
            // Get current time in User's timezone
            const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
            const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            const day = dayNames[nowInTz.getDay()];

            const hours = (user.workingHours as any)[day];
            if (!hours || !hours.start || !hours.end) return false; // Not working this day

            const currentTime = nowInTz.getHours() * 60 + nowInTz.getMinutes();

            const [startH, startM] = hours.start.split(':').map(Number);
            const [endH, endM] = hours.end.split(':').map(Number);

            const startTime = startH * 60 + startM;
            const endTime = endH * 60 + endM;

            return currentTime >= startTime && currentTime <= endTime;
        } catch (err) {
            console.error('[DistributionService] Error checking user availability:', err);
            return true; // Fallback to available if error
        }
    },

    /**
     * Notify user of new lead assignment via WhatsApp
     */
    async notifyUser(userId: string, lead: any, organisationId: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { phone: true, firstName: true }
            });

            if (!user?.phone) return;

            // Lazy load WhatsAppService
            const { WhatsAppService } = await import('./WhatsAppService');
            const waClient = await WhatsAppService.getClientForOrg(organisationId);

            if (!waClient) return;

            const message = `Hi ${user.firstName}, New Lead Assigned!\n\nName: ${lead.firstName} ${lead.lastName}\nCompany: ${lead.company || 'N/A'}\n\nPlease check the CRM for details.`;

            await waClient.sendTextMessage(user.phone, message);
            console.log(`[DistributionService] Notification sent to ${user.phone}`);

        } catch (error) {
            console.error('[DistributionService] Failed to notify user:', error);
        }
    }
};
