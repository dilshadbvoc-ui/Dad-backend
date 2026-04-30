
import { PrismaClient } from './src/generated/client';
const prisma = new PrismaClient();

async function checkDuplicates() {
  console.log('--- Checking for duplicates in the same branch ---');
  
  // This query matches the logic I just put in the DuplicateLeadService
  const duplicates = await prisma.$queryRaw`
    SELECT phone, "branchId", "organisationId", COUNT(*) as count, 
           array_agg(id) as lead_ids,
           array_agg("firstName" || ' ' || "lastName") as names
    FROM "Lead"
    WHERE "isDeleted" = false
    GROUP BY phone, "branchId", "organisationId"
    HAVING COUNT(*) > 1
  `;

  console.log('Results:', JSON.stringify(duplicates, null, 2));
  
  if (Array.isArray(duplicates) && duplicates.length > 0) {
    console.log(`\nFound ${duplicates.length} sets of duplicates within the same branch.`);
  } else {
    console.log('\nNo duplicates found within the same branch! Logic is clean.');
  }

  await prisma.$disconnect();
}

checkDuplicates().catch(console.error);
