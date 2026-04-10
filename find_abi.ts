import { PrismaClient } from './src/generated/client';
const prisma = new PrismaClient();

async function findAbi() {
  const email = 'abi640290@gmail.com';
  const leads = await prisma.lead.findMany({
    where: { 
      email: { contains: email, mode: 'insensitive' },
      isDeleted: false
    },
    include: {
      branch: true,
      assignedTo: true
    }
  });

  console.log(`Found ${leads.length} leads with email ${email}:`);
  leads.forEach(lead => {
    console.log('---');
    console.log('ID:', lead.id);
    console.log('Name:', lead.firstName, lead.lastName);
    console.log('Email:', lead.email);
    console.log('Phone:', lead.phone);
    console.log('Organisation ID:', lead.organisationId);
    console.log('Branch ID:', lead.branchId);
    console.log('Branch Name:', lead.branch?.name);
    console.log('Assigned To:', lead.assignedTo?.firstName, lead.assignedTo?.lastName);
    console.log('Source:', lead.source);
    console.log('Created At:', lead.createdAt);
  });
}

findAbi()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
