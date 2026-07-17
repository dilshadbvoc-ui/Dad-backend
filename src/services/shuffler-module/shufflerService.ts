import prisma from '../../config/prisma';
// Trigger restart

export const runShuffler = async () => {
    try {

        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMinute = now.getMinutes().toString().padStart(2, '0');
        const currentTimeString = `${currentHour}:${currentMinute}`;
        
        // Get all organisations that might have a shuffler config
        const orgs = await prisma.organisation.findMany({
            where: {
                isDeleted: false,
                status: 'active'
            }
        });

        for (const org of orgs) {
            if (!org.shufflerConfig) continue;

            const config = org.shufflerConfig as any;
            if (!config.isAutoShufflingOn) continue;
            if (!config.statuses || config.statuses.length === 0) continue;

            // Check if it's the right time to shuffle for this org
            if (config.shuffleTime !== currentTimeString) continue;

            console.log(`[ShufflerCron] Scheduled shuffle starting for Org: ${org.name} at ${currentTimeString}`);

            const timeFrameType = config.timeFrameType || 'days_before';
            
            // Interval calculation for Auto Schedule
            if (timeFrameType === 'days_before') {
                const intervalDays = parseInt(config.shuffleBeforeDays) || 0;
                if (config.lastShuffledAt && intervalDays > 0) {
                    const lastRun = new Date(config.lastShuffledAt);
                    const nextRun = new Date(lastRun);
                    nextRun.setDate(nextRun.getDate() + intervalDays);
                    nextRun.setHours(0,0,0,0);
                    
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    
                    if (today < nextRun) {
                        continue; // Skip this org today
                    }
                }
            }

            let dateCondition: any = {};

            if (timeFrameType === 'date_range' && config.fromDate && config.toDate) {
                dateCondition = { gte: new Date(config.fromDate), lte: new Date(config.toDate) };
            } else if (timeFrameType === 'backwards_from_date' && config.backwardsDate) {
                dateCondition = { lt: new Date(config.backwardsDate) };
            }
            // For 'days_before', we no longer filter by age, it's just a schedule interval, so dateCondition remains empty.

            // Only apply minimum lead age filter in Auto Shuffler (as requested)
            if (config.minLeadAgeDays && config.minLeadAgeDays > 0) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - config.minLeadAgeDays);
                dateCondition.lt = cutoffDate;
            }

            // Find eligible active users in the org
            let activeUsersWhere: any = {
                organisationId: org.id,
                isActive: true,
                isOffDuty: false
            };

            if (config.selectAllUsers) {
                activeUsersWhere.role = { notIn: ['super_admin', 'admin'] };
                if (!config.selectAllBranches && config.branches && config.branches.length > 0) {
                    activeUsersWhere.branchId = { in: config.branches };
                }
            } else {
                if (!config.users || config.users.length === 0) {
                    console.log(`[ShufflerService] No users selected for shuffling in Org: ${org.name}`);
                    continue;
                }
                activeUsersWhere.id = { in: config.users };
            }

            const activeUsers = await prisma.user.findMany({
                where: activeUsersWhere,
                select: { id: true },
                orderBy: { id: 'asc' }
            });

            if (activeUsers.length === 0) {
                console.log(`[ShufflerService] No active users available to receive leads in Org: ${org.name}`);
                continue;
            }

            const activeUserIds = activeUsers.map(u => u.id);

            const excludedStatuses = ['closed_won', 'closed_lost', 'Closed Won', 'Closed Lost', 'closed won', 'closed lost'];
            const validStatuses = config.statuses.filter((s: string) => !excludedStatuses.includes(s) && !excludedStatuses.includes(s.toLowerCase()));

            // Find eligible leads
            // Only shuffle leads that are currently owned by the selected users
            const eligibleLeads = await prisma.lead.findMany({
                where: {
                    organisationId: org.id,
                    isDeleted: false,
                    status: { in: validStatuses },
                    updatedAt: dateCondition,
                    assignedToId: { in: activeUserIds }
                },
                select: { id: true, assignedToId: true },
                orderBy: { id: 'asc' }
            });

            if (eligibleLeads.length === 0) {
                console.log(`[ShufflerService] No eligible leads found for Org: ${org.name}`);
                continue;
            }

            // Fetch past owners for eligible leads to ensure a strict cycle per lead
            let lastAssignedIndex = activeUsers.findIndex((u: any) => u.id === config.lastAssignedUserId);
            if (lastAssignedIndex === -1) lastAssignedIndex = -1; // Will start at 0

            let reassignedCount = 0;

            let slots: any[] = [];
            let nextIndex = lastAssignedIndex;
            for (let i = 0; i < eligibleLeads.length; i++) {
                nextIndex = (nextIndex + 1) % activeUsers.length;
                slots.push(activeUsers[nextIndex]);
            }

            // Resolve collisions where a slot matches the lead's current owner
            if (activeUsers.length > 1) {
                for (let i = 0; i < eligibleLeads.length; i++) {
                    if (eligibleLeads[i].assignedToId === slots[i].id) {
                        for (let j = 0; j < eligibleLeads.length; j++) {
                            if (i !== j && eligibleLeads[i].assignedToId !== slots[j].id && eligibleLeads[j].assignedToId !== slots[i].id) {
                                let temp = slots[i];
                                slots[i] = slots[j];
                                slots[j] = temp;
                                break;
                            }
                        }
                    }
                }
            }



            for (let i = 0; i < eligibleLeads.length; i++) {
                const lead = eligibleLeads[i];
                const targetUser = slots[i];

                if (targetUser.id !== lead.assignedToId) {
                    await prisma.lead.update({
                        where: { id: lead.id },
                        data: { assignedToId: targetUser.id }
                    });

                    // Log history
                    await prisma.leadHistory.create({
                        data: {
                            leadId: lead.id,
                            fieldName: 'assignedToId',
                            oldValue: lead.assignedToId,
                            newValue: targetUser.id,
                            changedById: null, // System action
                            reason: 'Automatic lead shuffler execution'
                        }
                    });

                    // Send Notification to new owner
                    await prisma.notification.create({
                        data: {
                            title: 'New Lead Assigned',
                            message: `A lead has been automatically reassigned to you by the Shuffler.`,
                            type: 'info',
                            relatedResource: 'lead',
                            relatedId: lead.id,
                            recipientId: targetUser.id,
                            organisationId: org.id
                        }
                    });

                    reassignedCount++;
                }
            }

            // After all assignments, update the lastAssignedIndex for the next run
            lastAssignedIndex = nextIndex;

            // Save the persistent round-robin pointer and the last run time
            const updatedConfig: any = { 
                ...(org.shufflerConfig as Record<string, any>), 
                lastShuffledAt: new Date().toISOString() 
            };
            
            if (lastAssignedIndex !== -1 && activeUsers[lastAssignedIndex]) {
                updatedConfig.lastAssignedUserId = activeUsers[lastAssignedIndex].id;
            }
            
            await prisma.organisation.update({
                where: { id: org.id },
                data: { shufflerConfig: updatedConfig }
            });

            console.log(`[ShufflerService] Successfully reassigned ${reassignedCount} leads in Org: ${org.name}`);
        }
    } catch (error) {
        console.error('[ShufflerService] Error during shuffle execution:', error);
    }
};

