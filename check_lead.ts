import { PrismaClient } from './src/generated/client';
const prisma = new PrismaClient();

async function checkLead() {
  const id = '16c41d12-6eb4-48a1-a4b5-c40c370e356b';
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      organisation: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } }
    }
  });

  if (lead) {
    console.log('Lead found:', JSON.stringify(lead, null, 2));
    
    // Check roles
    if (lead.assignedTo?.role) {
        const role = await prisma.role.findFirst({ where: { OR: [{id: lead.assignedTo.role}, {roleKey: lead.assignedTo.role}] } });
        console.log('AssignedTo Role Info:', JSON.stringify(role, null, 2));
    }
     if (lead.createdBy?.role) {
        const role = await prisma.role.findFirst({ where: { OR: [{id: lead.createdBy.role}, {roleKey: lead.createdBy.role}] } });
        console.log('CreatedBy Role Info:', JSON.stringify(role, null, 2));
    }

  } else {
    console.log('Lead NOT found with ID:', id);
  }
}

checkLead()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
