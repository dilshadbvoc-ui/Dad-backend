import prisma from '../config/prisma';

async function main() {
    const organisations = await prisma.organisation.findMany({
        include: {
            products: {
                where: { isOrgProduct: true }
            }
        }
    });

    console.log(`Checking ${organisations.length} organisations...`);

    for (const org of organisations) {
        if (org.products.length === 0) {
            console.log(`Creating custom product for: ${org.name}`);
            await prisma.product.create({
                data: {
                    name: org.name,
                    description: `Custom product for ${org.name}`,
                    basePrice: 0,
                    isCustom: true,
                    isOrgProduct: true,
                    organisationId: org.id,
                    sku: `CUSTOM-${org.id.slice(0, 8).toUpperCase()}`
                }
            });
        } else {
            console.log(`Custom product already exists for: ${org.name}`);
        }
    }

    console.log('Done!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
