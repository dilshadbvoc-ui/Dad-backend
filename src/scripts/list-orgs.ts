
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    } else {
        console.log(`Found ${orgs.length} organisations:`);
        orgs.forEach((org: any) => {
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
