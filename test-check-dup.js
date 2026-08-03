const { PrismaClient } = require('./src/generated/client');
const { DuplicateLeadService } = require('./dist/services/duplicateLeadService.js');
const prisma = new PrismaClient();

async function main() {
    const orgId = '85cc3715-7f8d-4f22-b0b0-a40a502bc6fa';
    
    console.log("Checking duplicate for 8086351383:");
    const res1 = await DuplicateLeadService.checkDuplicate('8086351383', null, orgId, null);
    console.log("Res1:", res1);

    console.log("\nChecking duplicate for +918086351383:");
    const res2 = await DuplicateLeadService.checkDuplicate('+918086351383', null, orgId, null);
    console.log("Res2:", res2);

}

main().catch(console.error).finally(() => prisma.$disconnect());
