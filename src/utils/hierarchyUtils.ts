import prisma from '../config/prisma';

/**
 * Recursively fetches all subordinate user IDs for a given user.
 * @param userId The ID of the manager/user.
 * @returns Array of user IDs including the manager themselves.
 */
export const getSubordinateIds = async (userId: string): Promise<string[]> => {
    // 1. Start with the user themselves
    const subordinateIds: string[] = [userId.toString()];

    // 2. Queue for BFS/DFS traversing
    const queue: string[] = [userId.toString()];

    while (queue.length > 0) {
        const currentManagerId = queue.shift();

        // Find direct reports using Prisma
        const directReports = await prisma.user.findMany({
            where: { reportsToId: currentManagerId },
            select: { id: true }
        });

        for (const report of directReports) {
            const reportId = report.id;
            // Avoid infinite loops if circular dependency exists
            if (!subordinateIds.includes(reportId)) {
                subordinateIds.push(reportId);
                queue.push(reportId);
            }
        }
    }

    return subordinateIds;
};

/**
 * Safely extracts the Organisation ID as a string from a user object.
 * Handles both Prisma objects (flat or included) and potential legacy inputs.
 */
/**
 * Returns all user IDs that _userId_ is allowed to see.
 * Combines:
 *  1. The user themselves + all subordinates (reportsTo chain via BFS)
 *  2. All users in branches the user manages (BranchManager relation)
 */
export const getVisibleUserIds = async (userId: string): Promise<string[]> => {
    // 1. Fetch user to check role and branch
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, branchId: true }
    });

    if (!user) return [userId];

    // 1. Subordinates via reporting chain
    const subordinateIds = await getSubordinateIds(userId);

    // 2. Users in managed branches (Explicitly assigned manager)
    const managedBranches = await prisma.branch.findMany({
        where: { managerId: userId, isDeleted: false },
        select: { id: true }
    });

    const managementBranchIds = managedBranches.map(b => b.id);

    if (managementBranchIds.length > 0) {
        const branchUsers = await prisma.user.findMany({
            where: { branchId: { in: managementBranchIds } },
            select: { id: true }
        });
        for (const u of branchUsers) {
            if (!subordinateIds.includes(u.id)) {
                subordinateIds.push(u.id);
            }
        }
    }

    return subordinateIds;
};

export const getOrgId = (user: any): string | null => {
    if (!user) return null;

    // Prisma style: user.organisationId (if flat) or user.organisation.id (if included)
    if (user.organisationId) return user.organisationId;
    if (user.organisation && user.organisation.id) return user.organisation.id;

    // Legacy Mongoose fallback (just in case)
    if (user.organisation && user.organisation._id) return user.organisation._id.toString();
    if (user.organisation) return user.organisation.toString();

    return null;
};
