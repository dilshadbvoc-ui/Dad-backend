"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadScoringService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
class LeadScoringService {
    static async scoreLead(leadId) {
        try {
            const lead = await prisma_1.default.lead.findUnique({
                where: { id: leadId },
                include: { interactions: { orderBy: { createdAt: 'desc' }, take: 20 } }
            });
            if (!lead)
                throw new Error('Lead not found');
            const org = await prisma_1.default.organisation.findUnique({
                where: { id: lead.organisationId },
                select: { leadScoringConfig: true }
            });
            const config = org?.leadScoringConfig || {
                weights: {
                    email: 10,
                    phone: 15,
                    company: 10,
                    jobTitle: 5,
                    address: 5,
                    interactions: 5,
                    recentActivity: 10
                },
                highValueTitles: ['director', 'vp', 'head', 'manager', 'ceo', 'founder', 'owner'],
                hotLeadThreshold: 70
            };
            let score = 0;
            const log = [];
            // 1. Profile Completeness
            const w = config.weights || {};
            if (lead.email)
                score += (w.email || 0);
            if (lead.phone)
                score += (w.phone || 0);
            if (lead.company)
                score += (w.company || 0);
            if (lead.jobTitle)
                score += (w.jobTitle || 0);
            if (lead.address)
                score += (w.address || 0);
            // 2. Engagement Points
            if (lead.interactions && lead.interactions.length > 0) {
                const baseEngagement = Math.min(lead.interactions.length * (w.interactions || 5), 30);
                score += baseEngagement;
                // Recent Activity Bonus (last 7 days)
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                const recentInteractions = lead.interactions.filter(i => i.createdAt >= sevenDaysAgo);
                if (recentInteractions.length > 0) {
                    score += (w.recentActivity || 10);
                    log.push(`Active in the last 7 days (+${w.recentActivity || 10})`);
                }
            }
            // 3. High Value Title Bonus
            const title = (lead.jobTitle || '').toLowerCase();
            const highValueTitles = config.highValueTitles || [];
            if (highValueTitles.some((t) => title.includes(t))) {
                score += 20;
                log.push('High value job title detected (+20)');
            }
            // Cap at 100
            score = Math.min(score, 100);
            // 4. Hot Lead Determination
            const hotThreshold = config.hotLeadThreshold || 70;
            const isHotLead = score >= hotThreshold;
            // Update Lead
            await prisma_1.default.lead.update({
                where: { id: leadId },
                data: {
                    leadScore: score,
                    isHotLead: isHotLead, // Assuming this field exists or adding it to schema might be needed
                    lastScoredAt: new Date()
                }
            });
            return { score, isHotLead, log };
        }
        catch (error) {
            console.error('LeadScoringService Error:', error);
            // Don't throw, just log
        }
    }
}
exports.LeadScoringService = LeadScoringService;
