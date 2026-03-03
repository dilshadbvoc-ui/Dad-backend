require('dotenv').config();
const { PrismaClient } = require('./dist/generated/client');

const prisma = new PrismaClient();

async function testEMIConversion() {
  try {
    // Find the partial payment opportunity
    const opp = await prisma.opportunity.findFirst({
      where: { paymentStatus: 'partial' },
      include: { emiSchedule: true, paymentRecords: true }
    });

    if (!opp) {
      console.log('No partial payment opportunities found');
      return;
    }

    console.log('Opportunity:', opp.name);
    console.log('Amount:', opp.amount);
    console.log('Payment Status:', opp.paymentStatus);
    console.log('Has EMI Schedule:', !!opp.emiSchedule);
    console.log('Payment Records:', opp.paymentRecords.length);

    // Calculate remaining amount
    const totalPaid = opp.paymentRecords.reduce((sum, p) => sum + p.amount, 0);
    const remaining = opp.amount - totalPaid;

    console.log('Total Paid:', totalPaid);
    console.log('Remaining:', remaining);

    if (remaining <= 0) {
      console.log('ERROR: Cannot convert to EMI with zero remaining balance');
      return;
    }

    if (opp.emiSchedule) {
      console.log('ERROR: EMI schedule already exists');
      return;
    }

    console.log('✅ Opportunity is ready for EMI conversion');
    console.log('You can convert', remaining, 'to EMI installments');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testEMIConversion();
