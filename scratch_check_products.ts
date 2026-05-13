import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function main() {
    const orgs = await prisma.organisation.findMany({
        select: { id: true, name: true }
    });

    console.log(`Checking ${orgs.length} organisations...`);

    for (const org of orgs) {
        const deletedCustom = await prisma.product.findMany({
            where: { organisationId: org.id, isOrgProduct: true, isDeleted: true },
            select: { id: true, name: true, isDeleted: true, deletedAt: true }
        });
        if (deletedCustom.length > 0) {
            console.log(`DELETED Custom Product found for ${org.name} (${org.id}):`, deletedCustom);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
