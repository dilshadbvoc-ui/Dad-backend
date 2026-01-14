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
exports.LeadScoringService = exports.DEFAULT_SCORING_RULES = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
exports.DEFAULT_SCORING_RULES = [
    { action: 'email_opened', points: 5, field: 'engagementScore' },
    { action: 'email_clicked', points: 10, field: 'engagementScore' },
    { action: 'reply', points: 20, field: 'engagementScore' },
    { action: 'meeting_booked', points: 50, field: 'leadScore' },
    { action: 'call_connected', points: 10, field: 'engagementScore' },
    { action: 'website_visit', points: 2, field: 'engagementScore' },
    { action: 'form_submission', points: 30, field: 'leadScore' },
    { action: 'bad_contact_info', points: -50, field: 'qualityScore' },
];
exports.LeadScoringService = {
    /**
     * Update lead score based on a specific activity/interaction
     */
    updateScore(leadId, activityType) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rule = exports.DEFAULT_SCORING_RULES.find(r => r.action === activityType);
                if (!rule)
                    return; // No rule for this activity
                const updateField = rule.field || 'leadScore';
                const points = rule.points;
                const data = {
                    [updateField]: { increment: points }
                };
                // If it boosts engagement/quality, also boost total leadScore?
                if (updateField !== 'leadScore') {
                    data['leadScore'] = { increment: points };
                }
                yield prisma_1.default.lead.update({
                    where: { id: leadId },
                    data: data
                });
                console.log(`[LeadScoring] Updated lead ${leadId} score by ${points} for ${activityType}`);
            }
            catch (error) {
                console.error('[LeadScoring] Error updating score:', error);
            }
        });
    },
    /**
     * Recalculate total score from scratch (e.g. if rules change)
     * This would check all interactions. Implementing basic reset for now.
     */
    recalculateScore(leadId) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Fetch all interactions for this lead and sum up points
            console.log(`[LeadScoring] Recalculate requested for ${leadId} (Not fully implemented)`);
        });
    }
};
