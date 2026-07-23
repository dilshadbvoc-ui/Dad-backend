import prisma from '../config/prisma';

async function main() {
    const opp = await prisma.opportunity.findFirst({
        where: { name: { contains: 'Hyderali', mode: 'insensitive' }, isDeleted: false },
        include: {
            paymentRecords: true,
            emiSchedule: { include: { installments: { orderBy: { installmentNumber: 'asc' } } } },
            owner: { select: { email: true, firstName: true, lastName: true } }
        }
    });

    if (!opp) { console.log('NOT FOUND'); return; }

    console.log('--- Opportunity ---');
    console.log('Name:', opp.name);
    console.log('Amount:', opp.amount);
    console.log('Stage:', opp.stage);
    console.log('PaymentStatus:', opp.paymentStatus);
    console.log('Owner:', opp.owner?.email);

    console.log('\n--- PaymentRecords ---');
    if (opp.paymentRecords.length === 0) {
        console.log(' (none)');
    } else {
        opp.paymentRecords.forEach(r => console.log(` record: ₹${r.amount} | type=${r.paymentType} | date=${r.paymentDate}`));
    }
    console.log('PaymentRecords SUM: ₹' + opp.paymentRecords.reduce((s, r) => s + r.amount, 0));

    console.log('\n--- EMI Schedule ---');
    if (opp.emiSchedule) {
        console.log(' totalAmount:    ₹' + opp.emiSchedule.totalAmount);
        console.log(' paidAmount:     ₹' + opp.emiSchedule.paidAmount);
        console.log(' remainingAmount:₹' + opp.emiSchedule.remainingAmount);
        console.log(' status:', opp.emiSchedule.status);
        console.log(' installments:');
        opp.emiSchedule.installments.forEach(i =>
            console.log(`  #${i.installmentNumber}: ₹${i.amount} | ${i.status} | due=${i.dueDate}`)
        );
    } else {
        console.log(' (no EMI schedule)');
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
