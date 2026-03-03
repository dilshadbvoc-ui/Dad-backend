"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../generated/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Fetching all organisations...');
    const orgs = await prisma.organisation.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            // Count users to verify cascade delete impact (should be 0 for deleted orgs if soft delete, but hard delete removes them)
            _count: {
                select: { users: true }
            }
        }
    });
    if (orgs.length === 0) {
        console.log('No organisations found.');
    }
    else {
        console.log(`Found ${orgs.length} organisations:`);
        orgs.forEach((org) => {
            console.log(`- ${org.name} (ID: ${org.id}) [${org.status}] Contains ${org._count.users} users`);
        });
    }
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
