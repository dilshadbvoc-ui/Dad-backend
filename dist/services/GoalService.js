"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
class GoalService {
    /**
     * Recalculates and updates progress for all active goals of a specific type for a user.
     * @param userId The ID of the user whose goals need updating
     * @param type The type of goal (e.g., 'revenue', 'leads', 'calls')
     */
    static async updateProgressForUser(userId, type) {
        try {
            console.log(`[GoalService] Updating ${type} progress for user: ${userId}`);
            const now = new Date();
            // Find all active goals of this type for the user
            const activeGoals = await prisma_1.default.goal.findMany({
                where: {
                    assignedToId: userId,
                    type: type,
                    status: 'active',
                    isDeleted: false,
                    startDate: { lte: now },
                    endDate: { gte: now }
                }
            });
            if (activeGoals.length === 0) {
                console.log(`[GoalService] No active ${type} goals found for user: ${userId}`);
                return;
            }
            for (const goal of activeGoals) {
                let progressValue = 0;
                // Calculate progress based on type
                switch (type.toLowerCase()) {
                    case 'revenue': {
                        const revenueAggregation = await prisma_1.default.opportunity.aggregate({
                            where: {
                                ownerId: userId,
                                stage: 'closed_won',
                                isDeleted: false,
                                updatedAt: {
                                    gte: goal.startDate,
                                    lte: goal.endDate
                                }
                            },
                            _sum: { amount: true }
                        });
                        progressValue = revenueAggregation._sum.amount || 0;
                        break;
                    }
                    case 'leads':
                        progressValue = await prisma_1.default.lead.count({
                            where: {
                                assignedToId: userId,
                                isDeleted: false,
                                createdAt: {
                                    gte: goal.startDate,
                                    lte: goal.endDate
                                }
                            }
                        });
                        break;
                    case 'calls':
                        progressValue = await prisma_1.default.interaction.count({
                            where: {
                                createdById: userId,
                                type: 'call',
                                isDeleted: false,
                                createdAt: {
                                    gte: goal.startDate,
                                    lte: goal.endDate
                                }
                            }
                        });
                        break;
                    default:
                        console.warn(`[GoalService] Unknown goal type: ${type}`);
                        continue;
                }
                // Calculate percent and update goal
                const achievementPercent = Math.round((progressValue / goal.targetValue) * 100);
                const updateData = {
                    currentValue: progressValue,
                    achievementPercent: achievementPercent
                };
                // Check for completion
                if (progressValue >= goal.targetValue && goal.status !== 'completed') {
                    updateData.status = 'completed';
                    updateData.completedAt = new Date();
                }
                await prisma_1.default.goal.update({
                    where: { id: goal.id },
                    data: updateData
                });
                console.log(`[GoalService] Updated Goal ${goal.id}: Progress ${progressValue}/${goal.targetValue} (${achievementPercent}%)`);
            }
        }
        catch (error) {
            console.error('[GoalService] Error updating progress:', error);
        }
    }
}
exports.GoalService = GoalService;
//# sourceMappingURL=GoalService.js.map