import prisma from '../config/prisma';

export class AssignmentRuleService {
    /**
     * Assigns a lead to a user based on active assignment rules,
     * with fallback to branch manager or organisation admin.
     */
    static async assignLead(lead: any, organisationId: string, branchId?: string, ruleId?: string, importerId?: string): Promise<string | null> {
        try {
            // 1. If a specific rule ID is provided, try to use it
            if (ruleId) {
                const rule = await prisma.assignmentRule.findUnique({
                    where: { id: ruleId, organisationId, isActive: true, isDeleted: false }
                });

                if (rule) {
                    const assigneeId = await this.getAssignee(rule, organisationId, branchId || lead.branchId);
                    if (assigneeId) {
                        // Update last assigned user for round robin
                        if (rule.ruleType === 'round_robin' || rule.ruleType === 'round_robin_role') {
                            await prisma.assignmentRule.update({
                                where: { id: rule.id },
                                data: { lastAssignedUserId: assigneeId }
                            });
                        }
                        return assigneeId;
                    }
                }
            }

            // 2. Fetch active assignment rules for the organisation (normal flow)
            const rules = await prisma.assignmentRule.findMany({
                where: {
                    organisationId,
                    isActive: true,
                    isDeleted: false,
                    entity: 'Lead'
                },
                orderBy: { priority: 'asc' }
            });

            // 3. Iterate through rules and find the first match
            for (const rule of rules) {
                if (this.isMatch(lead, rule)) {
                    const assigneeId = await this.getAssignee(rule, organisationId, branchId || lead.branchId);
                    if (assigneeId) {
                        // Update rule's last assigned user for round robin if applicable
                        if (rule.ruleType === 'round_robin' || rule.ruleType === 'round_robin_role') {
                            await prisma.assignmentRule.update({
                                where: { id: rule.id },
                                data: { lastAssignedUserId: assigneeId }
                            });
                        }
                        return assigneeId;
                    }
                }
            }

            // 4. Fallback logic: Branch Manager
            if (branchId || lead.branchId) {
                const finalBranchId = branchId || lead.branchId;
                const branch = await prisma.branch.findUnique({
                    where: { id: finalBranchId },
                    select: { managerId: true }
                });
                if (branch?.managerId) return branch.managerId;
            }

            // 5. Default Fallback: Importer (if provided) else Organisation Creator
            if (importerId) {
                console.log(`[AssignmentRuleService] Fallback to Importer: ${importerId}`);
                return importerId;
            }

            const org = await prisma.organisation.findUnique({
                where: { id: organisationId },
                select: { createdBy: true }
            });

            const finalOwner = org?.createdBy || null;
            console.log(`[AssignmentRuleService] Fallback to Organisation Creator: ${finalOwner}`);
            return finalOwner;

        } catch (error) {
            console.error('Lead assignment error:', error);
            return null;
        }
    }

    /**
     * Checks if a lead matches a rule's criteria.
     */
    private static isMatch(lead: any, rule: any): boolean {
        const criteria = rule.criteria as any[];
        if (!criteria || criteria.length === 0) return true; // No criteria = match all

        // Basic criteria matching logic (extensible)
        return criteria.every(item => {
            const leadValue = this.getLeadValue(lead, item.field);
            const targetValue = item.value;

            switch (item.operator) {
                case 'equals': return String(leadValue).toLowerCase() === String(targetValue).toLowerCase();
                case 'not_equals': return String(leadValue).toLowerCase() !== String(targetValue).toLowerCase();
                case 'contains': return String(leadValue).toLowerCase().includes(String(targetValue).toLowerCase());
                default: return true;
            }
        });
    }

    /**
     * Safe value extractor for nested lead fields (e.g., 'address.city')
     */
    private static getLeadValue(lead: any, fieldPath: string): any {
        return fieldPath.split('.').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : undefined, lead);
    }

    /**
     * Determines the assignee ID based on rule configuration.
     */
    private static async getAssignee(rule: any, organisationId: string, branchId?: string): Promise<string | null> {
        if (rule.distributionType === 'specific_user' && rule.assignTo?.userId) {
            return rule.assignTo.userId;
        }

        if (rule.ruleType === 'round_robin' || rule.ruleType === 'round_robin_role') {
            // Fetch eligible users
            const where: any = {
                organisationId,
                isActive: true
            };

            if (rule.targetRole) {
                where.role = rule.targetRole;
            }

            if (branchId && rule.distributionScope === 'branch') {
                where.branchId = branchId;
            }

            const users = await prisma.user.findMany({
                where,
                select: { id: true },
                orderBy: { createdAt: 'asc' }
            });

            if (users.length === 0) return null;

            // Find next user in round robin
            const lastId = rule.lastAssignedUserId;
            const lastIndex = users.findIndex(u => u.id === lastId);
            const nextIndex = (lastIndex + 1) % users.length;

            return users[nextIndex].id;
        }

        return null;
    }
}