export const forceShuffleOrg = async (organisationId: string) => {
    try {
        console.log(`[ShufflerService] Force starting shuffle check for Org: ${organisationId}`);

        const org = await prisma.organisation.findUnique({
            where: { id: organisationId, isDeleted: false }
        });

        if (!org) {
            return { success: false, message: 'Organization not found or inactive.' };
        }

        if (!org.shufflerConfig) {
            return { success: false, message: 'No shuffler config found for this organization.' };
        }

        const config = org.shufflerConfig as any;
        
        if (!config.statuses || config.statuses.length === 0) {
            return { success: false, message: 'No lead statuses configured for shuffling.' };
        }

        if (!config.selectAllUsers && (!config.users || config.users.length === 0)) {
            return { success: false, message: 'No users selected for shuffling. Please select users first.' };
        }

        const timeFrameType = config.timeFrameType || 'days_before';
        let dateCondition: any = undefined; // Undefined means it will be ignored in where clause if not set

        if (timeFrameType === 'date_range' && config.fromDate && config.toDate) {
            dateCondition = { gte: new Date(config.fromDate), lte: new Date(config.toDate) };
        } else if (timeFrameType === 'backwards_from_date' && config.backwardsDate) {
            dateCondition = { lt: new Date(config.backwardsDate) };
        }
        // For 'days_before' (Auto Schedule Interval), we no longer filter leads by age.

        // Find eligible active users in the org
        let activeUsersWhere: any = {
            organisationId: org.id,
            isActive: true,
            isOffDuty: false
        };

        if (config.selectAllUsers) {
            activeUsersWhere.role = { notIn: ['super_admin', 'admin'] };
            if (!config.selectAllBranches && config.branches && config.branches.length > 0) {
                activeUsersWhere.branchId = { in: config.branches };
            }
        } else {
            activeUsersWhere.id = { in: config.users };
        }

        const activeUsers = await prisma.user.findMany({
            where: activeUsersWhere,
            select: { id: true },
            orderBy: { id: 'asc' }
        });

        if (activeUsers.length === 0) {
            return { success: false, message: 'No active non-admin users available to receive leads.' };
        }

        const activeUserIds = activeUsers.map(u => u.id);

        const excludedStatuses = ['closed_won', 'closed_lost', 'Closed Won', 'Closed Lost', 'closed won', 'closed lost'];
        const validStatuses = config.statuses.filter((s: string) => !excludedStatuses.includes(s) && !excludedStatuses.includes(s.toLowerCase()));

        let leadWhereCondition: any = {
            organisationId: org.id,
            isDeleted: false,
            status: { in: validStatuses },
            assignedToId: { in: activeUserIds }
        };

        if (dateCondition) {
            leadWhereCondition.updatedAt = dateCondition;
        }

        // Find eligible leads
        const eligibleLeads = await prisma.lead.findMany({
            where: leadWhereCondition,
            select: { id: true, assignedToId: true },
            orderBy: { id: 'asc' }
        });

        if (eligibleLeads.length === 0) {
            return { success: true, message: 'No eligible leads found for selected statuses and time frame.' };
        }

        let lastAssignedIndex = activeUsers.findIndex((u: any) => u.id === config.lastAssignedUserId);
        if (lastAssignedIndex === -1) lastAssignedIndex = -1;

        let reassignedCount = 0;

        let slots: any[] = [];
        let nextIndex = lastAssignedIndex;
        for (let i = 0; i < eligibleLeads.length; i++) {
            nextIndex = (nextIndex + 1) % activeUsers.length;
            slots.push(activeUsers[nextIndex]);
        }

        // Resolve collisions where a slot matches the lead's current owner
        if (activeUsers.length > 1) {
            for (let i = 0; i < eligibleLeads.length; i++) {
                if (eligibleLeads[i].assignedToId === slots[i].id) {
                    for (let j = 0; j < eligibleLeads.length; j++) {
                        if (i !== j && eligibleLeads[i].assignedToId !== slots[j].id && eligibleLeads[j].assignedToId !== slots[i].id) {
                            let temp = slots[i];
                            slots[i] = slots[j];
                            slots[j] = temp;
                            break;
                        }
                    }
                }
            }
        }

        for (let i = 0; i < eligibleLeads.length; i++) {
            const lead = eligibleLeads[i];
            const targetUser = slots[i];

            if (targetUser.id !== lead.assignedToId) {
                await prisma.lead.update({
                    where: { id: lead.id },
                    data: { assignedToId: targetUser.id }
                });

                // Log history
                await prisma.leadHistory.create({
                    data: {
                        leadId: lead.id,
                        fieldName: 'assignedToId',
                        oldValue: lead.assignedToId,
                        newValue: targetUser.id,
                        changedById: null, // Force shuffle action
                        reason: 'Force lead shuffler execution'
                    }
                });

                // Send Notification to new owner
                await prisma.notification.create({
                    data: {
                        title: 'New Lead Assigned',
                        message: `A lead has been reassigned to you by the manual Shuffler.`,
                        type: 'info',
                        relatedResource: 'lead',
                        relatedId: lead.id,
                        recipientId: targetUser.id,
                        organisationId: org.id
                    }
                });

                reassignedCount++;
            }
        }

        // Save the persistent round-robin pointer
        lastAssignedIndex = nextIndex;

        console.log(`[ShufflerService] Force successfully reassigned ${reassignedCount} leads in Org: ${org.name}`);
        // Save the persistent round-robin pointer and manual run time
        const updatedConfig: any = { 
            ...(org.shufflerConfig as Record<string, any>), 
            lastShuffledAt: new Date().toISOString() 
        };
        
        if (lastAssignedIndex !== -1 && activeUsers[lastAssignedIndex]) {
            updatedConfig.lastAssignedUserId = activeUsers[lastAssignedIndex].id;
        }
        
        await prisma.organisation.update({
            where: { id: org.id },
            data: { shufflerConfig: updatedConfig }
        });

        return { success: true, message: `Shuffled ${reassignedCount} leads successfully.` };
    } catch (error) {
        console.error('[ShufflerService] Error during force shuffle execution:', error);
        return { success: false, message: 'Failed to execute shuffle. Check server logs.' };
    }
};
