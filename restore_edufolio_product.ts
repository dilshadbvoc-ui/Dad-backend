import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function main() {
    const productId = '335b3917-221d-4edd-b9f8-407843557c39';
    
    console.log(`Restoring product: ${productId}`);
    
    const updated = await prisma.product.update({
        where: { id: productId },
        data: {
            isDeleted: false,
            deletedAt: null,
            isActive: true
        }
    });

    console.log('Product restored successfully:', updated);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
