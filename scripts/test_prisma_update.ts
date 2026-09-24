import { PrismaClient } from '../src/generated/client';
const prisma = new PrismaClient();

async function main() {
    const id = 'bbbd207f-7692-42e3-96bc-9fb38ff0fbe8';
    
    // First clear it
    await prisma.lead.update({ where: { id }, data: { nextFollowUp: null } });
    
    // Now try to update with a string
    try {
        const leadUpdates: any = {};
        leadUpdates.nextFollowUp = '2026-10-10T10:10:00.000Z'; // string
        
        const updated = await prisma.lead.update({
            where: { id },
            data: leadUpdates
        });
        console.log("Updated nextFollowUp type:", typeof updated.nextFollowUp, updated.nextFollowUp);
    } catch (e) {
        console.error("Failed:", e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
