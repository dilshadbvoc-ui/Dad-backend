import prisma from '../config/prisma';

interface ScoringRule {
    action: string;
    points: number;
    field?: string; // which score field to update (leadScore, engagementScore, qualityScore)
}

export const DEFAULT_SCORING_RULES: ScoringRule[] = [
    { action: 'email_opened', points: 5, field: 'engagementScore' },
    { action: 'email_clicked', points: 10, field: 'engagementScore' },
    { action: 'reply', points: 20, field: 'engagementScore' },
    { action: 'meeting_booked', points: 50, field: 'leadScore' },
    { action: 'call_connected', points: 10, field: 'engagementScore' },
    { action: 'website_visit', points: 2, field: 'engagementScore' },
    { action: 'form_submission', points: 30, field: 'leadScore' },
    { action: 'bad_contact_info', points: -50, field: 'qualityScore' },
];

export const LeadScoringService = {
    /**
     * Update lead score based on a specific activity/interaction
     */
    async updateScore(leadId: string, activityType: string): Promise<void> {
        try {
            const rule = DEFAULT_SCORING_RULES.find(r => r.action === activityType);
            if (!rule) return; // No rule for this activity

            const updateField = rule.field || 'leadScore';
            const points = rule.points;

            const data: any = {
                [updateField]: { increment: points }
            };

            // If it boosts engagement/quality, also boost total leadScore?
            if (updateField !== 'leadScore') {
                data['leadScore'] = { increment: points };
            }

            await prisma.lead.update({
                where: { id: leadId },
                data: data
            });
            console.log(`[LeadScoring] Updated lead ${leadId} score by ${points} for ${activityType}`);

        } catch (error) {
            console.error('[LeadScoring] Error updating score:', error);
        }
    },

    /**
     * Recalculate total score from scratch (e.g. if rules change)
     * This would check all interactions. Implementing basic reset for now.
     */
    async recalculateScore(leadId: string): Promise<void> {
        // TODO: Fetch all interactions for this lead and sum up points
        console.log(`[LeadScoring] Recalculate requested for ${leadId} (Not fully implemented)`);
    }
};
