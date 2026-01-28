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
