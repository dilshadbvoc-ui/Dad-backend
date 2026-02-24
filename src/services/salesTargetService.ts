
import prisma from '../config/prisma';
import { NotificationService } from './NotificationService';

export class SalesTargetService {
    /**
     * Updates the progress of a user's active targets based on won opportunities.
     * Also handles rolling up progress to parent targets.
     * @param userId The ID of the user (opportunity owner)
     * @param date The date of the opportunity update (usually 'now')
     */
    static async updateProgressForUser(userId: string, date: Date = new Date()) {
        try {
            console.log(`[SalesTargetService] Updating progress for user: ${userId}`);

            // 1. Find all active targets (and completed ones to check for regression)
            const activeTargets = await prisma.salesTarget.findMany({
                where: {
                    assignedToId: userId,
                    status: { in: ['active', 'completed'] },
                    isDeleted: false,
                    autoDistributed: false, // Only update leaf nodes
                    startDate: { lte: date },
                    endDate: { gte: date }
                }
            });

            if (activeTargets.length === 0) return;

            for (const target of activeTargets) {
                let achievedValue = 0;

                // Construct filter for Opportunity Type if specified
                const typeFilter = target.opportunityType ? { type: target.opportunityType } : {};

                // 2. Calculate based on metric
                if (target.metric === 'units' || target.productId) {
                    // Calculate from QuoteLineItems (Units or Product Revenue)
                    const aggregation = await prisma.quoteLineItem.aggregate({
                        where: {
                            quote: {
                                opportunity: {
                                    ownerId: userId,
                                    stage: 'closed_won',
                                    isDeleted: false,
                                    updatedAt: { gte: target.startDate, lte: target.endDate },
                                    ...typeFilter
                                }
                            },
                            productId: target.productId || undefined
                        },
                        _sum: {
                            quantity: true,
                            total: true
                        }
                    });

                    if (target.metric === 'units') {
                        achievedValue = aggregation._sum.quantity || 0;
                    } else {
                        // Revenue for specific product
                        achievedValue = aggregation._sum.total || 0;
                    }
                } else {
                    // Generic Revenue (Total Opportunity Amount)
                    const aggregation = await prisma.opportunity.aggregate({
                        where: {
                            ownerId: userId,
                            stage: 'closed_won',
                            isDeleted: false,
                            updatedAt: {
                                gte: target.startDate,
                                lte: target.endDate
                            },
                            ...typeFilter
                        },
                        _sum: {
                            amount: true
                        }
                    });
                    achievedValue = aggregation._sum.amount || 0;
                }

                // 3. Update the target logic
                let newStatus = target.status;

                // Check for completion
                if (achievedValue >= target.targetValue && target.status !== 'completed') {
                    newStatus = 'completed';

                    // Notify user
                    try {
                        await NotificationService.send(
                            userId,
                            'Sales Target Achieved! 🎯',
                            `Congratulations! You have achieved your sales target for ${target.period} (${target.metric || 'revenue'}). Great work!`,
                            'success'
                        );
                    } catch (err) {
                        console.error('[SalesTargetService] Failed to send notification', err);
                    }
                } else if (achievedValue < target.targetValue && target.status === 'completed') {
                    // Regression (e.g. order cancelled)
                    newStatus = 'active';
                }

                console.log(`[SalesTargetService] Target ${target.id}: Achieved ${achievedValue} / ${target.targetValue} (${newStatus})`);

                // ALWAYS Update
                await prisma.salesTarget.update({
                    where: { id: target.id },
                    data: {
                        achievedValue,
                        status: newStatus
                    }
                });

                // Check for hierarchy rollup
                if (target.parentTargetId) {
                    await SalesTargetService.rollupToParent(target.parentTargetId);
                }
            }
        } catch (error) {
            console.error('[SalesTargetService] Error updating progress:', error);
        }
    }

    /**
     * Recursively rolls up achieved values to parent targets.
     * @param parentTargetId The ID of the parent target
     */
    private static async rollupToParent(parentTargetId: string) {
        try {
            const parentTarget = await prisma.salesTarget.findUnique({
                where: { id: parentTargetId }
            });
            if (!parentTarget || parentTarget.isDeleted) return;

            // Sum achieved values from children
            const childAggregation = await prisma.salesTarget.aggregate({
                where: {
                    parentTargetId: parentTargetId,
                    isDeleted: false
                },
                _sum: {
                    achievedValue: true
                }
            });

            const totalChildAchieved = childAggregation._sum.achievedValue || 0;

            console.log(`[SalesTargetService] Rolling up to parent ${parentTargetId}: Child Sum = ${totalChildAchieved}`);

            const updateData: any = { achievedValue: totalChildAchieved };

            if (totalChildAchieved >= parentTarget.targetValue && parentTarget.status !== 'completed') {
                updateData.status = 'completed';
                // Notify parent... skipped
            } else if (totalChildAchieved < parentTarget.targetValue && parentTarget.status === 'completed') {
                updateData.status = 'active';
            }

            await prisma.salesTarget.update({
                where: { id: parentTargetId },
                data: updateData
            });

            // Recursively go up
            if (parentTarget.parentTargetId) {
                await this.rollupToParent(parentTarget.parentTargetId);
            }

        } catch (error) {
            console.error('[SalesTargetService] Error rolling up to parent:', error);
        }
    }
}
