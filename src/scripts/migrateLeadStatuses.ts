import prisma from '../config/prisma';

async function migrateStatuses() {
  const defaultStatuses = [
    { id: 'new', label: 'New', color: '#3b82f6', isSystem: true, order: 0 },
    { id: 'contacted', label: 'Contacted', color: '#f59e0b', isSystem: true, order: 1 },
    { id: 'interested', label: 'Interested', color: '#10b981', isSystem: false, order: 2 },
    { id: 'not_interested', label: 'Not Interested', color: '#ef4444', isSystem: false, order: 3 },
    { id: 'call_not_connected', label: 'Call Not Connected', color: '#6b7280', isSystem: false, order: 4 },
    { id: 'qualified', label: 'Qualified', color: '#8b5cf6', isSystem: true, order: 5 },
    { id: 'nurturing', label: 'Nurturing', color: '#ec4899', isSystem: false, order: 6 },
    { id: 'converted', label: 'Converted', color: '#059669', isSystem: true, order: 7 },
    { id: 'lost', label: 'Lost', color: '#6b7280', isSystem: true, order: 8 },
    { id: 're_enquiry', label: 'Re-Enquiry', color: '#f97316', isSystem: true, order: 9 }
  ];

  console.log('Fetching all organisations...');
  const organisations = await prisma.organisation.findMany();

  console.log(`Updating ${organisations.length} organisations with default statuses...`);
  for (const org of organisations) {
    if (!org.leadStatuses) {
      await prisma.organisation.update({
        where: { id: org.id },
        data: { leadStatuses: defaultStatuses }
      });
      console.log(`Updated org: ${org.name}`);
    } else {
      console.log(`Org ${org.name} already has custom statuses. Skipping.`);
    }
  }

  console.log('Migration complete!');
}

migrateStatuses()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
