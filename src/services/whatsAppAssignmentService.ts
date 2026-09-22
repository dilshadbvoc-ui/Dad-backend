import prisma from '../config/prisma';

// Resolves which CRM user should own a WhatsApp conversation for a given number,
// based on the WhatsAppAssignmentRule configured for that WhatsAppAccount. Mirrors
// the round-robin cursor pattern used for lead distribution (distributionService.ts's
// executeRoundRobin): walk an ordered candidate list, pick the one after
// lastAssignedUserId, persist the new cursor.
export const WhatsAppAssignmentService = {
    async resolveAgent(whatsappAccountId: string | null | undefined, organisationId: string): Promise<string | null> {
        if (!whatsappAccountId) return null;

        try {
            const rule = await prisma.whatsAppAssignmentRule.findFirst({
                where: {
                    whatsappAccountId,
                    organisationId,
                    isActive: true,
                    isDeleted: false
                },
                orderBy: { createdAt: 'desc' }
            });

            if (!rule) return null;

            if (rule.distributionType === 'specific_user') {
                return rule.assignedUserIds[0] || null;
            }

            if (rule.distributionType === 'round_robin') {
                return this.pickNext(rule.assignedUserIds, rule.lastAssignedUserId, rule.id);
            }

            if (rule.distributionType === 'team' && rule.targetTeamId) {
                const team = await prisma.team.findUnique({
                    where: { id: rule.targetTeamId },
                    include: { members: { where: { isDeleted: false, isActive: true }, select: { id: true } } }
                });
                const memberIds = (team?.members || []).map(m => m.id);
                return this.pickNext(memberIds, rule.lastAssignedUserId, rule.id);
            }

            return null;
        } catch (error) {
            console.error('[WhatsAppAssignmentService] resolveAgent error:', error);
            return null;
        }
    },

    async pickNext(candidateIds: string[], lastAssignedUserId: string | null, ruleId: string): Promise<string | null> {
        if (!candidateIds || candidateIds.length === 0) return null;

        let startIndex = 0;
        if (lastAssignedUserId) {
            const lastIndex = candidateIds.indexOf(lastAssignedUserId);
            if (lastIndex !== -1) {
                startIndex = (lastIndex + 1) % candidateIds.length;
            }
        }

        const nextUserId = candidateIds[startIndex];

        await prisma.whatsAppAssignmentRule.update({
            where: { id: ruleId },
            data: { lastAssignedUserId: nextUserId }
        });

        return nextUserId;
    }
};
