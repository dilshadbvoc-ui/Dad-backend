import prisma from '../src/config/prisma';

function generateRandomPhone() {
    // Generate a random 10-digit number and append a timestamp part to ensure absolute uniqueness
    const randomPart = Math.floor(100000 + Math.random() * 900000).toString();
    const timePart = Date.now().toString().slice(-4);
    return '+91' + randomPart + timePart;
}

async function generateDemoLeads() {
    try {
        const userEmail = 'demo@crm.com';
        const user = await prisma.user.findUnique({
            where: { email: userEmail }
        });

        if (!user || !user.organisationId) {
            console.log(`User ${userEmail} or organization not found.`);
            return;
        }

        const orgId = user.organisationId;
        console.log(`Generating 12,000 leads for Org: ${orgId}...`);

        const statuses = [
            'new', 'contacted', 'interested', 'not_interested', 
            'call_not_connected', 'qualified', 'nurturing', 're_enquiry'
        ];
        
        const totalToGenerate = 12000;
        const chunkSize = 1000;

        for (let i = 0; i < totalToGenerate; i += chunkSize) {
            const leadsToInsert: any[] = [];
            for (let j = 0; j < chunkSize; j++) {
                const randStatus = statuses[Math.floor(Math.random() * statuses.length)];
                leadsToInsert.push({
                    firstName: `MassDemo_${i + j}`,
                    lastName: `Lead`,
                    email: `massdemo_${i + j}_${Date.now()}@testcrm.com`,
                    phone: generateRandomPhone() + (i + j).toString(), // Guarantee unique phone
                    organisationId: orgId,
                    status: randStatus,
                    createdById: user.id,
                    source: 'manual',
                    countryCode: 'IN',
                    country: 'India'
                });
            }

            await prisma.lead.createMany({
                data: leadsToInsert,
                skipDuplicates: true
            });
            console.log(`Inserted chunk ${Math.floor(i / chunkSize) + 1} / ${Math.ceil(totalToGenerate / chunkSize)}`);
        }
        
        console.log('Successfully generated 12,000 leads.');
    } catch (e) {
        console.error('Error generating leads:', e);
    } finally {
        await prisma.$disconnect();
    }
}

generateDemoLeads();
