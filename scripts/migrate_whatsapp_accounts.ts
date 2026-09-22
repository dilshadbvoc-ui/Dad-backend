import { PrismaClient } from '../src/generated/client';

const prisma = new PrismaClient();

async function migrate() {
    const organisations = await prisma.organisation.findMany({
        where: { isDeleted: false }
    });

    let count = 0;
    for (const org of organisations) {
        const integrations = org.integrations as any;
        if (!integrations || !integrations.whatsapp) continue;

        const wa = integrations.whatsapp;
        if (wa.connected && wa.displayPhoneNumber) {
            // Strip non-numeric characters for the stored phoneNumber if needed, or keep it as is
            const phone = wa.displayPhoneNumber.replace(/\D/g, ''); // just numbers e.g. 919778200669
            
            // Check if it already exists
            const existing = await prisma.whatsAppAccount.findFirst({
                where: { organisationId: org.id, phoneNumber: phone }
            });

            if (!existing) {
                // Find a fallback user to own the record if needed
                const admin = await prisma.user.findFirst({
                    where: { organisationId: org.id, role: { in: ['admin', 'org_admin'] } }
                });

                await prisma.whatsAppAccount.create({
                    data: {
                        organisationId: org.id,
                        phoneNumber: phone,
                        displayName: wa.verifiedName || phone,
                        provider: wa.provider || 'meta',
                        phoneNumberId: wa.phoneNumberId || '',
                        wabaId: wa.wabaId || '',
                        status: 'active',
                        isDefault: true,
                        createdById: admin?.id || '' // Assuming we have an admin
                    }
                });
                count++;
                console.log(`Migrated legacy WhatsApp account for org ${org.id}: ${phone}`);
            }
        }
    }

    console.log(`Migration complete. Migrated ${count} accounts.`);
}

migrate().catch(console.error).finally(() => prisma.$disconnect());
