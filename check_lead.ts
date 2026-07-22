import prisma from './src/config/prisma';

async function main() {
    const lead = await prisma.lead.findFirst({
        where: {
            OR: [
                { phone: { contains: '919847580183' } },
                { phone: { contains: '9847580183' } }
            ]
        },
        include: {
            assignedTo: true
        }
    });

    if (!lead) {
        console.log("Lead not found.");
        return;
    }

    console.log("LEAD DETAILS:");
    console.log(lead);
    
    if (lead.assignedTo) {
        console.log("\nASSIGNED USER DETAILS:");
        console.log(`User ID: ${lead.assignedTo.id}`);
        console.log(`Name: ${lead.assignedTo.name}`);
        console.log(`Role: ${lead.assignedTo.role}`);
        console.log(`Is Active: ${lead.assignedTo.isActive}`);
        console.log(`Is Off Duty: ${lead.assignedTo.isOffDuty}`);
    } else {
        console.log("\nASSIGNED USER DETAILS: UNASSIGNED (null)");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
