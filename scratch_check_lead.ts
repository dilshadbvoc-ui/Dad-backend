import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function checkLead() {
  try {
    const leadId = 'c50e0d43-d1ba-41e9-86be-582de0f40474';
    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });
    
    if (lead) {
      console.log('Lead found:', JSON.stringify(lead, null, 2));
    } else {
      console.log('Lead NOT found in main table.');
      // Check if it's in the trash (if there is a trash table or soft delete)
      const deletedLead = await (prisma as any).lead.findFirst({
        where: { id: leadId, isDeleted: true }
      });
      if (deletedLead) {
        console.log('Lead found but IS DELETED (soft delete)');
      } else {
        console.log('Lead not found at all.');
      }
    }
  } catch (error) {
    console.error('Error checking lead:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLead();
