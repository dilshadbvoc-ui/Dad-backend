
import 'dotenv/config';
import prisma from './config/prisma';

console.log('DB URL Present:', !!process.env.DATABASE_URL);

async function debugHierarchy() {
    try {
        console.log('--- Debugging Hierarchy ---');

        const users = await prisma.user.findMany({
            where: { isActive: true },
            include: {
                organisation: { select: { name: true } },
                reportsTo: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        position: true
                    }
                }
            }
        });

        console.log(`Found ${users.length} active users.`);

        const usersByOrg: Record<string, typeof users> = {};
        for (const u of users) {
            const orgId = u.organisationId || 'unknown';
            if (!usersByOrg[orgId]) usersByOrg[orgId] = [];
            usersByOrg[orgId].push(u);
        }

        for (const [orgId, orgUsers] of Object.entries(usersByOrg)) {
            console.log(`\nOrganisation: ${orgId}`);
            console.log(`Count: ${orgUsers.length}`);

            const userMap = new Map();
            orgUsers.forEach(u => userMap.set(u.id, u));

            let rootCount = 0;
            let connectedCount = 0;
            let missingManagerCount = 0;

            orgUsers.forEach(u => {
                if (u.reportsTo) {
                    if (userMap.has(u.reportsTo.id)) {
                        connectedCount++;
                    } else {
                        console.warn(`  [WARNING] User ${u.firstName} ${u.lastName} reports to ${u.reportsTo.id}, but manager is NOT in this list.`);
                        missingManagerCount++;
                    }
                } else {
                    rootCount++;
                    console.log(`  [ROOT] ${u.firstName} ${u.lastName} (${u.role}) has no manager.`);
                }
            });

            console.log(`  Roots: ${rootCount}, Connected: ${connectedCount}, Broken Links: ${missingManagerCount}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugHierarchy();
