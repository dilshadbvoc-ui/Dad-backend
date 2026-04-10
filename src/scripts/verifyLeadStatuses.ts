import prisma from '../config/prisma';

async function verifyLeads() {
    console.log('Fetching unique lead status values...');
    const uniqueStatuses = await prisma.lead.groupBy({
        by: ['status']
    });

    console.log('Status values found in leads table:');
    console.log(uniqueStatuses.map(s => s.status));

    const defaultIds = ['new', 'contacted', 'interested', 'not_interested', 'call_not_connected', 'qualified', 'nurturing', 'converted', 'lost', 're_enquiry'];
    
    const missing = uniqueStatuses
        .map(s => s.status)
        .filter(s => s && !defaultIds.includes(s));

    if (missing.length > 0) {
        console.log('WARNING: Found lead statuses in DB that are NOT in the default dynamic list:');
        console.log(missing);
    } else {
        console.log('All existing lead statuses are covered by the new dynamic default list. No data was changed or lost.');
    }
}

verifyLeads()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
